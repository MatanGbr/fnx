import { z } from "zod";
import * as schemas from "../../shared/tickets.ts";

export const newTicketSchema = z.compile(schemas.newTicketSchema, { strict: true });
export const ticketParamsSchema = z.compile(schemas.ticketParamsSchema, { strict: true });
export const updateTicketSchema = z.compile(schemas.updateTicketSchema, { strict: true });
export const ticketsQuerySchema = z.compile(schemas.ticketsQuerySchema, { strict: true });
export const ticketNotificationSchema = z.compile(schemas.ticketNotificationSchema, { strict: true });
