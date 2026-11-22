# fnx API

## Shared database

By default the API connects to `pg.matang.app:5432`, database `fnx`, user
`fnx`, without a password. Both queries and the ticket notification listener
use this configuration. TLS verifies the server hostname and the public
certificate bundled in `src/db-certificate.ts`.

On the hosted server, `fnx` can connect only to database `fnx` and can select,
insert, update, and delete rows in the existing `public.tickets` table. The
non-login role `fnx_owner` owns the database and its objects. The application
role cannot create or alter objects, drop tables or databases, truncate tables,
grant access, or assume an administrative role. Schema changes require an
administrator; these restrictions are separate from the local Docker setup.

`ssh fnx@pg.matang.app` opens a confined psql session. Run commands inside
that session; commands passed after the SSH address are ignored. Shell
escapes, program pipes, and writing files from that session are blocked.

## Environment selection

Set `LOCAL_API=true` to have the frontend call `http://localhost:3000` instead
of `https://api.fnx.matang.app`. Set `LOCAL_DB=true` to have the API connect to
a local database instead of production. These flags are independent, and only
the exact value `true` enables local services. Unset or `false` uses production,
including in Docker Compose.

```sh
export LOCAL_API=true
npm run dev
```

For a local database too, run these before starting development:

```sh
export LOCAL_DB=true
docker compose up -d --wait db
```

You can also put the flags in `.env` at the repository root (see `.env.example`).
Regular development and Compose both read it; shell variables take precedence.
Restart dev servers after changes. `LOCAL_API` is embedded in frontend builds,
so rebuild to change a deployed frontend's target.

`VITE_API_URL` overrides the API URL for requests and SSE. `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` override database defaults; empty values
are treated as unset. Remove stale overrides when switching targets. Queries
and the notification listener share the same database configuration.

The local database defaults to `127.0.0.1:5433`, database/user `fnx`, and password
`fnx-local`. `FNX_DB_PORT` and `FNX_DB_PASSWORD` customize the local Compose
database's host port and password. Compose connects its API to `db:5432`.
Never put secrets in `VITE_*` variables, which are public frontend values.

For a built standalone API, load the file from the repository root with
`node --env-file=.env api/dist/server.mjs`.

The production database certificate is valid for one year from November 22,
2026. Renew it on the server and update `src/db-certificate.ts` together before
it expires. The certificate is public; its private key stays on EC2.

## Docker

For a database preloaded with the existing tables and all 25 tickets, run
`docker compose up -d --wait db` from the repository root. Start it before the
local API so PostgreSQL is ready:

```sh
docker compose up -d --wait db
LOCAL_DB=true docker compose --profile api up -d --build --wait api
```

For a containerized API using the production database (no local DB required):

```sh
LOCAL_DB=false docker compose --profile api up -d --build --wait api
```

The API is available at `http://localhost:3000`. See
[database setup](sql/README.md) for plain-SQL installation and connection details.

Build and run without Compose from the repository root:

```sh
docker build -f api/Dockerfile -t fnx-api .
# Production database:
docker run --rm -p 3000:3000 -e LOCAL_DB=false fnx-api
# Local database published on the host by Compose:
docker run --rm -p 3000:3000 -e LOCAL_DB=true \
  -e FNX_DB_LOCAL_HOST=host.docker.internal fnx-api
```

`host.docker.internal` reaches the host on Docker Desktop. On Linux, add
`--add-host=host.docker.internal:host-gateway`. Pass custom passwords and other
overrides at runtime with `-e` or `--env-file .env`. `PORT` defaults to `3000`;
update the container port mapping if overridden. The image runs the bundled
HTTP server as a non-root user. The Lambda bundle remains at `api/dist/index.mjs`.

## Search

Ticket title searches use Fuse.js for typo-tolerant matching, ranked by relevance
before pagination by default (`fuzzy=true`). Set `fuzzy=false` on `GET /tickets`
for case-insensitive literal substring matching in newest-first order; typos are
not expanded and characters such as `%` and `_` are literal. Other values for
`fuzzy` are rejected. The status filter applies before matching. Empty searches
retain newest-first SQL pagination. Nonempty searches load all tickets matching
the status filter into API memory, so search cost grows with the dataset.

## Request deadlines

Timeout defaults live in `shared/timeouts.ts`:

