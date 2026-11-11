import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests unitarios de lógica pura (sin DB ni red). El alias "@" replica el de
// tsconfig para que los imports del proyecto resuelvan igual en los tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
