// MANIFEST-SURFACE TYPE FREEZE — DO NOT MODIFY WITHOUT SUPERSEDING ADR.
//
// This barrel is the **manifest-surface freeze, not a global pack-system
// freeze.** It exports the types that appear in or derive directly from
// `pack.yaml` — the contract surface that crosses the pack-author boundary.
// Modifying any exported type below requires a superseding ADR through the
// design review gate (per ADR-0011 §1).
//
// What IS frozen here (manifest-surface):
//   - `PackDescriptor` and every transitively-referenced sub-type that
//     mirrors a `pack.yaml` field (`Requires`, `Provides`, `RoutingHint`,
//     `RuntimeBindings`, `BindingSpec`, `Integrations`, `ActionDeclaration`,
//     `SideEffectProfile`, `Credentials`, `CredentialRequirement`,
//     `Permissions`, `GateContribution`, branded id types).
//   - The re-exported `Diagnostic` type (the public surface from
//     `../diagnostics/types`; downstream code consumes diagnostics through
//     this barrel for caller convenience).
//   - The `ValidationContext` shape consumed by every semantic validator —
//     part of the loader contract (WU2) and frozen so downstream WUs can
//     extend the loader without changing the validator function signature.
//
// What is NOT frozen by this barrel (downstream WUs add freely):
//   - AuditEvent and audit-related types (WU6 territory; pack-system
//     internals — they do not appear in `pack.yaml`).
//   - RuntimeAdapter contract types (WU9 territory).
//   - Diagnostic registry / format internals beyond the public `Diagnostic`
//     type re-exported below.
//   - Internal pack-system types added by downstream WUs (gates registry
//     state, routing scorer state, harness category state, runtime
//     compatibility matrix projection types, etc.).
//
// The freeze applies only to what crosses the pack-author boundary. The
// JSON Schema at `schemas/pack-format-0.1.schema.json` is the runtime
// validator for the same contract surface; the two MUST stay in agreement.
//
// References:
//   - ADR-0002 §"Diagnostic envelope" (Diagnostic type re-exported here).
//   - ADR-0004 §"runtime_bindings shape" (RuntimeBindings + BindingSpec).
//   - ADR-0005 §"Decision" (SideEffectProfile, ConflictPolicy semantics).
//   - ADR-0009 §5 (CredentialRequirement logical-name shape).
//   - ADR-0011 §1 (frame freeze; this barrel is the freeze surface).

// -- Branded primitive types ------------------------------------------------
//
// Brands are nominal-only — they do not affect runtime; they simply prevent
// accidental string-typing of one identifier kind as another. The schema
// regex enforces the actual lexical shape; brands are a TS-side aid.

export type PackId = string & { readonly __brand: "PackId" };
export type CapabilityId = string & { readonly __brand: "CapabilityId" };
export type RuntimeAdapterId = string & {
  readonly __brand: "RuntimeAdapterId";
};
export type ActionId = string & { readonly __brand: "ActionId" };
export type AgentName = string & { readonly __brand: "AgentName" };
export type RubricName = string & { readonly __brand: "RubricName" };
export type WorkflowName = string & { readonly __brand: "WorkflowName" };
export type SkillName = string & { readonly __brand: "SkillName" };

// -- Side-effect profile (ADR-0005, invariant 18) ---------------------------

export type SideEffectScope = "internal" | "external-read" | "external-write";
export type SideEffectReversibility = "reversible" | "irreversible";

export interface SideEffectGovernance {
  human_approval_required: boolean;
}

export interface SideEffectProfile {
  scope: SideEffectScope;
  reversibility: SideEffectReversibility;
  governance: SideEffectGovernance;
}

// -- Action declaration (ADR-0004 Modello A) --------------------------------

export interface ActionDeclaration {
  id: ActionId;
  capability: CapabilityId;
  input_schema: string;
  output_schema: string;
  side_effect_profile: SideEffectProfile;
  idempotency?: string;
}

// -- Credentials (ADR-0009 §5) ---------------------------------------------

