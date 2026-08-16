import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["fixtures/**", "node_modules/**", "dist/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
