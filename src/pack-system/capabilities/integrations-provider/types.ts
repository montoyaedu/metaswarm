// `integrations.provider/v1` — capability interface (WU7).
//
// ADR-0004 pillar 1 + 2. `integrations.provider/v1` is the single generic
// external-system capability (Modello A): one `invoke` entry point, with
// per-action metadata (schema, side-effect profile, idempotency, permission
// class) declared in the manifest rather than baked into the capability.
//
// References:
//   - docs/capabilities/integrations-provider.md (the six-pillar spec).
//   - ADR-0004 §"Integration model — Modello A".

import type { JsonObject } from "../../audit/types.js";

export type { JsonObject };

/** Capability identifier (ADR-0004 pillar 1). */
export const INTEGRATIONS_PROVIDER_V1 = "integrations.provider/v1";

/**
 * The `integrations.provider/v1` capability interface (ADR-0004 pillar 2).
 *
 * Semantics (pillar 3): `invoke` resolves to a JSON-serializable object for a
 * declared action and **rejects** (with an `Error`) for an undeclared action
 * id. It does not mutate its `args`. An action the manifest declares
 * idempotent yields an equal result for equal args.
 */
export interface IntegrationsProviderV1 {
  /** Invoke a declared action; resolve with its JSON result. */
  invoke(actionId: string, args: JsonObject): Promise<JsonObject>;
}

/** One action the conformance fixture exercises. */
export interface DeclaredAction {
  readonly id: string;
  readonly args: JsonObject;
}

/**
 * Conformance fixture — names the actions the suite exercises against a
 * particular implementation. WU8's harness derives this from the manifest's
 * `ActionDeclaration`s; WU7's reference supplies its own.
 */
export interface IntegrationsConformanceFixture {
  /** A declared action the suite invokes for the resolve/result checks. */
  readonly knownAction: DeclaredAction;
  /** A declared *idempotent* action the suite invokes twice. */
  readonly idempotentAction: DeclaredAction;
  /** An action id the implementation does not declare. */
  readonly unknownActionId: string;
}

/** The subject a conformance run operates on — an implementation + fixture. */
export interface IntegrationsProviderSubject {
  readonly provider: IntegrationsProviderV1;
  readonly fixture: IntegrationsConformanceFixture;
}