- Browser API requests: 20 seconds, including JSON/NDJSON body consumption.
- Fastify route lifecycle: 15 seconds; incoming request body: 20 seconds.
- PostgreSQL pool acquisition/connection: 3 seconds.
- PostgreSQL statement execution: 8 seconds (`statement_timeout` cancels SQL
  on the database server); driver response timeout: 10 seconds.
- SSE retains its 60-second lifetime with a separate 65-second route deadline.

Server and database timeouts return HTTP 504 with `code: "REQUEST_TIMEOUT"`.
The browser distinguishes timeouts from caller cancellation, clears loading
state, and retains the draft. Writes are never retried automatically: a lost
response does not prove the write failed, so the UI asks users to check the list
before trying again.

On Lambda, configure the platform timeout above the route deadlines (at least
70 seconds for the SSE route); an earlier platform cutoff prevents the API from
returning its own timeout response. This setting is not changed by the build.

Run isolated validation, connection, and timeout tests without a database:

```sh
node --test api/test/validation.test.mjs api/test/connection.test.mjs api/test/timeouts.test.mjs
```

These tests simulate database timeout errors and verify pool timeout settings;
they do not execute a timed-out statement against a live PostgreSQL server.

Run locally from the repository root:

```sh
npm run dev --workspace=api
curl http://localhost:3000/
curl -N http://localhost:3000/events/tickets
```

`GET /` returns the route list as JSON. `GET /events/tickets` streams ticket
updates and health heartbeats for up to 60 seconds. Clients reconnect when
the stream ends.

## Lambda

The `@fastify/aws-lambda` adapter uses `payloadAsStream: true`. Its exported
`handler` is wrapped with the AWS Node.js runtime's `awslambda.streamifyResponse`.
Response status and headers are forwarded with `HttpResponseStream.from`, and
`pipeline` handles backpressure and ends the response before the handler returns.
Only `src/server.ts` starts an HTTP listener for local development.

Build a self-contained deployment zip (requires `zip`):

```sh
npm run package --workspace=api
```

Upload `api/dist/lambda.zip` to a Node.js 22.x or newer Lambda function and
set its handler to **`index.handler`**. The archive contains `index.mjs`
at its root, with dependencies bundled. Set the function timeout to at least
70 seconds to accommodate the ticket event stream.

The build emits ESM and adds a `createRequire(import.meta.url)` shim for bundled
CommonJS dependencies that load Node built-ins. Renaming a CommonJS bundle to
`.mjs` does not convert it to ESM.

For a Function URL, select **RESPONSE_STREAM** under Configuration → Function URL
→ Edit → Additional settings → Invoke mode. For an existing URL, the equivalent is:

```sh
aws lambda update-function-url-config \
  --function-name YOUR_FUNCTION_NAME \
  --invoke-mode RESPONSE_STREAM
```

This changes invocation mode only; retain your existing authentication settings.
If using API Gateway, configure a REST API proxy integration that supports response
streaming; an existing buffered integration will not deliver incremental chunks.

Verify through your deployed endpoint (include authentication if required):

```sh
curl -N https://YOUR_FUNCTION_URL/events/tickets
```

Use `events/test.json` for a JSON smoke invocation and `events/stream.json` for the
SSE route, setting the event paths and route keys to `/` and `/events/tickets`,
respectively. A Lambda console test can exercise the route, but use the streaming
Function URL or `InvokeWithResponseStream` to verify incremental delivery.
The streaming handler writes response bytes, rather than returning the old
`{statusCode, body}` proxy envelope.

Run the bundled-handler tests:

```sh
npm test --workspace=api
```

Tests use a small AWS runtime shim and the real bundled adapter/routes. They check
JSON responses, warm invocations, 404s, incremental SSE delivery, heartbeats, and
clean stream completion. AWS transport and URL configuration require a deployed test.

Streams are bounded by the function and integration timeouts. A client disconnect
at AWS's edge does not automatically stop Lambda execution. Keep streaming jobs
bounded; ticket streams close after 60 seconds.

The existing authentication routes are unfinished and still require their
database and authentication implementation before use.

References: [Fastify adapter streaming](https://github.com/fastify/aws-lambda-fastify#support-for-response-streaming-payloadasstream),
[AWS streaming handlers](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-write-functions.html),
[Function URL streaming mode](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-invoke-furls.html).
