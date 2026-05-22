// Diagnostic envelope construction, validation, and serialization.
//
// Spec: `docs/adr/0002-schema-validation-language.md` §"Diagnostic envelope".
// This module wraps the JSON Schema (loaded from
// `schemas/diagnostic-envelope.schema.json`) with a typed factory and
// formatters. Three formatters cover the v0 surface: text (human-readable
// single-block rendering), json (canonical JSON), yaml (line-per-field shape
// for CLI output without pulling a YAML dep at runtime).
//
// Anchor convention (plan §4 WU1):
//   docs_url ∈ { `<adr-file>#invariant-NN`, `<adr-file>#section-X`, full URI }.
//   - `docs/principles.md#invariant-22` — derived from invariant heading
//     `**N. <text>**`, lower-cased and prefixed `invariant-`.
//   - `docs/adr/0011-v0-frame-freeze-and-success-criteria.md#section-1` — derived from
//     `## N. <Title>` markdown headings via standard slug rules.
//   - Any RFC 3986 URI is also accepted (per the JSON Schema's `format: uri`).
//
// The CI lint script `scripts/lint-docs-anchors.ts` walks code/test files and
// resolves anchors of the first two forms.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type {
  Diagnostic,
  DiagnosticLocation,
  DiagnosticValidationResult,
  Severity,
} from "./types.js";

/** Lexical pattern for diagnostic codes. Mirrors the JSON Schema `code` regex. */
export const CODE_PATTERN = /^MS-[A-Z]+(?:-[A-Z]+)*?(?:-CAT\d+)?-\d+$/;

/**
 * Pattern for the in-repo anchor convention: `<path-to-md>#invariant-NN` or
 * `<path-to-md>#section-X`. Used by the CI lint script and the schema docs_url
 * tests. External URIs are validated by Ajv `format: uri` separately.
 */
