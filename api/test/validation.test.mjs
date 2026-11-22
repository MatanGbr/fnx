import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import Fastify from "fastify";
import * as shared from "../../shared/tickets.ts";
import * as compiled from "../src/validation.ts";
import { ticketsRoutes } from "../src/tickets.ts";
import { pg } from "../src/db.ts";

const cases = {
    newTicketSchema: [
        { title: "  valid title  " }, { title: "abc", description: "" },
        { title: "x".repeat(100), description: "x".repeat(2000) },
        {}, null, { title: "  " }, { title: 123 }, { title: "ab" },
        { title: "x".repeat(101) }, { title: "abc", description: "x".repeat(2001) },
        { title: "abc", extra: true },
    ],
    ticketParamsSchema: [{ id: "1" }, { id: "2147483647" }, { id: "0" }, { id: "2147483648" }, { id: "1.5" }, { id: "no" }, {}],
    updateTicketSchema: [{ status: "open" }, { status: "in_progress" }, { status: "closed" }, { status: "other" }, {}, { status: "open", extra: true }],
    ticketsQuerySchema: [{ fuzzy: "true" }, { fuzzy: "false" }, { fuzzy: false }, { fuzzy: "invalid" }, {}, { page: "2", pageSize: "10", search: "  abc  ", status: "" }, { status: "closed" }, { page: "0" }, { page: "1.5" }, { pageSize: "11" }, { status: "other" }, { page: "Infinity" }],
    ticketNotificationSchema: [
        { type: "ticket-status-changed", id: 1, previousStatus: "open", status: "closed" },
        { type: "ticket-status-changed", id: 1, previousStatus: "bad", status: "closed" },
        { type: "other", id: 1, previousStatus: "open", status: "closed" }, null,
    ],
};

function result(schema, input) {
    const parsed = schema.safeParse(input);
    return parsed.success ? { data: parsed.data } : { issues: parsed.error.issues };
}

test("backend schemas are eagerly compiled and preserve shared validation results", () => {
    for (const [name, inputs] of Object.entries(cases)) {
        assert.notEqual(compiled[name], shared[name], `${name} must be compiled at import`);
        for (const input of inputs) assert.deepEqual(result(compiled[name], input), result(shared[name], input), name);
    }
    assert.deepEqual(shared.newTicketSchema.parse({ title: "  abc  " }), { title: "abc", description: "" });
    assert.deepEqual(shared.ticketsQuerySchema.parse({ status: "" }), { page: 1, pageSize: 10, search: "", fuzzy: true, status: undefined });
});

test("frontend compiles lazily once and agrees with backend schemas", async () => {
    const bundle = await build({
        entryPoints: [new URL("../../app/src/validation.ts", import.meta.url).pathname],
        bundle: true, write: false, format: "esm", platform: "browser",
    });
    const frontend = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const before = frontend.newTicketSchema._zod.run;
    frontend.newTicketSchema.parse({ title: "valid" });
    const after = frontend.newTicketSchema._zod.run;
    assert.notEqual(before, after, "first parse replaces the lazy shim");
    frontend.newTicketSchema.parse({ title: "another" });
    assert.equal(frontend.newTicketSchema._zod.run, after, "subsequent parses reuse compilation");
    for (const [name, inputs] of Object.entries(cases)) {
        for (const input of inputs) assert.deepEqual(result(frontend[name], input), result(compiled[name], input), name);
    }
    assert.equal(frontend.heartbeatSchema.safeParse({ healthy: "true" }).success, false);
    assert.equal(frontend.ticketStatusEventSchema.safeParse({ id: 1, status: "bad", previousStatus: "open" }).success, false);
    assert.equal(frontend.ticketsMessageSchema.safeParse({ type: "tickets", items: [{}], pagination: {} }).success, false);
    assert.equal(frontend.ticketsMessageSchema.safeParse({
        type: "tickets", items: [{ id: 1, title: "abc", description: null, status: "open", created_at: "2026-11-22T10:00:00.000Z" }],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }).success, true);
});

test("routes reject invalid requests before DB access and pass normalized inputs to DB", async () => {
    const app = Fastify();
    app.decorateReply("er", function (message) { return this.send({ message }); });
    app.decorateReply("ok", function (data) { return this.send({ data }); });
    app.register(ticketsRoutes);
    const originalQuery = pg.query;
    const calls = [];
    pg.query = async (sql, params) => {
        calls.push(params);
        return { rows: [{ id: 1, title: params[0], description: params[1], status: "open" }] };
    };
    try {
        const invalid = [
            ["POST", "/ticket/new", { title: "  " }],
            ["POST", "/ticket/new", { title: "valid", extra: true }],
            ["POST", "/ticket/new", { title: "valid", description: "x".repeat(2001) }],
            ["PATCH", "/tickets/0", { status: "open" }],
            ["PATCH", "/tickets/1", { status: "bad" }],
            ["GET", "/tickets?page=0"],
            ["GET", "/tickets?pageSize=11"],
            ["GET", "/tickets?status=bad"],
            ["GET", "/tickets?fuzzy=invalid"],
        ];
        for (const [method, url, payload] of invalid) {
            const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
            assert.equal(response.statusCode, 400, `${method} ${url}`);
        }
        assert.equal(calls.length, 0);
        const response = await app.inject({ method: "POST", url: "/ticket/new", payload: { title: "  valid  " } });
        assert.equal(response.statusCode, 201);
        assert.deepEqual(calls, [["valid", ""]]);
        const patch = await app.inject({ method: "PATCH", url: "/tickets/12", payload: { status: "closed" } });
        assert.equal(patch.statusCode, 200);
        assert.deepEqual(calls[1], ["closed", 12]);
    } finally {
        pg.query = originalQuery;
        await app.close();
    }
});
