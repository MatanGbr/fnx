import FastifyClient from "fastify";
import cors from "@fastify/cors";
import { PassThrough, } from "node:stream";

import { z, object as schema } from "zod";

import { setTimeout as delay } from "node:timers/promises";

import { randomBytes } from "node:crypto";
import { registerRootRoute } from "./routes/root.ts";
import { ticketsRoutes } from "./routes/tickets.ts";
import { ticketEventsRoutes } from "./routes/events.ts";
import { registerTimeoutErrors } from "./timeouts.ts";
import { API_REQUEST_TIMEOUT_MS } from "../../shared/timeouts.ts";

export const api = FastifyClient({ logger: true, handlerTimeout: API_REQUEST_TIMEOUT_MS, requestTimeout: 20_000 })
registerRootRoute(api);
registerTimeoutErrors(api);

api.register(cors, { methods: ["GET", "HEAD", "POST", "PATCH", "OPTIONS"] });

api.decorateReply('er', function (message: string | {}) {
    return this.send({ status: "error", code: 400, message, error: randomBytes(5).toString(`hex`) })
});

api.decorateReply("ok", function (
    data: unknown,
    message?: string
) {
    return this.send({
        data,
        ...(message ? { message } : {})
    });
});

api.register(ticketsRoutes);
api.register(ticketEventsRoutes);

declare module 'fastify' {
    interface FastifyContextConfig {
        streaming?: boolean;
    }
    interface FastifyReply {
        ok(data: unknown, message?: string): FastifyReply;
        er(message: string | {}): FastifyReply;
    }
}
