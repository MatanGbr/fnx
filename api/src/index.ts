import FastifyClient from "fastify";
import cors from "@fastify/cors";
import { PassThrough, } from "node:stream";

// import date from "dayjs";
// import { randomBytes } from "node:crypto"
import { z, object as schema } from "zod";

import { setTimeout as delay } from "node:timers/promises";


import { randomBytes } from "node:crypto";
import { ticketsRoutes } from "./tickets.ts";
import { ticketEventsRoutes } from "./events.ts";
import { registerTimeoutErrors } from "./timeouts.ts";
import { API_REQUEST_TIMEOUT_MS } from "../../shared/timeouts.ts";


// import {
//     serializerCompiler,
//     validatorCompiler,
//     type ZodTypeProvider
// } from 'fastify-type-provider-zod';

// import pkg from "../package.json" with {type: "json"}
// import "zod/compile";
// import { db } from "@zgrader/db";


export const api = FastifyClient({ logger: true, handlerTimeout: API_REQUEST_TIMEOUT_MS, requestTimeout: 20_000 })
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
registerTimeoutErrors(api);
// // .withTypeProvider<ZodTypeProvider>();
// // api.setValidatorCompiler(validatorCompiler);
// // api.setSerializerCompiler(serializerCompiler);

// // export const env = (key: string) => process.env[key]?.toString() || ``;
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
// // const zString = (min = 2, max = 100) => z.string().min(min).max(max)

// api.post(`/users/new`, {
//     schema: {
//         // body: z.object({
//         //     email: z.email(),
//         //     password: zString(15),
//         //     name: zString().optional(),
//         //     products: z.array(z.enum([`zgrader`, `campus`])).optional(),
//         //     organization: zString().optional()
//         // })
//     }
// }, async (req, rep) => {

//     const { email, password, name, products, organization } = req.body;

//     // const dbCollection = (await db(`auth`)).collection(`users`);

//     // if (await dbCollection.findOne({ email })) {
//     //     return rep.er(`User ${email} already exists`);
//     // }
//     // await dbCollection.insertOne({ email, name, user: randomBytes(5).toString(`hex`), hash: (await hash(password)), products, organization, accountStatus: "trial", created: date().toISOString() });

//     return rep.ok(`User ${email} created successfully`);
// });


// api.post(`/login`, {
//     schema: {
//         // body: z.object({
//         //     email: z.email(),
//         //     password: zString(15)
//         // })
//     }
// }, async (req, rep) => {

//     const { email, password } = req.body;

//     if (await verify(user.hash, password)) {
//         const identity = { user: user.user, email: user.email, name: user.name };
//     }
//     return rep.status(401).er(`Authentication failed`);
// });






declare module 'fastify' {
    interface FastifyContextConfig {
        streaming?: boolean;
    }
    interface FastifyReply {
        ok(data: unknown, message?: string): FastifyReply;
        er(message: string | {}): FastifyReply;
    }
}