export interface CredentialRequirement {
  logical: string;
  scope: string;
}

export interface Credentials {
  required: CredentialRequirement[];
}

// -- Permissions (derived classes; ADR-0005) -------------------------------

export interface Permissions {
  irreversible?: ActionId[];
}

// -- Routing hints (ADR-0006 default scorer; L1) ---------------------------

export interface RoutingHintKeyword {
  keyword: string;
  weight: number;
}

export interface RoutingHintTag {
  tag: string;
  weight: number;
}

export type RoutingHint = RoutingHintKeyword | RoutingHintTag;

// -- Binding spec (ADR-0004 v0 ts-module) ----------------------------------

export interface TsModuleBindingSpec {
  kind: "ts-module";
  path: string;
}

export type BindingSpec = TsModuleBindingSpec;

// -- Runtime bindings map (ADR-0004 revised) -------------------------------
//
// Outer key = capability id; inner key = runtime adapter id; value =
// adapter-specific binding spec. v0 mandatory: every capability in
// `provides.capabilities` MUST have both `claude-code` and `mock` entries.
// The schema enforces structural shape; the cross-field
// `RuntimeBindingsCompletenessValidator` enforces completeness.

export type RuntimeBindingMap = Record<RuntimeAdapterId, BindingSpec>;
export type RuntimeBindings = Record<CapabilityId, RuntimeBindingMap>;

// -- Requires / Provides --------------------------------------------------

export interface Requires {
  metaswarm: string;
  capabilities: CapabilityId[];
  runtimes: RuntimeAdapterId[];
  packs?: PackId[];
}

export interface Provides {
  capabilities?: CapabilityId[];
  agents?: AgentName[];
  rubrics?: RubricName[];
  workflows?: WorkflowName[];
  skills?: SkillName[];
}

// -- Integrations ---------------------------------------------------------

export interface Integrations {
  actions: ActionDeclaration[];
}

// -- Gate contributions (ADR-0005) ----------------------------------------
//
// `gates.<gate-name>` may carry an `add` array (rubric ids contributed to
// the named gate). v0 keeps the shape narrow — additional fields are
// rejected by `unevaluatedProperties`-style validators downstream.

export interface GateContribution {
  add?: RubricName[];
}

// -- Top-level descriptor -------------------------------------------------

export interface PackDescriptor {
  pack_format: "0.1";
  name: string;
  version: string;
  description?: string;
  requires: Requires;
  provides: Provides;
  routing_hints?: RoutingHint[];
  runtime_bindings: RuntimeBindings;
  integrations: Integrations;
  credentials: Credentials;
  permissions?: Permissions;
  /**
   * `extends.<artifact>` map per ADR-0005. Keys are pack-qualified artifact
   * references of the form `<pack>.<artifact>` (or `core.<artifact>`); values
   * carry the extension payload (free-form in v0). Cross-field resolution to
   * existing artifacts is enforced by `ExtendsTargetValidator`.
   */
  extends?: Record<string, unknown>;
  gates?: Record<string, GateContribution>;
  compatible_with?: PackId[];
}

// -- Validator contract (loader-internal but at manifest boundary) ---------

/**
 * Context passed to every semantic validator. Part of the loader contract
 * (WU2). Frozen here so downstream WUs (cross-pack registry, harness) may
 * extend the loader without forcing the validator function signature to
 * change.
 *
 * `otherPacks` is empty in single-pack tests; multi-pack registry plumbing
 * (WU3) populates it for cross-pack collision and extends-resolution checks.
 */
export interface ValidationContext {
  readonly otherPacks: readonly PackDescriptor[];
}

// -- Diagnostic re-export -------------------------------------------------
//
// The Diagnostic type is the public surface for diagnostics; importing it
// from this barrel lets pack-system consumers grab everything they need
// (descriptor types + diagnostic type) from one path. Internal diagnostic
// fields (registry tables, format helpers) remain in the diagnostics
// module; only the type is re-exported.

export type {
  Diagnostic,
  DiagnosticLocation,
  Severity,
} from "../diagnostics/types.js";
