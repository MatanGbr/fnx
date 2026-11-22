import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

test("connection monitor handles health, silence, offline, recovery and cleanup", async () => {
    const bundle = await build({
        entryPoints: [new URL("../../app/src/methods/api.tsx", import.meta.url).pathname],
        bundle: true, write: false, format: "esm", define: { "import.meta.env": "{}" },
    });
    const { api } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const originals = new Map(["window", "document", "navigator", "EventSource", "setInterval", "clearInterval"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const originalNow = Date.now;
    let now = 100_000;
    let tick;
    let cleared = false;
    const sources = [];
    class Source extends EventTarget {
        closed = false;
        constructor() { super(); sources.push(this); }
        close() { this.closed = true; }
        heartbeat(data) { this.dispatchEvent(new MessageEvent("heartbeat", { data: JSON.stringify(data) })); }
    }
    const window = new EventTarget();
    const document = new EventTarget();
    document.visibilityState = "visible";
    const navigator = { onLine: true };
    const mocks = { window, document, navigator, EventSource: Source, setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { cleared = true; } };
    try {
        for (const [key, value] of Object.entries(mocks)) Object.defineProperty(globalThis, key, { configurable: true, value });
        Date.now = () => now;
        const states = [];
        let resyncs = 0;
        const stop = api.events("events/tickets", { onChange() {}, onResync() { resyncs++; }, onConnection: state => states.push(state) });
        assert.equal(states.at(-1), "checking");
        sources[0].dispatchEvent(new Event("error"));
        assert.equal(states.at(-1), "unavailable", "API unavailable at startup is reported immediately");
        sources[0].heartbeat({ healthy: true });
        assert.equal(states.at(-1), "connected");
        sources[0].dispatchEvent(new Event("error"));
        assert.equal(states.at(-1), "unavailable", "API going down must invalidate the last healthy heartbeat immediately");
        sources[0].dispatchEvent(new Event("open"));
        sources[0].dispatchEvent(new Event("ready"));
        assert.equal(states.at(-1), "unavailable", "reopening alone does not confirm data health");
        sources[0].heartbeat({ healthy: false });
        assert.equal(states.at(-1), "unavailable");
        sources[0].heartbeat({ healthy: true });
        now += 36_000;
        sources[0].heartbeat({ healthy: "invalid" });
        tick();
        assert.equal(states.at(-1), "unavailable", "invalid heartbeats cannot reset freshness");
        navigator.onLine = false;
        window.dispatchEvent(new Event("offline"));
        assert.equal(states.at(-1), "offline");
        assert.equal(sources[0].closed, true);
        navigator.onLine = true;
        window.dispatchEvent(new Event("online"));
        assert.equal(states.at(-1), "checking");
        sources[2].heartbeat({ healthy: true });
        sources[2].dispatchEvent(new Event("ready"));
        assert.equal(states.at(-1), "connected");
        assert.equal(resyncs, 2);
        stop();
        assert.equal(cleared, true);
        assert.equal(sources[2].closed, true);
        window.dispatchEvent(new Event("online"));
        assert.equal(sources.length, 3);
    } finally {
        Date.now = originalNow;
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
