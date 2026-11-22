import { Pool } from "pg";
import { databaseCertificate } from "./db-certificate.ts";
import { DB_CONNECT_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS, DB_QUERY_TIMEOUT_MS } from "../../shared/timeouts.ts";

const host = process.env.PGHOST ?? "pg.matang.app";

export const dbConfig = {
    host,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "fnx",
    user: process.env.PGUSER ?? "fnx",
    password: process.env.PGPASSWORD,
    // The public EC2 database requires TLS. Trust its certificate and verify
    // the hostname; local/Docker overrides retain their own SSL settings.
    ssl: ["pg.matang.app", "db.fnx.matang.app"].includes(host)
        ? { ca: databaseCertificate, rejectUnauthorized: true }
        : undefined,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    // Server-side cancellation bounds SQL execution, including lock waits.
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
    // Also bound waiting for a response if the database connection stalls.
    query_timeout: DB_QUERY_TIMEOUT_MS,
};

export const pg = new Pool(dbConfig);
