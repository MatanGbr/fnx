import { Pool } from "pg";
import { databaseCertificate } from "./db-certificate.ts";
import { DB_CONNECT_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS, DB_QUERY_TIMEOUT_MS } from "../../shared/timeouts.ts";

const local = process.env.LOCAL_DB === "true";
const host = process.env.PGHOST || (local ? (process.env.FNX_DB_LOCAL_HOST || "127.0.0.1") : "pg.matang.app");

export const dbConfig = {
    host,
    port: Number(process.env.PGPORT || (local ? (process.env.FNX_DB_PORT || 5433) : 5432)),
    database: process.env.PGDATABASE || "fnx",
    user: process.env.PGUSER || "fnx",
    password: process.env.PGPASSWORD || (local ? (process.env.FNX_DB_PASSWORD || "fnx-local") : undefined),
    ssl: ["pg.matang.app", "db.fnx.matang.app"].includes(host)
        ? { ca: databaseCertificate, rejectUnauthorized: true }
        : undefined,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
};

export const pg = new Pool({ ...dbConfig, max: 2 });
