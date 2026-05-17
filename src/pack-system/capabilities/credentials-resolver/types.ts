// `credentials.resolver/v1` — capability interface (WU7).
//
// ADR-0004 pillar 1 + 2. A credentials resolver maps a logical credential
// name to a `SecretRef` — an OPAQUE handle. Pack code never receives
// plaintext; only the runtime adapter dereferences a `SecretRef` inside the
// adapter call boundary (ADR-0004 §"SecretRef opaque handle"). This makes
// invariant 22 ("secrets never logged") mechanical.
//
// `SecretRef` is the capability *contract* and is therefore defined here
// (pillar 2 is WU7's responsibility). The env-var resolver *implementation*
// arrives in WU11 and imports this type.
//
// References:
//   - docs/capabilities/credentials-resolver.md (the six-pillar spec).
//   - ADR-0004 §"credentials.resolver/v1 — SecretRef opaque handle".
//   - docs/principles.md#invariant-22 (secrets never logged).

import { isPlainJsonObject } from "../conformance.js";

/** Capability identifier (ADR-0004 pillar 1). */
export const CREDENTIALS_RESOLVER_V1 = "credentials.resolver/v1";

/**
 * An opaque credential handle. Pack code holds it and passes it to an
 * integration action; only the runtime adapter resolves it to plaintext.
 * The shape is intentionally minimal — a brand flag plus an id — and carries
 * NO plaintext.
 */
export interface SecretRef {
  readonly __metaswarm_secret: true;
  readonly id: string;
}

/**
 * The `credentials.resolver/v1` capability interface (ADR-0004 pillar 2).
 *
 * Semantics (pillar 3): `get` resolves a declared logical name to an opaque
 * `SecretRef` and **rejects** (with an `Error`) for an undeclared name; the
 * handle never carries plaintext. `refresh` rotates a handle, returning a new
 * opaque `SecretRef`.
 */
export interface CredentialsResolverV1 {
  /** Resolve a declared logical credential name to an opaque handle. */
  get(name: string): Promise<SecretRef>;
  /** Rotate a handle, returning a fresh opaque handle. */
  refresh(ref: SecretRef): Promise<SecretRef>;
}

/** True iff `value` is a structurally-valid opaque {@link SecretRef}. */
export function isSecretRef(value: unknown): value is SecretRef {
  return (
    isPlainJsonObject(value) &&
    (value as { __metaswarm_secret?: unknown }).__metaswarm_secret === true &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/**
 * Conformance fixture — a declared name (with the plaintext behind it, so the
 * suite can assert the plaintext never leaks into a handle) and an undeclared
 * name. WU8's harness derives this from the manifest's `credentials.required`.
 */
export interface CredentialsConformanceFixture {
  readonly declaredName: string;
  readonly declaredPlaintext: string;
  readonly undeclaredName: string;
}

/** The subject a conformance run operates on — an implementation + fixture. */
export interface CredentialsResolverSubject {
  readonly resolver: CredentialsResolverV1;
  readonly fixture: CredentialsConformanceFixture;
}
