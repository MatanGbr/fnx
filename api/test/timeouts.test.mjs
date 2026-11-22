import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import Fastify from "fastify";
import { registerTimeoutErrors } from "../src/timeouts.ts";
import { dbConfig } from "../src/db.ts";
import { API_REQUEST_TIMEOUT_MS, CLIENT_REQUEST_TIMEOUT_MS } from "../../shared/timeouts.ts";

test("handler and DB timeouts return a consistent response, ordinary errors retain their status", async () => {
    const api = Fastify({ handlerTimeout: 20 });
    registerTimeoutErrors(api);
    let signal;
    api.get("/slow", async (request) => {
        signal = request.signal;
        await delay(60);
        if (request.signal.aborted) return;
        return { ok: true };
    });
    const errors = [
        Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
        new Error("Query read timeout"),
        new Error("timeout exceeded when trying to connect"),
        new Error("Connection terminated due to connection timeout"),
    ];
    errors.forEach((error, i) => api.get(`/db/${i}`, async () => { throw error; }));
    api.get("/invalid", async () => { throw Object.assign(new Error("Invalid input"), { statusCode: 400 }); });
    api.get("/long-lived", { handlerTimeout: 100 }, async () => { await delay(40); return { ok: true }; });
    try {
        for (const url of ["/slow", ...errors.map((_, i) => `/db/${i}`)]) {
            const response = await api.inject(url);
            assert.equal(response.statusCode, 504, url);
            assert.equal(response.json().code, "REQUEST_TIMEOUT");
            assert.match(response.json().message, /זמן רב מדי/);
        }
        assert.equal(signal.aborted, true);
        assert.equal((await api.inject("/invalid")).statusCode, 400);
        assert.equal((await api.inject("/long-lived")).statusCode, 200);
    } finally { await api.close(); }
    assert.ok(dbConfig.statement_timeout > 0);
    assert.ok(dbConfig.statement_timeout < dbConfig.query_timeout);
    assert.ok(dbConfig.connectionTimeoutMillis + dbConfig.query_timeout < API_REQUEST_TIMEOUT_MS);
    assert.ok(API_REQUEST_TIMEOUT_MS < CLIENT_REQUEST_TIMEOUT_MS);
});

test("client deadlines cover headers, JSON bodies and streams, preserve caller cancellation and HTTP errors", async () => {
    const bundle = await build({
        entryPoints: [new URL("../../app/src/methods/api.tsx", import.meta.url).pathname],
        bundle: true, write: false, format: "esm", define: { "import.meta.env": "{}" },
    });
    const { api, ApiTimeoutError, ApiError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const originalFetch = globalThis.fetch;
    let lastSignal;
    const timeout = { timeoutMs: 15 };
    const stall = (_url, { signal }) => {
        lastSignal = signal;
        return new Promise((_resolve, reject) => {
            if (signal.aborted) reject(signal.reason);
            else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
    };
    try {
        globalThis.fetch = stall;
        await assert.rejects(api.get("tickets", timeout), ApiTimeoutError);
        await assert.rejects(api.post("ticket/new", { title: "abc" }, timeout), ApiTimeoutError);
        await assert.rejects(api.patch("tickets/1", { status: "closed" }, timeout), ApiTimeoutError);

        const caller = new AbortController();
        const pending = api.get("tickets", { signal: caller.signal, timeoutMs: 1000 });
        caller.abort();
        await assert.rejects(pending, (error) => error.name === "AbortError" && !(error instanceof ApiTimeoutError));

        globalThis.fetch = async (_url, { signal }) => new Response(new ReadableStream({
            start(controller) { signal.addEventListener("abort", () => controller.error(signal.reason), { once: true }); },
        }));
        await assert.rejects(api.get("tickets", timeout), ApiTimeoutError);
        const stream = await api.get("tickets", { ...timeout, stream: true });
        await assert.rejects(async () => { for await (const _ of stream) {} }, ApiTimeoutError);

        globalThis.fetch = async () => new Response(null, { status: 504 });
        await assert.rejects(api.get("tickets", timeout), ApiTimeoutError);
        globalThis.fetch = async () => Response.json({ errors: { fieldErrors: { title: ["Invalid"] } } }, { status: 400 });
        await assert.rejects(api.post("ticket/new", {}, timeout), (error) => error instanceof ApiError && error.status === 400 && error.fieldErrors.title[0] === "Invalid");

        globalThis.fetch = async (_url, { signal }) => { lastSignal = signal; return Response.json({ ok: true }); };
        assert.deepEqual(await api.get("tickets", timeout), { ok: true });
        await delay(25);
        assert.equal(lastSignal.aborted, false, "successful responses clear their timers");

        let cancelled = false;
        globalThis.fetch = async (_url, { signal }) => {
            lastSignal = signal;
            return new Response(new ReadableStream({
                start(controller) { controller.enqueue(new TextEncoder().encode('{"ok":true}\n')); },
                cancel() { cancelled = true; },
            }));
        };
        for await (const item of await api.get("tickets", { ...timeout, stream: true })) {
            assert.deepEqual(item, { ok: true });
            break;
        }
        await delay(25);
        assert.equal(cancelled, true);
        assert.equal(lastSignal.aborted, false, "stopping a stream clears its deadline");
    } finally { globalThis.fetch = originalFetch; }
});
