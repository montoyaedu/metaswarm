// Vitest config for the pack-system module (WU0 scaffolding).
//
// Coverage thresholds are sourced from `pack-system.coverage-thresholds.json`
// at the repo root (separate file to avoid collision with the existing
// orchestrator-project `.coverage-thresholds.json`). The numbers below MUST
// match that JSON; CI lint in a later WU may assert this equivalence.
//
// Coverage provider: v8 per plan §4.2 ("vitest c8" reads as the v8 provider
// shipped as `@vitest/coverage-v8`).
//
// The contract-coverage reporter referenced in plan §4.2 lands in WU8 and is
// NOT wired here (the `coverage-contract/` directory holds a placeholder
// README only).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

interface ThresholdsFile {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

const thresholdsPath = resolve(repoRoot, "pack-system.coverage-thresholds.json");
const thresholds = JSON.parse(
  readFileSync(thresholdsPath, "utf-8"),
) as ThresholdsFile;

export default defineConfig({
  test: {
    root: repoRoot,
    include: ["tests/pack-system/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: resolve(repoRoot, "coverage"),
      include: ["src/pack-system/**/*.ts"],
      exclude: ["src/pack-system/**/*.d.ts", "src/pack-system/**/index.ts"],
      thresholds: {
        lines: thresholds.lines,
        branches: thresholds.branches,
        functions: thresholds.functions,
        statements: thresholds.statements,
      },
    },
  },
});
