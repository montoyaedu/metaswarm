// Code-prefix taxonomy for the Diagnostic envelope (ADR-0002).
//
// The taxonomy is itself part of the manifest contract — every diagnostic emits
// a `code` field whose prefix maps to a known validator (or harness category).
// Adding a new prefix is an ontology change (AA-Q2) and must go through the
// design review gate; this module is the single registry.
//
// Per the implementation plan (`docs/plans/2026-05-07-pack-system-mvp-implementation-plan.md`
// §4 WU1+WU2), the v0 prefixes are:
//
//   - MS-SCH-*       — JSON Schema validator
//   - MS-CAP-PERM-*  — CapabilityPermissionValidator
//   - MS-EXT-*       — ExtendsTargetValidator
//   - MS-DEP-*       — PackDependencyValidator
//   - MS-CFL-*       — ConflictPolicyValidator
//   - MS-NS-*        — NamespaceCollisionValidator
//   - MS-GATE-*      — GateCompositionValidator
//   - MS-CAP-BIND-*  — RuntimeBindingsCompletenessValidator (WU2 7th validator)
//   - MS-HRN-CAT<N>-* — Harness category N (N ∈ 1..16) per ADR-0008

/** Static prefixes whose owner is a single validator. */
export const STATIC_CODE_PREFIXES = [
  "MS-SCH",
  "MS-CAP-PERM",
  "MS-EXT",
  "MS-DEP",
  "MS-CFL",
  "MS-NS",
  "MS-GATE",
  "MS-CAP-BIND",
] as const;

/** Number of harness categories (ADR-0008 — frame-frozen by ADR-0011). */
export const HARNESS_CATEGORY_COUNT = 16;

const HARNESS_PREFIXES: ReadonlyArray<string> = Array.from(
  { length: HARNESS_CATEGORY_COUNT },
  (_, i) => `MS-HRN-CAT${i + 1}`,
);

/**
 * The full enumeration of known diagnostic code prefixes (static + harness).
 * Frozen to prevent accidental mutation by callers.
 */
export const KNOWN_CODE_PREFIXES: ReadonlyArray<string> = Object.freeze([
  ...STATIC_CODE_PREFIXES,
  ...HARNESS_PREFIXES,
]);

const PREFIX_SET: ReadonlySet<string> = new Set(KNOWN_CODE_PREFIXES);

/** Regex covering the full code lexical shape: `<prefix>-<digits>`. */
const CODE_LEX_PATTERN = /^(MS-[A-Z]+(?:-[A-Z]+)*?(?:-CAT\d+)?)-(\d+)$/;

/**
 * Returns true iff `code` matches the envelope code pattern AND its prefix is a
 * known v0 prefix (static or harness category 1..16). Rejects unknown
 * prefixes, malformed strings, and out-of-range harness categories.
 */
export function validateCodePrefix(code: string): boolean {
  if (typeof code !== "string" || code.length === 0) return false;
  const m = CODE_LEX_PATTERN.exec(code);
  if (!m) return false;
  const prefix = m[1]!;
  return PREFIX_SET.has(prefix);
}
