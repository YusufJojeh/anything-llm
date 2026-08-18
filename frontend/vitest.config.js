import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "url";

/**
 * Frontend test runner.
 *
 * Kept as a separate config from `vite.config.js` so the app build is not
 * carrying test settings, and scoped to the Yusuf OS feature only — Gate G
 * establishes a test baseline for the code it added without retroactively
 * putting the rest of the monorepo under a runner it has never had.
 *
 * Vitest rather than a second Jest setup: Vite is already the bundler, so this
 * reuses the same transform pipeline and the same `@` alias with no Babel
 * configuration of its own.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/features/yusufOS/__tests__/setup.js"],
    include: ["src/features/yusufOS/__tests__/**/*.test.{js,jsx}"],
  },
});
