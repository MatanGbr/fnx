import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { after, test } from "node:test";

globalThis.awslambda = {
  streamifyResponse: (handler) => handler,
  HttpResponseStream: {
    from(stream, metadata) {
      stream.metadata = metadata;
      return stream;
    },
  },
};
const { handler, api } = await import("../dist/index.mjs");
after(() => api.close());
const event = JSON.parse(await readFile(new URL("../events/test.json", import.meta.url), "utf8"));
event.rawPath = event.requestContext.http.path = "/";
event.routeKey = event.requestContext.routeKey = "GET /";
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
    assert.ok(JSON.parse(output.body()).Routes.includes("GET /tickets (streaming: keep-alive, no-buffer)"));
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

test("SSE delivers its first event before completion and ends cleanly", { timeout: 70000 }, async () => {
  const streamingEvent = JSON.parse(await readFile(new URL("../events/stream.json", import.meta.url), "utf8"));
  streamingEvent.rawPath = streamingEvent.requestContext.http.path = "/events/tickets";
  streamingEvent.routeKey = streamingEvent.requestContext.routeKey = "GET /events/tickets";
  let resolveFirst;
  const firstChunk = new Promise((resolve) => { resolveFirst = resolve; });
  const output = sink(resolveFirst);
  let completed = false;
  const invocation = handler(streamingEvent, output.stream, { ...context }).then(() => { completed = true; });
  const first = await firstChunk;
  assert.match(first, /: connected/);
  assert.equal(completed, false);
  assert.doesNotMatch(output.body(), /event: done/);
  assert.equal(output.stream.metadata.statusCode, 200);
  assert.match(output.stream.metadata.headers["content-type"], /text\/event-stream/);
  await invocation;
  const heartbeats = output.body().trim().split("\n\n")
    .filter((event) => event.startsWith("event: heartbeat"));
  assert.ok(heartbeats.length >= 2);
  for (const heartbeat of heartbeats) {
    assert.equal(typeof JSON.parse(heartbeat.split("data: ")[1]).healthy, "boolean");
  }
  assert.equal(output.stream.writableFinished, true);
});
