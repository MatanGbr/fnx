import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

function database(overrides) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key === "LOCAL_DB" || key.startsWith("PG") || key.startsWith("FNX_DB_")) delete env[key];
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
        'import { dbConfig } from "./src/db.ts"; console.log(JSON.stringify(dbConfig))'],
        { cwd: new URL("../", import.meta.url), env: { ...env, ...overrides }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

test("database targets work on host and container with explicit overrides", () => {
    const local = database({ LOCAL_DB: "true" });
    assert.equal(local.host, "127.0.0.1");
    assert.equal(local.port, 5433);
    assert.equal(local.password, "fnx-local");
    assert.equal(local.ssl, undefined);
    const container = { FNX_DB_LOCAL_HOST: "db", FNX_DB_PORT: "5432", PGHOST: "", PGPORT: "", PGPASSWORD: "" };
    assert.equal(database({ ...container, LOCAL_DB: "true" }).host, "db");
    for (const overrides of [{}, { LOCAL_DB: "false" }, { ...container, LOCAL_DB: "false" }]) {
        const production = database(overrides);
        assert.equal(production.host, "pg.matang.app");
        assert.equal(production.port, 5432);
        assert.equal(production.password, undefined);
        assert.equal(production.ssl.rejectUnauthorized, true);
    }
    const custom = database({ LOCAL_DB: "false", PGHOST: "custom", PGPORT: "1234", PGUSER: "user", PGPASSWORD: "password", PGDATABASE: "other" });
    assert.equal(custom.host, "custom");
    assert.equal(custom.port, 1234);
    assert.equal(custom.database, "other");
    assert.equal(custom.user, "user");
    assert.equal(custom.password, "password");
    assert.equal(database({ LOCAL_DB: "false" }).host, "pg.matang.app");
});

test("frontend target overrides build mode and URL overrides target for requests", async () => {
    const original = globalThis.fetch;
    try {
        for (const [env, expected] of [
            [{}, "https://api.fnx.matang.app"],
            [{ PROD: true }, "https://api.fnx.matang.app"],
            [{ PROD: true, LOCAL_API: "true" }, "http://localhost:3000"],
            [{ PROD: false, LOCAL_API: "false" }, "https://api.fnx.matang.app"],
            [{ LOCAL_API: "false", VITE_API_URL: "https://custom.example/" }, "https://custom.example"],
        ]) {
            const bundle = await build({ entryPoints: [new URL("../../app/src/methods/api.tsx", import.meta.url).pathname], bundle: true, write: false, format: "esm", define: { "import.meta.env": JSON.stringify(env) } });
            const { api } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
            globalThis.fetch = async (url) => { assert.equal(String(url), `${expected}/test`); return Response.json({ ok: true }); };
            await api.get("test");
        }
    } finally { globalThis.fetch = original; }
});
