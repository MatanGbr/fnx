import type { FastifyPluginAsync } from "fastify";
import { PassThrough } from "node:stream";
import { startTicketListener } from "./ticket-listener.ts";

export const ticketEventsRoutes: FastifyPluginAsync = async (api) => {
    const clients = new Set<PassThrough>();
    let listening = false;
    let lastVerified = 0;
    const health = () => ({ healthy: listening && Date.now() - lastVerified < 25_000 });
    let stopListener: (() => Promise<void>) | undefined;

    const write = (stream: PassThrough, message: string) => {
        if (!stream.destroyed && !stream.writableEnded && !stream.write(message)) {
            stream.destroy();
        }
    };
    const send = (stream: PassThrough, event: string, data: unknown) => {
        write(stream, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const broadcast = (event: string, data: unknown) => {
        for (const client of clients) send(client, event, data);
    };

    api.addHook("onReady", async () => {
        stopListener = startTicketListener({
            onChange: (payload) => broadcast("ticket-status-changed", payload),
            onConnected: () => {
                listening = true;
                lastVerified = Date.now();
                broadcast("heartbeat", health());
                broadcast("resync", {});
            },
            onHeartbeat: () => {
                lastVerified = Date.now();
                broadcast("heartbeat", health());
            },
            onDisconnected: () => {
                listening = false;
                broadcast("heartbeat", health());
            },
            onError: (error) => api.log.error({ err: error }, "Ticket listener error"),
        });
    });

    api.addHook("preClose", async () => {
        for (const client of clients) client.destroy();
        clients.clear();
        await stopListener?.();
    });

    api.get("/events/tickets", { handlerTimeout: 65_000, config: { streaming: true } }, async (_req, rep) => {
        const streamer = new PassThrough();
        const heartbeat = setInterval(() => send(streamer, "heartbeat", health()), 15_000);
        const lifetime = setTimeout(() => streamer.end(), 60_000);
        const cleanup = () => {
            clearInterval(heartbeat);
            clearTimeout(lifetime);
            clients.delete(streamer);
            rep.raw.off("close", disconnect);
        };
        const disconnect = () => {
            cleanup();
            streamer.destroy();
        };
        streamer.once("close", cleanup);
        rep.raw.once("close", disconnect);
        clients.add(streamer);

        rep.type("text/event-stream; charset=utf-8")
            .header("Cache-Control", "no-cache, no-transform")
            .header("X-Accel-Buffering", "no")
            .send(streamer);
        write(streamer, "retry: 2000\n: connected\n\n");
        send(streamer, "heartbeat", health());
        if (listening) send(streamer, "ready", {});
        return rep;
    });
};
