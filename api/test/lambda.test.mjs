import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { test } from "node:test";

// Simulate only AWS's runtime wrapper; the bundled adapter and routes are real.
globalThis.awslambda = {
  streamifyResponse: (handler) => handler,
  HttpResponseStream: {
    from(stream, metadata) {
      stream.metadata = metadata;
      return stream;
    },
  },
};
const { handler } = await import("../dist/index.mjs");
const event = JSON.parse(await readFile(new URL("../events/test.json", import.meta.url), "utf8"));
const context = { awsRequestId: "local-test", getRemainingTimeInMillis: () => 30000 };

function sink(onChunk = () => {}) {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      onChunk(chunk.toString());
      callback();
    },
  });
  return { stream, body: () => chunks.join("") };
}

test("streaming handler preserves JSON responses across warm invocations", async () => {
  for (let invocation = 0; invocation < 2; invocation++) {
    const output = sink();
    await handler(structuredClone(event), output.stream, { ...context });
    assert.equal(output.stream.metadata.statusCode, 200);
    assert.match(output.stream.metadata.headers["content-type"], /application\/json/);
    assert.equal(output.stream.writableFinished, true);
    assert.deepEqual(JSON.parse(output.body()), {
      status: "success", code: 200, message: "fnx API is running",
    });
  }
});

test("streaming handler preserves 404 responses", async () => {
  const missing = structuredClone(event);
  missing.rawPath = "/missing";
  missing.routeKey = missing.requestContext.routeKey = "GET /missing";
  missing.requestContext.http.path = "/missing";
  const output = sink();
  await handler(missing, output.stream, { ...context });
  assert.equal(output.stream.metadata.statusCode, 404);
  assert.equal(JSON.parse(output.body()).statusCode, 404);
});

test("SSE delivers its first event before completion and ends cleanly", { timeout: 5000 }, async () => {
  const streamingEvent = JSON.parse(await readFile(new URL("../events/stream.json", import.meta.url), "utf8"));
  let resolveFirst;
  const firstChunk = new Promise((resolve) => { resolveFirst = resolve; });
  const output = sink(resolveFirst);
  let completed = false;
  const invocation = handler(streamingEvent, output.stream, { ...context }).then(() => { completed = true; });
  const first = await firstChunk;
  assert.match(first, /event: start/);
  assert.equal(completed, false);
  assert.doesNotMatch(output.body(), /event: done/);
  assert.equal(output.stream.metadata.statusCode, 200);
  assert.match(output.stream.metadata.headers["content-type"], /text\/event-stream/);
  await invocation;
  const events = output.body().trim().split("\n\n");
  assert.deepEqual(events.map((event) => event.split("\n")[0]), [
    "event: start", "event: progress", "event: progress", "event: progress", "event: done",
  ]);
  assert.deepEqual(events.slice(1, 4).map((event) => JSON.parse(event.split("data: ")[1]).step), [1, 2, 3]);
  assert.equal(output.stream.writableFinished, true);
});
