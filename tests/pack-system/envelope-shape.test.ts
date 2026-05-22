// Tests for the Diagnostic envelope and pack-format-0.1 schema (WU1).
//
// Driven by `docs/plans/2026-05-07-pack-system-mvp-implementation-plan.md` §4 WU1.
// The first test (Ajv2020 vs Draft07 keyword discrimination) is required by the
// plan to prove the Ajv2020 entry point is being used; the rest cover the
// envelope shape, code-prefix taxonomy, formatter round-trip, anchor convention,
// and a smoke validation of the pack-format-0.1 schema against the
// `docs/examples/minimal-pack/pack.yaml` fixture.
//
// TDD: this file is authored before the implementation lands. Tests fail first;
// implementation makes them pass.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import {
  type Diagnostic,
  type Severity,
} from "../../src/pack-system/diagnostics/types.js";
import {
  KNOWN_CODE_PREFIXES,
  validateCodePrefix,
} from "../../src/pack-system/diagnostics/registry.js";
import {
  CODE_PATTERN,
  DOCS_URL_ANCHOR_PATTERN,
  createDiagnostic,
  formatDiagnostic,
  validateDiagnostic,
} from "../../src/pack-system/diagnostics/format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

const diagnosticEnvelopeSchema = JSON.parse(
  readFileSync(
    resolve(repoRoot, "schemas", "diagnostic-envelope.schema.json"),
    "utf-8",
  ),
) as Record<string, unknown>;

const packFormatSchema = JSON.parse(
  readFileSync(
    resolve(repoRoot, "schemas", "pack-format-0.1.schema.json"),
    "utf-8",
  ),
) as Record<string, unknown>;

// Tiny YAML→JSON parser scoped to the syntactic subset used by
// `docs/examples/minimal-pack/pack.yaml`. WU2 introduces a real YAML parser via
// `js-yaml`; WU1 cannot pull that dep without expanding WU0's pinned set, so
// this test-local helper is the deliberate minimal bridge to satisfy the plan's
// "validate that minimal-pack/pack.yaml passes the schema" smoke test.
//
// Supports: comments (`#` outside quotes), 2-space indentation, mappings,
// sequences (`- key: value` and `- value`), quoted and bare scalars, booleans,
// numbers, empty sequences `[]` and empty mappings `{}`. Does NOT support
// multi-line strings, anchors, flow mappings beyond `[]`/`{}`, tags. If the
// fixture grows beyond this subset, this helper fails loudly.
//
// Strategy: a single pass with a stack of frames; each frame holds an
// `indent` plus the container being filled. A key whose value is an empty
// mapping (`key:` with no inline value) defers container-type resolution until
// the first child line: a `- ` child promotes to an array, a `key:` child
// promotes to an object. This avoids the "sentinel" hack a depth-first parse
// would otherwise need.
type ContainerFrame =
  | { kind: "object"; indent: number; container: Record<string, unknown> }
  | { kind: "array"; indent: number; container: unknown[] }
  | {
      // Pending: parent expects a child that determines its type.
      kind: "pending";
      indent: number;
      parent: Record<string, unknown> | unknown[];
      key?: string; // undefined when parent is an array (object-item context)
    };

