import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { ticketsRoutes } from "../src/tickets.ts";
import { pg } from "../src/db.ts";

test("fuzzy title search ranks matches before pagination and respects status", async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
        id: 12 - index, title: "תקלה במחשב", description: "", status: "open",
        created_at: "2026-11-22T10:00:00.000Z",
    }));
    rows.push({ ...rows[0], id: 13, title: "תקלה במחשבים" });
    rows.push({ ...rows[0], id: 14, title: "הזמנת ציוד", description: "תקלה במחשב" });
    rows.push({ ...rows[0], id: 15, status: "closed" });
    const app = Fastify();
    app.register(ticketsRoutes);
    const originalQuery = pg.query;
    pg.query = async (sql, [status, limit, offset]) => {
        const filtered = rows.filter((row) => !status || row.status === status);
        if (sql.includes("COUNT(*)")) return { rows: [{ total: filtered.length }] };
        return { rows: limit === undefined ? filtered : filtered.slice(offset, offset + limit) };
    };
    const search = async (query) => {
        const response = await app.inject(`/tickets?${new URLSearchParams(query)}`);
        assert.equal(response.statusCode, 200);
        return response.json();
    };
    try {
        const first = await search({ search: "תקלה במחשב", status: "open" });
        assert.equal(first.items.length, 10);
        assert.deepEqual(first.items.map(({ id }) => id), rows.slice(0, 10).map(({ id }) => id));
        assert.equal(first.pagination.total, 13);
        assert.equal(first.pagination.totalPages, 2);
        const second = await search({ search: "תקלה במחשב", status: "open", page: "2" });
        assert.deepEqual(second.items.map(({ id }) => id), [2, 1, 13]);
        const typo = await search({ search: "תקלה במחשהב", status: "open" });
        assert.ok(typo.items.some(({ id }) => id === 12));
        assert.ok(typo.items.every(({ status }) => status === "open"));
        const closed = await search({ search: "תקלה במחשב", status: "closed" });
        assert.deepEqual(closed.items.map(({ id }) => id), [15]);
        const missing = await search({ search: "zzzzzzzz" });
        assert.deepEqual(missing.items, []);
        assert.equal(missing.pagination.total, 0);
        const empty = await search({ search: "   ", status: "open", page: "2" });
        assert.deepEqual(empty.items.map(({ id }) => id), [2, 1, 13, 14]);
        assert.equal(empty.pagination.total, 14);
    } finally {
        pg.query = originalQuery;
        await app.close();
    }
});
