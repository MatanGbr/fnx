import { Client } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import type { z } from "zod";
import { ticketNotificationSchema } from "./validation.ts";
import { dbConfig } from "./db.ts";


type Handlers = {
    onChange: (payload: z.infer<typeof ticketNotificationSchema>) => void;
    onConnected: () => void;
    onDisconnected: () => void;
    onHeartbeat: () => void;
    onError: (error: unknown) => void;
};

export function startTicketListener(handlers: Handlers) {
    const controller = new AbortController();
    const { signal } = controller;
    let activeClient: Client | undefined;

    async function listen() {
        while (!signal.aborted) {
            const client = new Client({
                ...dbConfig,
                application_name: "fnx-ticket-listener",
                connectionTimeoutMillis: 5_000,
                keepAlive: true,
                query_timeout: 5_000,
            });
            activeClient = client;
            let heartbeat: ReturnType<typeof setInterval> | undefined;
            let probing = false;
            let disconnected!: () => void;
            const ended = new Promise<void>((resolve) => { disconnected = resolve; });
            client.on("error", (error) => {
                if (!signal.aborted) handlers.onError(error);
                disconnected();
            });
            client.once("end", disconnected);
            client.on("notification", (message) => {
                if (signal.aborted || message.channel !== "ticket_status_changed" || !message.payload) return;
                try {
                    handlers.onChange(ticketNotificationSchema.parse(JSON.parse(message.payload)));
                } catch (error) {
                    handlers.onError(error);
                }
            });

            try {
                await client.connect();
                if (signal.aborted) return;
                await client.query("LISTEN ticket_status_changed");
                if (signal.aborted) return;
                handlers.onConnected();
                heartbeat = setInterval(async () => {
                    if (probing || signal.aborted) return;
                    probing = true;
                    try {
                        await client.query("SELECT 1");
                        if (!signal.aborted) handlers.onHeartbeat();
                    } catch (error) {
                        if (!signal.aborted) handlers.onError(error);
                        handlers.onDisconnected();
                        disconnected();
                    } finally {
                        probing = false;
                    }
                }, 15_000);
                await ended;
            } catch (error) {
                if (!signal.aborted) handlers.onError(error);
            } finally {
                clearInterval(heartbeat);
                handlers.onDisconnected();
                await client.end().catch(() => {});
                activeClient = undefined;
            }
            if (!signal.aborted) {
                await delay(2_000, undefined, { signal }).catch(() => {});
            }
        }
    }

    const task = listen();
    return async () => {
        controller.abort();
        await activeClient?.end().catch(() => {});
        await task;
    };
}