function parseMinimalYaml(source: string): unknown {
  const lines = source.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  const stack: ContainerFrame[] = [
    { kind: "object", indent: -1, container: root },
  ];

  const stripComment = (line: string): string => {
    // Strip `#` comments at the first `#` that follows whitespace or starts the
    // line. Mid-token `#` (e.g. inside an anchor URL) is preserved. The fixture
    // contains comments only in the post-whitespace position.
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === "#" && !inSingle && !inDouble) {
        if (i === 0 || /\s/.test(line[i - 1]!)) {
          return line.slice(0, i);
        }
      }
    }
    return line;
  };

  for (let rawLine of lines) {
    rawLine = stripComment(rawLine).replace(/\s+$/, "");
    if (rawLine.trim() === "") continue;
    const indentMatch = rawLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const content = rawLine.slice(indent);

    // Resolve any pending frames at or above this indent before consuming.
    // A pending frame may be promoted to an array (if next child is `- `) or
    // an object (if next child is `key:`) — this is decided when we encounter
    // the first child line at indent > pending.indent.
    let top = stack[stack.length - 1]!;

    // If the top is `pending` and we are at deeper indent than it, decide.
    if (top.kind === "pending" && indent > top.indent) {
      top = promotePending(top, content, stack);
    }

    // Pop frames until we are inside one whose indent is strictly less than
    // ours (i.e. the current line is its child).
    while (stack.length > 1) {
      const t = stack[stack.length - 1]!;
      if (indent > t.indent) break;
      stack.pop();
    }

    top = stack[stack.length - 1]!;

    if (top.kind === "pending") {
      // Reached at sibling/ancestor indent without children — resolve to
      // empty object.
      resolvePendingAsEmptyObject(top, stack);
      top = stack[stack.length - 1]!;
    }

    if (content.startsWith("- ") || content === "-") {
      // Sequence item.
      if (top.kind !== "array") {
        throw new Error(
          `parseMinimalYaml: sequence item under non-array at line: ${rawLine}`,
        );
      }
      const item = content === "-" ? "" : content.slice(2);
      const colonIdx = findMappingColon(item);
      if (colonIdx >= 0) {
        const key = item.slice(0, colonIdx).trim();
        const valuePart = item.slice(colonIdx + 1).trim();
        const obj: Record<string, unknown> = {};
        top.container.push(obj);
        // Subsequent keys for this object live at indent + 2 (where 2 is
        // the dash + space).
        stack.push({ kind: "object", indent: indent + 1, container: obj });
        if (valuePart === "") {
          stack.push({
            kind: "pending",
            indent: indent + 2,
            parent: obj,
            key,
          });
        } else {
          obj[key] = parseScalar(valuePart);
        }
      } else {
        top.container.push(parseScalar(item));
      }
      continue;
    }

    // Mapping `key: value`.
    const colonIdx = findMappingColon(content);
    if (colonIdx < 0) {
      throw new Error(
        `parseMinimalYaml: expected mapping at line: ${rawLine}`,
      );
    }
    const key = content.slice(0, colonIdx).trim();
    const valuePart = content.slice(colonIdx + 1).trim();
    if (top.kind !== "object") {
      throw new Error(
        `parseMinimalYaml: mapping key '${key}' under non-object at line: ${rawLine}`,
      );
    }
    if (valuePart === "") {
      stack.push({
        kind: "pending",
        indent,
        parent: top.container,
        key,
      });
    } else {
      top.container[key] = parseScalar(valuePart);
    }
  }

  // Resolve any trailing pending frames as empty objects.
  while (stack.length > 1) {
    const t = stack[stack.length - 1]!;
    if (t.kind === "pending") resolvePendingAsEmptyObject(t, stack);
    stack.pop();
  }

  return root;
}

function promotePending(
  pending: Extract<ContainerFrame, { kind: "pending" }>,
  childContent: string,
  stack: ContainerFrame[],
): ContainerFrame {
  // Replace the pending frame with a concrete container based on the child
  // content's first character.
  const childIsSequence =
    childContent.startsWith("- ") || childContent === "-";
  if (childIsSequence) {
    const arr: unknown[] = [];
    if (Array.isArray(pending.parent)) {
      pending.parent.push(arr);
    } else if (pending.key !== undefined) {
      pending.parent[pending.key] = arr;
    }
    const frame: ContainerFrame = {
      kind: "array",
      indent: pending.indent,
      container: arr,
    };
    stack.pop();
    stack.push(frame);
    return frame;
  }
  const obj: Record<string, unknown> = {};
  if (Array.isArray(pending.parent)) {
    pending.parent.push(obj);
  } else if (pending.key !== undefined) {
    pending.parent[pending.key] = obj;
  }
  const frame: ContainerFrame = {
    kind: "object",
    indent: pending.indent,
    container: obj,
  };
  stack.pop();
  stack.push(frame);
  return frame;
}

