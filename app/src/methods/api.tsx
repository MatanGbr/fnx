import { heartbeatSchema, ticketStatusEventSchema, type TicketStatusEvent } from "../validation";
export type { TicketStatusEvent } from "../validation";

import { CLIENT_REQUEST_TIMEOUT_MS, TIMEOUT_MESSAGE } from "../../../shared/timeouts";
export { WRITE_TIMEOUT_MESSAGE } from "../../../shared/timeouts";

const localApi = import.meta.env.LOCAL_API === "true";
const baseUrl = import.meta.env.VITE_API_URL
    || (localApi ? "http://localhost:3000" : "https://api.fnx.matang.app");

type Options = {
    stream?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
    params?: Record<string, string | number | boolean>;
};

type Get = {
    <T>(path: string, options: Options & { stream: true }): Promise<AsyncIterable<T>>;
    <T>(path: string, options?: Options & { stream?: false }): Promise<T>;
};

export class ApiTimeoutError extends Error {
    constructor() {
        super(TIMEOUT_MESSAGE);
        this.name = "ApiTimeoutError";
    }
}

async function request<T>(
    path: string,
    init: RequestInit,
    { stream = false, signal, params = {}, timeoutMs = CLIENT_REQUEST_TIMEOUT_MS }: Options = {},
): Promise<T | AsyncIterable<T>> {
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(new ApiTimeoutError()), timeoutMs);
    let streaming = false;
    try {
        const url = new URL(`${baseUrl.replace(/\/$/, "")}/${path}`);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
        const response = await fetch(url, { ...init, signal: combined });
        if (!response.ok) {
            if (response.status === 408 || response.status === 504) {
                await response.body?.cancel();
                throw new ApiTimeoutError();
            }
            const details = await response.json().catch(() => null);
            combined.throwIfAborted();
            if (details?.code === "REQUEST_TIMEOUT") throw new ApiTimeoutError();
            const fields: Record<string, string[]> = {};
            for (const [name, messages] of Object.entries(details?.errors?.fieldErrors ?? {})) {
                if (Array.isArray(messages) && messages.every((message) => typeof message === "string")) fields[name] = messages;
            }
            throw new ApiError(response.status, fields);
        }
        if (!stream) return await response.json();
        if (!response.body) throw new Error("Stream unavailable");
        const body = response.body;
        streaming = true;
        return (async function* () {
            try {
                combined.throwIfAborted();
                for await (const item of parseStream<T>(body)) {
                    combined.throwIfAborted();
                    yield item;
                }
            } catch (error) {
                throw combined.aborted ? combined.reason : error;
            } finally {
                clearTimeout(timer);
            }
        })();
    } catch (error) {
        throw combined.aborted ? combined.reason : error;
    } finally {
        if (!streaming) clearTimeout(timer);
    }
}

const get = (<T,>(path: string, options?: Options) => request<T>(path, {}, options)) as Get;

async function* parseStream<T>(
    body: ReadableStream<Uint8Array<ArrayBuffer>>
): AsyncGenerator<T> {
    const reader = body
        .pipeThrough(new TextDecoderStream())
        .getReader();

    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;

            let index: number;
            while ((index = buffer.indexOf("\n")) !== -1) {
                const line = buffer.slice(0, index).trim();
                buffer = buffer.slice(index + 1);

                if (line) yield JSON.parse(line) as T;
            }
        }

        if (buffer.trim()) yield JSON.parse(buffer) as T;
    } finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}

type EventsOptions = {
    onChange: (change: TicketStatusEvent) => void;
    onResync: () => void;
    onError?: (event: Event) => void;
    onConnection?: (state: "checking" | "connected" | "unavailable" | "offline") => void;
};

export class ApiError extends Error {
    status: number;
    fieldErrors: Record<string, string[]>;

    constructor(status: number, fieldErrors: Record<string, string[]> = {}) {
        super(`HTTP ${status}`);
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

const post = <T,>(path: string, body: unknown, options: Pick<Options, "signal" | "timeoutMs"> = {}) =>
    request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, options) as Promise<T>;

const patch = <T,>(path: string, body: unknown, options: Pick<Options, "signal" | "timeoutMs"> = {}) =>
    request<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, options) as Promise<T>;

const events = (
    path: string,
    { onChange, onResync, onError, onConnection }: EventsOptions
): (() => void) => {
    let source: EventSource | undefined;
    let lastHeartbeat = 0;
    let startedAt = Date.now();
    const report = (state: "checking" | "connected" | "unavailable") =>
        onConnection?.(navigator.onLine ? state : "offline");
    const handleHeartbeat = (event: MessageEvent<string>) => {
        try {
            const result = heartbeatSchema.safeParse(JSON.parse(event.data));
            if (!result.success) return;
            const value = result.data;
            lastHeartbeat = Date.now();
            report(value.healthy ? "connected" : "unavailable");
        } catch { }
    };
    const handleError = (event: Event) => {
        report("unavailable");
        onError?.(event);
    };

    const handleChange = (event: MessageEvent<string>) => {
        let change: TicketStatusEvent;
        try {
            const result = ticketStatusEventSchema.safeParse(JSON.parse(event.data));
            if (!result.success) return;
            change = result.data;
        } catch {
            return;
        }
        onChange(change);
    };

    const connect = () => {
        source?.close();
        source = undefined;
        lastHeartbeat = 0;
        startedAt = Date.now();
        report("checking");
        if (!navigator.onLine) return;
        source = new EventSource(`${baseUrl.replace(/\/$/, "")}/${path}`);
        source.addEventListener("ready", onResync);
        source.addEventListener("resync", onResync);
        source.addEventListener("ticket-status-changed", handleChange);
        source.addEventListener("heartbeat", handleHeartbeat);
        source.addEventListener("error", handleError);
    };
    connect();
    const watchdog = setInterval(() => {
        if (navigator.onLine && Date.now() - (lastHeartbeat || startedAt) > 35_000) {
            connect();
            report("unavailable");
        }
    }, 1_000);
    const onVisibility = () => {
        if (document.visibilityState === "visible" && Date.now() - (lastHeartbeat || startedAt) > 35_000) connect();
    };
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
        clearInterval(watchdog);
        window.removeEventListener("online", connect);
        window.removeEventListener("offline", connect);
        document.removeEventListener("visibilitychange", onVisibility);
        source?.close();
    };
};

export const api = { get, post, patch, events };
