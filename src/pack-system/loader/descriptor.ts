// PackDescriptor parsing and JSON Schema validation (WU2).
//
// `parseManifest(yaml)`:
//   1. Parse YAML to a JS object via the `yaml` library (eemeli/yaml,
//      v2.4+ — chosen for YAML 1.2 compliance, zero deps, mature API).
//   2. Validate the parsed object against the locked
//      `schemas/pack-format-0.1.schema.json` via Ajv2020.
//   3. Return both the (typed) descriptor and any schema-level diagnostics.
//      The descriptor is *always* returned — even when the schema reports
//      errors — so callers can attempt best-effort semantic validation
//      (the loader chooses whether to skip semantic validators on schema
//      failure; this module reports, not decides).
//
// Errors are emitted as `MS-SCH-*` diagnostics (the JSON-Schema-validator
// code prefix per ADR-0002 §"Diagnostic envelope").
//
// AA-Q1: yaml dep is necessary, not anticipatory — every loader path
// needs YAML→JSON; the syntactic-subset parser used in WU1 tests is
// documented as test-local only (see `tests/pack-system/envelope-shape.test.ts`).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { createDiagnostic } from "../diagnostics/format.js";
import type { Diagnostic, PackDescriptor } from "../types/index.js";

declare const __filename: string;
declare const __dirname: string;

let cachedValidator: ValidateFunction<unknown> | undefined;

function getSchemaValidator(): ValidateFunction<unknown> {
  if (cachedValidator) return cachedValidator;
  const here = dirname(__filename);
  const repoRoot = resolve(here, "..", "..", "..");
  const schemaPath = resolve(
    repoRoot,
    "schemas",
    "pack-format-0.1.schema.json",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<
    string,
    unknown
  >;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export interface ParseManifestResult {
  /**
   * The parsed descriptor. Always present — even when schema validation
   * reports errors — so semantic validators can run a best-effort pass.
   * When YAML parsing itself fails, the descriptor is undefined and the
   * caller MUST inspect `schemaDiagnostics` for the parse error.
   */
  descriptor: PackDescriptor | undefined;
  schemaDiagnostics: Diagnostic[];
}

/** Parse a YAML manifest source and validate it against the pack-format-0.1 schema. */
export function parseManifest(yamlSource: string): ParseManifestResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlSource);
  } catch (err: unknown) {
    // The eemeli/yaml library throws YAMLParseError (subclass of Error) for
    // syntax errors. We coerce to a string defensively; the loader
    // contract is "return diagnostics, not throw".
    return {
      descriptor: undefined,
      schemaDiagnostics: [
        createDiagnostic({
          code: "MS-SCH-001",
          validator: "JsonSchemaValidator",
          location: { file: "pack.yaml", path: "/" },
          message: `YAML parse error: ${String(err)}`,
          fix_hint:
            "Fix the YAML syntax error. The eemeli/yaml parser follows YAML 1.2; verify indentation, quoting, and mapping shape.",
          enforces: [3],
          docs_url:
            "docs/adr/0002-schema-validation-language.md#section-decision",
        }),
      ],
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      descriptor: undefined,
      schemaDiagnostics: [
        createDiagnostic({
          code: "MS-SCH-002",
          validator: "JsonSchemaValidator",
          location: { file: "pack.yaml", path: "/" },
          message: "Manifest root must be a YAML mapping (object).",
          fix_hint:
            "The pack.yaml file must start with a mapping. See docs/examples/minimal-pack/pack.yaml for the expected shape.",
          enforces: [3],
          docs_url:
            "docs/adr/0002-schema-validation-language.md#section-decision",
        }),
      ],
    };
  }

  const validate = getSchemaValidator();
  const ok = validate(parsed);
  const diagnostics: Diagnostic[] = [];
  if (!ok) {
    // Ajv's contract: when `validate` returns false, `errors` is non-null.
    // We assert via cast to keep coverage tight; if Ajv ever violates this,
    // the schema-level test in `tests/pack-system/loader/loader.test.ts`
    // would surface the regression.
    const errors = validate.errors as NonNullable<typeof validate.errors>;
    for (const err of errors) {
      diagnostics.push(
        createDiagnostic({
          code: "MS-SCH-100",
          validator: "JsonSchemaValidator",
          location: {
            file: "pack.yaml",
            path: ajvInstancePathToPointer(err.instancePath),
          },
          message: ajvErrorMessage(err),
          fix_hint:
            "Adjust the manifest field to match the pack-format-0.1 schema; see docs/examples/minimal-pack/pack.yaml for the expected shape.",
          enforces: [3, 10],
          docs_url:
            "docs/adr/0002-schema-validation-language.md#section-decision",
        }),
      );
    }
  }

  return {
    descriptor: parsed as PackDescriptor,
    schemaDiagnostics: diagnostics,
  };
}

function ajvInstancePathToPointer(p: string): string {
  // Ajv's instancePath is RFC 6901 already; preserve "/" for root.
  return p === "" ? "/" : p;
}

function ajvErrorMessage(err: {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  message?: string;
  params?: Record<string, unknown>;
}): string {
  // Ajv's default options keep `messages` on, so `err.message` is always
  // populated for the Draft 2020-12 keywords this schema uses, and `params`
  // is always an object (possibly empty). We extract via cast to keep the
  // call shape explicit; type signature retains optional markers because
  // Ajv's `ErrorObject` declares them so.
  const where = err.instancePath === "" ? "(root)" : err.instancePath;
  const message = err.message as string;
  const params = err.params as Record<string, unknown>;
  const paramsStr = Object.entries(params)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");
  return `Schema violation at ${where}: ${message} (${paramsStr}).`;
}
