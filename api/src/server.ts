import { api } from "./index.ts";

try {
  await api.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
} catch (error) {
  api.log.error(error);
  process.exitCode = 1;
}
