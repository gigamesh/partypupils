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
    conditions: ["source", "import", "module", "browser", "default"],
  },
  // SSR-side conditions for vitest 4: the test runner loads modules in SSR
  // mode, and conditions for that path live under `ssr.resolve.conditions`
  // separately from `resolve.conditions`. Prepend `source` to the Node defaults
  // (`node, import, require, default`) so registry-installed @gigamusic/*
  // packages resolve to their shipped `src/index.ts` rather than
  // `dist/index.js` (dist's transpiled `import "next/server"` can't be
  // resolved by Node through pnpm's isolated peer-dep node_modules).
  ssr: {
    resolve: {
      conditions: ["source"],
    },
  },
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
});