export const DOCS_URL_ANCHOR_PATTERN =
  /^[^#\s]+\.md#(invariant-\d+|section-[a-z0-9-]+)$/;

// Schema is loaded lazily on first validation to avoid filesystem work at
// import time when the consumer only constructs diagnostics. The path walks up
// from `dist/pack-system/diagnostics/` (built) or `src/pack-system/diagnostics/`
// (test) to the repo root, then into `schemas/`.
//
// Module-system note: `tsconfig.pack.json` targets NodeNext/CJS (no
// `"type": "module"` in package.json), so `__dirname` is the CJS-injected
// global at build time. Under vitest (Vite/ESM), Vite auto-injects `__dirname`
// for source-code compatibility. We avoid `import.meta.url` so this file
// compiles under both module systems without conditionals.
declare const __dirname: string;

let cachedValidator: ValidateFunction<unknown> | undefined;

function getValidator(): ValidateFunction<unknown> {
  if (cachedValidator) return cachedValidator;
  // Walk up to repo root from `<root>/src/pack-system/diagnostics/format.ts`
  // (or the equivalent built location under `<root>/dist/pack-system/...`).
  const here = dirname(__filename);
  const repoRoot = resolve(here, "..", "..", "..");
  const schemaPath = resolve(
    repoRoot,
    "schemas",
    "diagnostic-envelope.schema.json",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

// Module-system bridge: CJS provides `__filename` as a global; Vite/ESM also
// provides it for source compatibility. `declare` keeps TypeScript content
// with both.
declare const __filename: string;

/**
 * Argument shape for {@link createDiagnostic}. `severity` defaults to
 * `"error"`; everything else is required (matching the JSON Schema's
 * required-field set). `enforces` and `related` remain optional.
 */
export interface CreateDiagnosticArgs {
  code: string;
  severity?: Severity;
  validator: string;
  location: DiagnosticLocation;
  message: string;
  fix_hint: string;
  enforces?: number[];
  related?: Diagnostic[];
  docs_url: string;
}

/**
 * Construct a diagnostic with default `severity: "error"`. Optional fields are
 * only emitted when explicitly provided, satisfying
 * `exactOptionalPropertyTypes`.
 */
export function createDiagnostic(args: CreateDiagnosticArgs): Diagnostic {
  const base: Diagnostic = {
    code: args.code,
    severity: args.severity ?? "error",
    validator: args.validator,
    location: args.location,
    message: args.message,
    fix_hint: args.fix_hint,
    docs_url: args.docs_url,
  };
  if (args.enforces !== undefined) base.enforces = args.enforces;
  if (args.related !== undefined) base.related = args.related;
  return base;
}

/**
 * Validate a diagnostic against the JSON Schema. Returns a flat result with
 * Ajv error details so callers can surface them without exposing the raw Ajv
 * instance.
 */
export function validateDiagnostic(d: unknown): DiagnosticValidationResult {
  const validate = getValidator();
  const ok = validate(d);
  if (ok) return { valid: true, errors: [] };
  // Ajv guarantees `validate.errors` is a non-empty array when `validate`
  // returns false, so the array may be consumed directly.
  const rawErrors = validate.errors as NonNullable<typeof validate.errors>;
  const errors = rawErrors.map((e) => {
    const out: {
      keyword: string;
      instancePath: string;
      schemaPath: string;
      message?: string;
    } = {
      keyword: e.keyword,
      instancePath: e.instancePath,
      schemaPath: e.schemaPath,
    };
    if (e.message !== undefined) out.message = e.message;
    return out;
  });
  return { valid: false, errors };
}

/** Output formats supported by {@link formatDiagnostic}. */
export type DiagnosticFormat = "text" | "json" | "yaml";

/**
 * Render a diagnostic for human or machine consumption.
 *
 * - `text` produces a single block with code, severity, validator, location,
 *   message, fix hint, and docs link.
 * - `json` emits canonical JSON (2-space indent) suitable for piping into
 *   downstream tooling.
 * - `yaml` emits line-per-field YAML without pulling a YAML dependency. The
 *   shape is deterministic; values are scalar-encoded with simple escaping.
 */
export function formatDiagnostic(
  d: Diagnostic,
  format: DiagnosticFormat,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(d, null, 2);
    case "yaml":
      return renderYaml(d);
    case "text":
      return renderText(d);
  }
}

function renderText(d: Diagnostic): string {
  const lines: string[] = [];
  lines.push(`[${d.severity.toUpperCase()}] ${d.code} (${d.validator})`);
  lines.push(
    `  at ${d.location.file}#${d.location.path}${
      d.location.line !== undefined ? `:${d.location.line}` : ""
    }${d.location.col !== undefined ? `:${d.location.col}` : ""}`,
  );
  lines.push(`  message: ${d.message}`);
  lines.push(`  fix:     ${d.fix_hint}`);
  if (d.enforces && d.enforces.length > 0) {
    lines.push(`  enforces: invariants ${d.enforces.join(", ")}`);
  }
  lines.push(`  docs:    ${d.docs_url}`);
  if (d.related && d.related.length > 0) {
    lines.push(`  related: ${d.related.length} diagnostic(s)`);
  }
  return lines.join("\n");
}

function renderYaml(d: Diagnostic): string {
  const lines: string[] = [];
  lines.push(`code: ${yamlScalar(d.code)}`);
  lines.push(`severity: ${yamlScalar(d.severity)}`);
  lines.push(`validator: ${yamlScalar(d.validator)}`);
  lines.push(`location:`);
  lines.push(`  file: ${yamlScalar(d.location.file)}`);
  lines.push(`  path: ${yamlScalar(d.location.path)}`);
  if (d.location.line !== undefined) {
    lines.push(`  line: ${d.location.line}`);
  }
  if (d.location.col !== undefined) {
    lines.push(`  col: ${d.location.col}`);
  }
  lines.push(`message: ${yamlScalar(d.message)}`);
  lines.push(`fix_hint: ${yamlScalar(d.fix_hint)}`);
  if (d.enforces && d.enforces.length > 0) {
    lines.push(`enforces: [${d.enforces.join(", ")}]`);
  }
  lines.push(`docs_url: ${yamlScalar(d.docs_url)}`);
  if (d.related && d.related.length > 0) {
    lines.push(`related:`);
    for (const r of d.related) {
      const rendered = renderYaml(r)
        .split("\n")
        .map((line, i) => (i === 0 ? `  - ${line}` : `    ${line}`))
        .join("\n");
      lines.push(rendered);
    }
  }
  return lines.join("\n");
}

function yamlScalar(s: string): string {
  // Quote when the scalar contains characters that would change YAML parsing
  // semantics in a `key: value` context. We only need to quote for:
  //   - empty string
  //   - leading/trailing whitespace
  //   - leading YAML-significant punctuation (`-`, `?`, `:`, `[`, `{`, `&`,
  //     `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, backtick, `#`)
  //   - any `: ` or ` #` substring (these change parser behaviour mid-value)
  //   - quote characters
  // A bare `#` or `:` not in those positions is safe in flow-scalar context
  // (e.g. `docs/principles.md#invariant-17` is a single bare scalar).
  if (s === "") return '""';
  if (/^\s|\s$/.test(s)) return quote(s);
  if (/^[-?:[\]{}&*!|>'"%@`#]/.test(s)) return quote(s);
  if (/: /.test(s) || / #/.test(s)) return quote(s);
  if (/["'`]/.test(s)) return quote(s);
  return s;
}

function quote(s: string): string {
  const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
