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

`ssh fnx@pg.matang.app` opens a confined psql session; a command such as
`ssh fnx@pg.matang.app '\dt'` runs directly. Shell escapes, program pipes, and
writing files from that session are blocked.

Run `npm run dev --workspace=api` to use this database. `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` can override the defaults; the Docker
Compose configuration continues to use its local database. Remove any old
PostgreSQL environment overrides when deploying against the shared database.

The server certificate is valid for one year from November 22, 2026. Renew it
on the server and update `src/db-certificate.ts` together before it expires.
The certificate is public; its private key stays on EC2.

Frontend production builds use `https://api.fnx.matang.app`; development uses
`http://localhost:3000`. `VITE_API_URL` overrides either default.

## Docker

For a database preloaded with the existing tables and all 25 tickets, run
`docker compose up -d --wait db` from the repository root. To include the API,
run `docker compose --profile api up -d --build --wait`.
See [database setup](sql/README.md) for connection details and the equivalent
plain-SQL installation on your own PostgreSQL server.

Build from the repository root (the API uses the shared workspace):

```sh
docker build -f api/Dockerfile -t fnx-api .
docker run --rm -p 3000:3000 \
  -e PGHOST=host.docker.internal \
  -e PGDATABASE=fnx -e PGUSER=matan \
  fnx-api
```

`host.docker.internal` reaches the host database on Docker Desktop. On Linux,
add `--add-host=host.docker.internal:host-gateway`, or set `PGHOST` to a reachable
database hostname. PostgreSQL must accept connections from the container.
Set `PGPORT` (default `5432`) and `PGPASSWORD` when required; pass secrets at
runtime, for example with `--env-file`. `PORT` defaults to `3000`; update the
container port mapping if you override it.

The image runs the bundled HTTP server as a non-root user. Build tools and source
files stay in the build stage. The existing Lambda bundle remains available at
`api/dist/index.mjs` when building locally.

## Search

Ticket title searches use Fuse.js for typo-tolerant matching, ranked by relevance
before pagination. The status filter applies before matching. Empty searches
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
curl http://localhost:3000/test
curl -N http://localhost:3000/test/stream
```

`GET /test` returns JSON. `GET /test/stream` returns Server-Sent Events (SSE):
`start`, three `progress` events spaced 500 ms apart, then `done` and EOF.
Clients using `EventSource` should call `close()` on `done` to avoid reconnecting.

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
10 seconds for the demo (allowing for cold starts).

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
curl -N https://YOUR_FUNCTION_URL/test/stream
```

Use `events/test.json` for a JSON smoke invocation and `events/stream.json` for the
SSE route. A Lambda console test can exercise the route, but use the streaming
Function URL or `InvokeWithResponseStream` to verify incremental delivery.
The streaming handler writes response bytes, rather than returning the old
`{statusCode, body}` proxy envelope.

The `/test` response body remains:

```json
{"status":"success","code":200,"message":"fnx API is running"}
```

Run the bundled-handler tests:

```sh
npm test --workspace=api
```

Tests use a small AWS runtime shim and the real bundled adapter/routes. They check
JSON responses, warm invocations, 404s, incremental SSE delivery, event order, and
clean stream completion. AWS transport and URL configuration require a deployed test.

Streams are bounded by the function and integration timeouts. A client disconnect
at AWS's edge does not automatically stop Lambda execution. Keep streaming jobs
bounded; the demo completes after approximately 1.5 seconds.

The existing authentication routes are unfinished and still require their
database and authentication implementation before use.

References: [Fastify adapter streaming](https://github.com/fastify/aws-lambda-fastify#support-for-response-streaming-payloadasstream),
[AWS streaming handlers](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-write-functions.html),
[Function URL streaming mode](https://docs.aws.amazon.com/lambda/latest/dg/config-rs-invoke-furls.html).
