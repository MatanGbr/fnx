
import Fuse from "fuse.js";
import type { Ticket } from "../../shared/tickets.ts";
import { PassThrough } from "node:stream";
import { newTicketSchema, ticketParamsSchema, updateTicketSchema, ticketsQuerySchema } from "./validation.ts";
import type { FastifyPluginAsync } from "fastify";
import { pg } from "./db.ts";

export const ticketsRoutes: FastifyPluginAsync =
    async (api) => {

        api.post("/ticket/new", async (req, rep) => {
            const body = newTicketSchema.safeParse(req.body);

            if (!body.success) {
                return rep.code(400).send({
                    message: "פרטי הפנייה אינם תקינים",
                    errors: body.error.flatten(),
                });
            }

            const { rows: [ticket] } = await pg.query(
                `INSERT INTO public.tickets (title, description, status)
                 VALUES ($1, $2, 'open')
                 RETURNING id, title, description, status, created_at`,
                [body.data.title, body.data.description],
            );

            return rep.code(201).ok(ticket);
        });

        api.patch("/tickets/:id", async (req, rep) => {
            const params = ticketParamsSchema.safeParse(req.params);
            const body = updateTicketSchema.safeParse(req.body);

            if (!params.success || !body.success) {
                return rep.code(400).send({ message: "מזהה פנייה או סטטוס לא תקינים" });
            }

            const { rows: [ticket] } = await pg.query(
                `UPDATE public.tickets SET status = $1 WHERE id = $2
                 RETURNING id, title, description, status, created_at`,
                [body.data.status, params.data.id],
            );
            if (!ticket) return rep.code(404).send({ message: "הפנייה לא נמצאה" });

            return rep.ok(ticket);
        });

        api.get("/tickets", { config: { streaming: true } }, async (req, rep) => {
            const query = ticketsQuerySchema.safeParse(req.query);

            if (!query.success) {
                return rep.status(400).er(query.error.flatten());
            }

            const { page, pageSize, search, status } = query.data;
            const offset = (page - 1) * pageSize;

            const params = [status ?? null];
            const where = "WHERE ($1::text IS NULL OR status = $1)";
            let items: Ticket[];
            let total: number;

            if (search) {
                const { rows } = await pg.query<Ticket>(
                    `SELECT id, title, description, status, created_at
                     FROM tickets ${where}
                     ORDER BY created_at DESC, id DESC`,
                    params,
                );
                const matches = new Fuse(rows, {
                    keys: ["title"],
                    threshold: 0.35,
                    ignoreLocation: true,
                }).search(search);
                total = matches.length;
                items = matches.slice(offset, offset + pageSize).map(({ item }) => item);
            } else {
                const [itemsResult, countResult] = await Promise.all([
                    pg.query<Ticket>(
                        `SELECT id, title, description, status, created_at
                         FROM tickets ${where}
                         ORDER BY created_at DESC, id DESC
                         LIMIT $2 OFFSET $3`,
                        [...params, pageSize, offset],
                    ),
                    pg.query<{ total: number }>(
                        `SELECT COUNT(*)::int AS total FROM tickets ${where}`,
                        params,
                    ),
                ]);
                items = itemsResult.rows;
                total = countResult.rows[0].total;
            }

            const pagination = {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            };

            const streamer = new PassThrough();

            const writeStream = (val: unknown) =>
                streamer.write(`${JSON.stringify(val)}\n`);

            rep
                .type("application/x-ndjson; charset=utf-8")
                .header("Cache-Control", "no-cache, no-transform")
                .header("X-Accel-Buffering", "no")
                .send(streamer);

            writeStream({
                type: "tickets",
                items,
                pagination,
            });

            streamer.end();

            return rep;
        });

    }
