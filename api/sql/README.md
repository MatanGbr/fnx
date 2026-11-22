# PostgreSQL setup

Both installation paths use these same UTF-8 SQL files, in order:

1. `000_schema.sql`: tickets table, identity sequence, constraints, and index.
2. `001_ticket_status_notifications.sql`: status notification function and trigger.
3. `002_ticket_data.sql`: all 26 records exported from the local `fnx` database on
   2026-11-22, preserving IDs, timestamps, statuses, and sequence state (next ID: 133).

Use PostgreSQL 18 to match the source database and Docker image. These are plain
SQL files and can also be executed in a SQL editor. They do not create a database,
roles, or credentials, and contain no dependencies on the source database owner.

## Docker

From the repository root:

```sh
docker compose up -d --wait db
docker compose exec db psql -U fnx -d fnx -c 'SELECT count(*) FROM public.tickets;'
```

The expected count is 26. Connect at `127.0.0.1:5433`, database/user `fnx`,
password `fnx-local`. Port 5433 avoids colliding with a local PostgreSQL server.
Override with `FNX_DB_PORT` and `FNX_DB_PASSWORD` before starting the stack.
The default password is for local development.

Run the existing API on the host against this database:

```sh
PGHOST=127.0.0.1 PGPORT=5433 PGDATABASE=fnx PGUSER=fnx PGPASSWORD=fnx-local npm run dev --workspace=api
```

Or run both the database and API in Docker:

```sh
docker compose --profile api up -d --build --wait
```

The API is available at `http://localhost:3000`.

The named volume persists data across restarts and `docker compose down`.
PostgreSQL runs the initialization files only when the volume is empty; editing
SQL files or restarting containers does not reapply them. To intentionally erase
all data in this Compose stack and restore the snapshot:

```sh
docker compose --profile api down -v
docker compose up -d --wait db
```

## Existing PostgreSQL server (no Docker)

Choose an empty database, or a database without `public.tickets`. The connected
role needs permission to create tables, functions, and triggers in `public`.
Use your own connection settings and password mechanism:

```sh
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=fnx PGUSER=your_user
# Only if the target database does not exist yet:
createdb

psql -X -v ON_ERROR_STOP=1 \
  -f api/sql/000_schema.sql \
  -f api/sql/001_ticket_status_notifications.sql \
  -f api/sql/002_ticket_data.sql

psql -X -c 'SELECT count(*) FROM public.tickets;'
```

Run commands from the repository root. In a SQL editor, execute the files in the
same order and stop on errors. Each file has its own transaction. Bootstrap is
one-time: existing tables or duplicate IDs cause an error, and existing records
are never overwritten. If a file fails, fix the cause and resume from that file;
do not rerun already committed schema/data files. The notification migration
alone can be reapplied to an existing compatible tickets table.
