import { z } from "zod";

export const ticketStatusSchema = z.enum(["open", "in_progress", "closed"]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

const titleError = "הכותרת צריכה להכיל 3–100 תווים, ללא רווחים בקצוות.";
export const newTicketSchema = z.object({
    title: z.string().trim().min(3, titleError).max(100, titleError),
    description: z.string().max(2_000, "התיאור יכול להכיל עד 2,000 תווים.").default(""),
}).strict();

export const ticketParamsSchema = z.object({
    id: z.coerce.number().int().min(1).max(2_147_483_647),
});
export const updateTicketSchema = z.object({ status: ticketStatusSchema }).strict();

export const ticketsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER / 10).default(1),
    pageSize: z.coerce.number().int().min(10).max(10).default(10),
    search: z.string().trim().default(""),
    status: z.preprocess(
        (value) => value === "" ? undefined : value,
        ticketStatusSchema.optional(),
    ),
});

export const ticketStatusEventSchema = z.object({
    id: z.number().int(),
    previousStatus: ticketStatusSchema,
    status: ticketStatusSchema,
});
export type TicketStatusEvent = z.infer<typeof ticketStatusEventSchema>;
export const ticketNotificationSchema = ticketStatusEventSchema.extend({
    type: z.literal("ticket-status-changed"),
});
export const heartbeatSchema = z.object({ healthy: z.boolean() });

export const ticketSchema = z.object({
    id: z.number().int().positive(),
    title: z.string(),
    description: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    status: ticketStatusSchema,
});
export type Ticket = z.infer<typeof ticketSchema>;
export const paginationSchema = z.object({
    page: z.number().int().positive(),
    pageSize: z.literal(10),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof paginationSchema>;
export const ticketsMessageSchema = z.object({
    type: z.literal("tickets"),
    items: z.array(ticketSchema),
    pagination: paginationSchema,
});
