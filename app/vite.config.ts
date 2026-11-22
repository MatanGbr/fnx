import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react-swc";

const envDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig(({ mode }) => ({
  envDir,
  // Expose only this flag, not database credentials or other server variables.
  define: {
    "import.meta.env.LOCAL_API": JSON.stringify(loadEnv(mode, envDir, "LOCAL_API").LOCAL_API ?? "false"),
  },
  plugins: [react()],
}));
