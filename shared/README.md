# Ticket validation

`tickets.ts` owns the Zod schemas and inferred ticket types used by both apps.
Keep validation rules here so browser and server accept the same inputs.

- Frontend: import from `app/src/validation.ts`. It installs `zod/compile`
  before constructing the schemas. Compilation happens lazily on the first
  synchronous parse and the compiled parser is reused thereafter.
- Backend: import from `api/src/validation.ts`. It calls `z.compile` once at
  module initialization with `strict: true`, before requests are handled.
  Compilation happens at server startup, not during the build. Coercion uses
  Zod's standard field parser inside the compiled object.

See [Zod compilation](https://zod.dev/compile) for compiler behavior and supported
schemas. The frontend compiler is bundled with the app and uses `new Function`;
Zod's global compilation mode respects `jitless` environments.

Run the isolated validation and connection checks without a database:

```sh
node --test api/test/validation.test.mjs api/test/connection.test.mjs
```

These checks cover eager/lazy compilation, matching results and errors,
normalization, invalid HTTP inputs being rejected before database access,
and malformed stream messages.