function resolvePendingAsEmptyObject(
  pending: Extract<ContainerFrame, { kind: "pending" }>,
  stack: ContainerFrame[],
): void {
  // No child appeared; resolve as `{}`.
  if (Array.isArray(pending.parent)) {
    pending.parent.push({});
  } else if (pending.key !== undefined) {
    pending.parent[pending.key] = {};
  }
  // Remove the pending frame from the stack.
  const idx = stack.lastIndexOf(pending);
  if (idx >= 0) stack.splice(idx, 1);
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);
  return trimmed;
}

function findMappingColon(s: string): number {
  // First `:` that is followed by a space or end-of-string and not inside a
  // quoted scalar. The fixture uses simple keys, so this is sufficient.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      if (i === s.length - 1 || s[i + 1] === " ") return i;
    }
  }
  return -1;
}

describe("Ajv2020 entry point discrimination (plan WU1 first test)", () => {
  it("`new Ajv2020()` compiles a schema using `$dynamicRef`", () => {
    const ajv = new Ajv2020();
    const schema = {
      $id: "https://example.com/dynamic.json",
      $defs: {
        node: {
          $dynamicAnchor: "node",
          type: "object",
          properties: { value: { type: "string" } },
        },
      },
      $dynamicRef: "#node",
    };
    expect(() => ajv.compile(schema)).not.toThrow();
  });

  it("`new Ajv()` (Draft 07 default) does NOT compile a schema using `$dynamicRef`", () => {
    const ajv = new Ajv({ strict: false });
    const schema = {
      $id: "https://example.com/dynamic.json",
      $defs: {
        node: {
          $dynamicAnchor: "node",
          type: "object",
          properties: { value: { type: "string" } },
        },
      },
      $dynamicRef: "#node",
    };
    // Draft 07 has no `$dynamicRef` keyword. Ajv default (Draft 07) treats
    // unknown keywords variably depending on `strict` mode. With `strict:
    // false`, the schema compiles but the keyword is silently ignored — which
    // is itself the failure mode this test guards against. With strict mode on
    // (Ajv default), compilation throws. Either way, the discriminator is
    // observable: the compiled validator does NOT enforce $dynamicRef
    // semantics under Draft 07.
    const strictAjv = new Ajv();
    expect(() => strictAjv.compile(schema)).toThrow();
    // Also assert the non-strict path silently ignores it (no enforcement).
    const validate = ajv.compile(schema);
    // The validator under Draft 07 does not understand $dynamicAnchor + $dynamicRef
    // semantics. If it accepts arbitrary input where Ajv2020 would reject, the
    // discriminator holds. We do not deeply assert semantics here — the
    // Ajv2020-compiles-it / Ajv-throws-or-ignores-it pair is the test.
    expect(typeof validate).toBe("function");
  });
});

