import { z } from "zod";
import * as schemas from "../../shared/tickets.ts";

// Compile once at module initialization, before any request or notification.
// Strict mode makes unsupported schemas fail at startup rather than silently
// falling back. Coerced fields retain Zod's parser inside the compiled object.
export const newTicketSchema = z.compile(schemas.newTicketSchema, { strict: true });
export const ticketParamsSchema = z.compile(schemas.ticketParamsSchema, { strict: true });
export const updateTicketSchema = z.compile(schemas.updateTicketSchema, { strict: true });
export const ticketsQuerySchema = z.compile(schemas.ticketsQuerySchema, { strict: true });
export const ticketNotificationSchema = z.compile(schemas.ticketNotificationSchema, { strict: true });
