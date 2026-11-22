import awsLambdaFastify from "@fastify/aws-lambda";
import { pipeline } from "node:stream/promises";
import type { Writable } from "node:stream";
import { api } from "./index.ts";
export { api };

const proxy = awsLambdaFastify(api, { payloadAsStream: true });

type StreamingHandler = (
  event: Parameters<typeof proxy>[0],
  responseStream: Writable,
  context: Parameters<typeof proxy>[1],
) => Promise<void>;
declare const awslambda: {
  streamifyResponse(handler: StreamingHandler): StreamingHandler;
  HttpResponseStream: {
    from(stream: Writable, metadata: Awaited<ReturnType<typeof proxy>>["meta"]): Writable;
  };
};

export const handler = awslambda.streamifyResponse(async (event, responseStream, context) => {
  const { meta, stream } = await proxy(event, context);
  await pipeline(stream, awslambda.HttpResponseStream.from(responseStream, meta));
});