describe("Diagnostic envelope schema (ADR-0002 §'Diagnostic envelope')", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(diagnosticEnvelopeSchema);

  const baseValid: Diagnostic = {
    code: "MS-SCH-001",
    severity: "error",
    validator: "JsonSchemaValidator",
    location: { file: "pack.yaml", path: "/name" },
    message: "name must be a string",
    fix_hint: "Set `name` to a non-empty string identifier.",
    docs_url: "docs/principles.md#invariant-3",
  };

  it("accepts a minimally complete diagnostic", () => {
    expect(validate(baseValid)).toBe(true);
  });

  it("requires every load-bearing field", () => {
    const required = [
      "code",
      "severity",
      "validator",
      "location",
      "message",
      "fix_hint",
      "docs_url",
    ];
    for (const field of required) {
      const incomplete = { ...baseValid } as Record<string, unknown>;
      delete incomplete[field];
      expect(validate(incomplete)).toBe(false);
    }
  });

  it("rejects an unknown severity", () => {
    expect(validate({ ...baseValid, severity: "fatal" })).toBe(false);
  });

  it("requires location.file and location.path", () => {
    expect(validate({ ...baseValid, location: { file: "pack.yaml" } })).toBe(false);
    expect(validate({ ...baseValid, location: { path: "/name" } })).toBe(false);
  });

  it("rejects a code that does not match the prefix pattern", () => {
    expect(validate({ ...baseValid, code: "nope-001" })).toBe(false);
    expect(validate({ ...baseValid, code: "MS-001" })).toBe(false);
    expect(validate({ ...baseValid, code: "MS-SCH" })).toBe(false);
  });

  it("accepts a harness-category code (MS-HRN-CAT12-001)", () => {
    expect(validate({ ...baseValid, code: "MS-HRN-CAT12-001" })).toBe(true);
  });

  it("constrains `enforces` to the v0 invariant range 1..28", () => {
    expect(validate({ ...baseValid, enforces: [3, 22] })).toBe(true);
    expect(validate({ ...baseValid, enforces: [0] })).toBe(false);
    expect(validate({ ...baseValid, enforces: [29] })).toBe(false);
    expect(validate({ ...baseValid, enforces: [3.5] })).toBe(false);
  });

  it("supports a recursive `related` field with the same schema", () => {
    const nested: Diagnostic = {
      ...baseValid,
      code: "MS-NS-002",
      validator: "NamespaceCollisionValidator",
      message: "collides with another pack",
      related: [{ ...baseValid, code: "MS-NS-003" }],
    };
    expect(validate(nested)).toBe(true);
  });

  it("validates the `docs_url` against the URI format and the anchor convention", () => {
    // ADR-anchor form.
    expect(
      validate({
        ...baseValid,
        docs_url: "docs/adr/0002-schema-validation-language.md#section-decision",
      }),
    ).toBe(true);
    // Invariant-anchor form.
    expect(
      validate({
        ...baseValid,
        docs_url: "docs/principles.md#invariant-22",
      }),
    ).toBe(true);
    // External URL.
    expect(
      validate({ ...baseValid, docs_url: "https://example.com/page" }),
    ).toBe(true);
    // Non-URI string.
    expect(validate({ ...baseValid, docs_url: "not a url" })).toBe(false);
  });
});

describe("Code-prefix registry (ADR-0002 prefix taxonomy + plan WU1/WU2)", () => {
  it("every known prefix matches the envelope code pattern when given a numeric tail", () => {
    for (const prefix of KNOWN_CODE_PREFIXES) {
      const sample = `${prefix}-001`;
      expect(CODE_PATTERN.test(sample)).toBe(true);
    }
  });

  it("validateCodePrefix accepts known prefixes", () => {
    for (const prefix of KNOWN_CODE_PREFIXES) {
      expect(validateCodePrefix(`${prefix}-001`)).toBe(true);
    }
  });

  it("validateCodePrefix accepts every harness-category prefix MS-HRN-CAT1..16", () => {
    for (let n = 1; n <= 16; n += 1) {
      expect(validateCodePrefix(`MS-HRN-CAT${n}-001`)).toBe(true);
    }
  });

  it("validateCodePrefix rejects unknown prefixes", () => {
    expect(validateCodePrefix("MS-FOO-001")).toBe(false);
    expect(validateCodePrefix("XYZ-001")).toBe(false);
    expect(validateCodePrefix("MS-HRN-CAT0-001")).toBe(false);
    expect(validateCodePrefix("MS-HRN-CAT17-001")).toBe(false);
  });

  it("validateCodePrefix rejects malformed code strings", () => {
    expect(validateCodePrefix("")).toBe(false);
    expect(validateCodePrefix("MS-SCH")).toBe(false);
    expect(validateCodePrefix("ms-sch-001")).toBe(false);
  });
});

