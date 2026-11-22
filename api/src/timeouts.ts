import type { FastifyInstance, FastifyError } from "fastify";
import { TIMEOUT_MESSAGE } from "../../shared/timeouts.ts";

export function registerTimeoutErrors(api: FastifyInstance) {
    api.setErrorHandler<FastifyError>((error, request, reply) => {
        const timeout = error.code === "FST_ERR_HANDLER_TIMEOUT" ||
            error.code === "57014" || // PostgreSQL statement_timeout
            error.code === "ETIMEDOUT" ||
            ["Query read timeout", "timeout exceeded when trying to connect",
                "Connection terminated due to connection timeout", "timeout expired"].includes(error.message);
        if (timeout) {
            request.log.warn({ err: error }, "API request timed out");
            return reply.code(504).send({ code: "REQUEST_TIMEOUT", message: TIMEOUT_MESSAGE });
        }
        return reply.send(error);
    });
}
