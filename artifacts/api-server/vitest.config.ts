import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@workspace/neurobrane": resolve(__dirname, "../../lib/neurobrane/src/index.ts"),
      "@workspace/db": resolve(__dirname, "../../lib/db/src/index.ts"),
    },
  },
});