describe("createDiagnostic / validateDiagnostic", () => {
  it("createDiagnostic populates required fields and validates", () => {
    const d = createDiagnostic({
      code: "MS-SCH-007",
      validator: "JsonSchemaValidator",
      location: { file: "pack.yaml", path: "/version" },
      message: "version must be semver",
      fix_hint: "Set `version` to a valid semver string, e.g. 0.1.0.",
      docs_url: "docs/principles.md#invariant-3",
    });
    expect(d.severity).toBe<Severity>("error");
    const result = validateDiagnostic(d);
    expect(result.valid).toBe(true);
  });

  it("createDiagnostic permits explicit severity and enforces", () => {
    const d = createDiagnostic({
      code: "MS-CAP-PERM-002",
      severity: "warning",
      validator: "CapabilityPermissionValidator",
      location: { file: "pack.yaml", path: "/permissions/irreversible" },
      message: "irreversible declared but no irreversible action found",
      fix_hint: "Remove the entry or declare an irreversible action.",
      enforces: [19],
      docs_url: "docs/principles.md#invariant-19",
    });
    expect(d.severity).toBe<Severity>("warning");
    expect(d.enforces).toEqual([19]);
  });

  it("createDiagnostic carries `related` when supplied", () => {
    const inner = createDiagnostic({
      code: "MS-NS-002",
      validator: "NamespaceCollisionValidator",
      location: { file: "other.yaml", path: "/provides/agents/0" },
      message: "other side of collision",
      fix_hint: "rename",
      docs_url: "docs/principles.md#invariant-17",
    });
    const d = createDiagnostic({
      code: "MS-NS-001",
      validator: "NamespaceCollisionValidator",
      location: { file: "pack.yaml", path: "/provides/agents/0" },
      message: "agent name collides",
      fix_hint: "rename",
      docs_url: "docs/principles.md#invariant-17",
      related: [inner],
    });
    expect(d.related).toBeDefined();
    expect(d.related?.length).toBe(1);
    expect(validateDiagnostic(d).valid).toBe(true);
  });

  it("validateDiagnostic returns errors for an invalid envelope", () => {
    const bad = {
      code: "WRONG",
      severity: "error",
      validator: "X",
      location: { file: "f", path: "/" },
      message: "m",
      fix_hint: "f",
      docs_url: "https://x.test/",
    } as unknown as Diagnostic;
    const result = validateDiagnostic(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("formatDiagnostic round-trip (text / json / yaml)", () => {
  const d: Diagnostic = {
    code: "MS-NS-001",
    severity: "error",
    validator: "NamespaceCollisionValidator",
    location: { file: "pack.yaml", path: "/provides/agents/0", line: 12, col: 4 },
    message: "agent 'editor' collides with another pack's 'editor'",
    fix_hint: "Namespace the agent or remove the duplicate.",
    enforces: [16, 17],
    docs_url: "docs/principles.md#invariant-17",
  };

  it("emits a non-empty text rendering", () => {
    const out = formatDiagnostic(d, "text");
    expect(out).toContain("MS-NS-001");
    expect(out).toContain("editor");
    expect(out).toContain("invariant-17");
  });

  it("emits parseable JSON that round-trips through JSON.parse", () => {
    const out = formatDiagnostic(d, "json");
    const parsed = JSON.parse(out) as Diagnostic;
    expect(parsed.code).toBe(d.code);
    expect(parsed.location.path).toBe(d.location.path);
    expect(parsed.enforces).toEqual([16, 17]);
  });

  it("emits a YAML-like rendering with the load-bearing fields", () => {
    const out = formatDiagnostic(d, "yaml");
    expect(out).toMatch(/code: MS-NS-001/);
    expect(out).toMatch(/severity: error/);
    expect(out).toMatch(/validator: NamespaceCollisionValidator/);
    expect(out).toMatch(/docs_url: docs\/principles\.md#invariant-17/);
  });

  it("renders related diagnostics in text and yaml formats", () => {
    const withRelated: Diagnostic = {
      ...d,
      related: [
        {
          ...d,
          code: "MS-NS-002",
          location: { file: "other.yaml", path: "/provides/agents/0" },
        },
      ],
    };
    const text = formatDiagnostic(withRelated, "text");
    expect(text).toContain("related: 1 diagnostic");
    const yaml = formatDiagnostic(withRelated, "yaml");
    expect(yaml).toMatch(/related:/);
    expect(yaml).toMatch(/- code: MS-NS-002/);
    expect(yaml).toMatch(/file: other\.yaml/);
  });

  it("text rendering omits line/col when missing and includes them when present", () => {
    const noPos: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "JsonSchemaValidator",
      location: { file: "pack.yaml", path: "/" },
      message: "informational note",
      fix_hint: "no action required",
      docs_url: "docs/principles.md#invariant-3",
    };
    const text = formatDiagnostic(noPos, "text");
    expect(text).not.toMatch(/:\d+/);

    const withLineOnly: Diagnostic = {
      ...noPos,
      location: { file: "pack.yaml", path: "/", line: 5 },
    };
    expect(formatDiagnostic(withLineOnly, "text")).toMatch(/#\/:5$/m);

    const withColOnly: Diagnostic = {
      ...noPos,
      location: { file: "pack.yaml", path: "/", col: 7 },
    };
    expect(formatDiagnostic(withColOnly, "text")).toMatch(/#\/:7$/m);

    const textNoEnforces = formatDiagnostic(noPos, "text");
    expect(textNoEnforces).not.toMatch(/enforces:/);
  });

  it("omits optional location.line / location.col cleanly in yaml", () => {
    const sparse: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "JsonSchemaValidator",
      location: { file: "pack.yaml", path: "/" },
      message: "informational note",
      fix_hint: "no action required",
      docs_url: "docs/principles.md#invariant-3",
    };
    const yaml = formatDiagnostic(sparse, "yaml");
    expect(yaml).not.toMatch(/^\s*line:/m);
    expect(yaml).not.toMatch(/^\s*col:/m);
    expect(yaml).not.toMatch(/^enforces:/m);
    expect(yaml).not.toMatch(/^related:/m);
  });

  it("yaml-quotes a value that contains `: ` mid-token", () => {
    const trickier: Diagnostic = {
      ...d,
      message: "key: value collides with another pack's value",
    };
    const yaml = formatDiagnostic(trickier, "yaml");
    expect(yaml).toMatch(/^message: "/m);
  });

  it("yaml-quotes an empty string and a leading-dash value", () => {
    const sparse: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "X",
      location: { file: "f", path: "/" },
      message: "",
      fix_hint: "-leads with dash",
      docs_url: "docs/principles.md#invariant-3",
    };
    const yaml = formatDiagnostic(sparse, "yaml");
    expect(yaml).toMatch(/^message: ""$/m);
    expect(yaml).toMatch(/^fix_hint: "-leads with dash"$/m);
  });

  it("yaml-quotes a value with leading whitespace", () => {
    const sparse: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "X",
      location: { file: "f", path: "/" },
      message: " leading space",
      fix_hint: "ok",
      docs_url: "docs/principles.md#invariant-3",
    };
    const yaml = formatDiagnostic(sparse, "yaml");
    expect(yaml).toMatch(/^message: "/m);
  });

  it("yaml-quotes a value containing a backtick or other quote-trigger", () => {
    const sparse: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "X",
      location: { file: "f", path: "/" },
      message: "backtick `here`",
      fix_hint: "single 'quote' inside",
      docs_url: "docs/principles.md#invariant-3",
    };
    const yaml = formatDiagnostic(sparse, "yaml");
    expect(yaml).toMatch(/^message: "backtick `here`"$/m);
    expect(yaml).toMatch(/^fix_hint: "single 'quote' inside"$/m);
  });

  it("yaml escapes embedded double-quotes and backslashes", () => {
    const sparse: Diagnostic = {
      code: "MS-SCH-009",
      severity: "info",
      validator: "X",
      location: { file: "f", path: "/" },
      message: 'has "quotes" and a \\ backslash',
      fix_hint: " leading space",
      docs_url: "docs/principles.md#invariant-3",
    };
    const yaml = formatDiagnostic(sparse, "yaml");
    expect(yaml).toMatch(/has \\"quotes\\" and a \\\\ backslash/);
  });
});

describe("docs_url anchor convention pattern", () => {
  it("matches the invariant-NN anchor form", () => {
    expect(
      DOCS_URL_ANCHOR_PATTERN.test("docs/principles.md#invariant-22"),
    ).toBe(true);
    expect(
      DOCS_URL_ANCHOR_PATTERN.test(
        "docs/adr/0002-schema-validation-language.md#section-decision",
      ),
    ).toBe(true);
  });

  it("does not match arbitrary strings", () => {
    expect(DOCS_URL_ANCHOR_PATTERN.test("https://example.com")).toBe(false);
    expect(DOCS_URL_ANCHOR_PATTERN.test("not a url")).toBe(false);
  });
});

describe("pack-format-0.1 schema smoke validation", () => {
  // Build a Draft 2020-12 validator from the schema.
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(packFormatSchema);

  it("accepts the docs/examples/minimal-pack/pack.yaml fixture", () => {
    const yamlPath = resolve(
      repoRoot,
      "docs",
      "examples",
      "minimal-pack",
      "pack.yaml",
    );
    const source = readFileSync(yamlPath, "utf-8");
    const parsed = parseMinimalYaml(source);
    const ok = validate(parsed);
    if (!ok) {
      // Surface the Ajv errors in the test failure output.
      throw new Error(
        `minimal-pack/pack.yaml failed schema validation: ${JSON.stringify(validate.errors, null, 2)}`,
      );
    }
    expect(ok).toBe(true);
  });

  it("rejects a manifest missing pack_format", () => {
    const m = {
      name: "x",
      version: "0.1.0",
      requires: {
        metaswarm: ">=0.11",
        capabilities: [],
        runtimes: ["claude-code", "mock"],
      },
      provides: { capabilities: [] },
      runtime_bindings: {},
      integrations: { actions: [] },
      credentials: { required: [] },
    };
    expect(validate(m)).toBe(false);
  });

  it("rejects pack_format other than '0.1' (v0 envelope contract)", () => {
    const m = {
      pack_format: "0.2",
      name: "x",
      version: "0.1.0",
      requires: {
        metaswarm: ">=0.11",
        capabilities: [],
        runtimes: ["claude-code", "mock"],
      },
      provides: { capabilities: [] },
      runtime_bindings: {},
      integrations: { actions: [] },
      credentials: { required: [] },
    };
    expect(validate(m)).toBe(false);
  });

  it("rejects a manifest whose requires.runtimes omits 'mock' (ADR-0004 mandatory key)", () => {
    const m = {
      pack_format: "0.1",
      name: "x",
      version: "0.1.0",
      requires: {
        metaswarm: ">=0.11",
        capabilities: [],
        runtimes: ["claude-code"],
      },
      provides: { capabilities: [] },
      runtime_bindings: {},
      integrations: { actions: [] },
      credentials: { required: [] },
    };
    expect(validate(m)).toBe(false);
  });

  it("rejects an action with an unknown side_effect_profile.scope", () => {
    const m = {
      pack_format: "0.1",
      name: "x",
      version: "0.1.0",
      requires: {
        metaswarm: ">=0.11",
        capabilities: ["integrations.provider/v1"],
        runtimes: ["claude-code", "mock"],
      },
      provides: { capabilities: ["integrations.provider/v1"] },
      runtime_bindings: {
        "integrations.provider/v1": {
          "claude-code": { kind: "ts-module", path: "./x.ts" },
          mock: { kind: "ts-module", path: "./x.ts" },
        },
      },
      integrations: {
        actions: [
          {
            id: "x.do/v1",
            capability: "integrations.provider/v1",
            input_schema: "./x.in.json",
            output_schema: "./x.out.json",
            side_effect_profile: {
              scope: "magic-write",
              reversibility: "reversible",
              governance: { human_approval_required: false },
            },
          },
        ],
      },
      credentials: { required: [] },
    };
    expect(validate(m)).toBe(false);
  });
});
