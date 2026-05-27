import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    // Tests share a single Postgres DB; run sequentially to avoid cross-test interference.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    server: {
      deps: {
        // Inline gigamusic packages and stripe so module mocks (vi.mock) apply to
        // their transitive imports. Without this, vite externalizes deps and the
        // route handler's `new Stripe()` bypasses the test's mock.
        inline: [/^@gigamusic\//, "stripe"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    // Force a single copy of next/react so vi.mock("next/server") and friends
    // apply across both this app and inlined @gigamusic/* packages.
    dedupe: ["next", "react", "react-dom", "stripe"],
  },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
});
