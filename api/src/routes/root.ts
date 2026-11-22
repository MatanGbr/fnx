import type { FastifyInstance } from "fastify";

export function registerRootRoute(api: FastifyInstance) {
    const routes = new Set<string>();
    api.addHook("onRoute", (route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        for (const method of methods) {
            const streaming = route.config?.streaming && method !== "HEAD"
                ? " (streaming: keep-alive, no-buffer)"
                : "";
            routes.add(`${method} ${route.url}${streaming}`);
        }
    });
    api.get("/", async () => ({ Routes: [...routes].sort() }));
}
