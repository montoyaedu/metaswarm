// Diagnostic envelope TypeScript types — source of truth for the type-side of
// the contract. The runtime validator is the JSON Schema at
// `schemas/diagnostic-envelope.schema.json`; the two MUST stay in agreement.
//
// Spec: `docs/adr/0002-schema-validation-language.md` §"Diagnostic envelope".
// Also see `docs/principles.md` invariants 17 (static ambiguity is forbidden;
// load-time errors must be diagnosable) and 20 (decisions must be explainable;
// every harness diagnostic carries a docs_url + enforces).
//
// Strict TypeScript settings enforce no `any`. Optional fields use
// `exactOptionalPropertyTypes`-friendly `?:` declarations.

/** Severity classes for diagnostic emission. */
export type Severity = "error" | "warning" | "info";

/**
 * Source location of a diagnostic. The path is a JSON Pointer (RFC 6901)
 * pointing into the parsed manifest or other JSON-shaped artifact. Line and
 * column are optional, populated by parsers that retain source positions.
 */
export interface DiagnosticLocation {
  file: string;
  path: string;
  line?: number;
  col?: number;
}

/**
 * A single diagnostic emitted by a validator, the harness, or the loader. The
 * `enforces` array lists the principles.md invariant numbers (1..28) the
 * diagnostic upholds; `related` carries cross-file context (e.g. the OTHER
 * pack involved in a namespace collision); `docs_url` deep-links to the
 * relevant ADR section or invariant anchor (see plan §4 WU1 row).
 */
export interface Diagnostic {
  code: string;
  severity: Severity;
  validator: string;
  location: DiagnosticLocation;
  message: string;
  fix_hint: string;
  enforces?: number[];
  related?: Diagnostic[];
  docs_url: string;
}

/**
 * Result of validating a candidate diagnostic against the JSON Schema.
 * Validators outside the diagnostics module may use this to thread schema
 * errors through their own diagnostic flow.
 */
export interface DiagnosticValidationResult {
  valid: boolean;
  errors: ReadonlyArray<{
    keyword: string;
    instancePath: string;
    schemaPath: string;
    message?: string;
  }>;
}
