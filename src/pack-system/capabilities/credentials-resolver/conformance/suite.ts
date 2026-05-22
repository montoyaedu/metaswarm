// `credentials.resolver/v1` — conformance suite (WU7).
//
// ADR-0004 pillar 5. The load-bearing checks are the leak checks: a resolved
// (or refreshed) `SecretRef` must never carry the credential plaintext —
// verified with WU6's `detectSecretLeak`. `referenceCredentialsResolverV1`
// keeps plaintext in a private vault and only ever hands out opaque handles.
//
// References: docs/capabilities/credentials-resolver.md; plan §4 WU7 row;
// docs/principles.md#invariant-22 (secrets never logged).

import { detectSecretLeak } from "../../../audit/leak-detector.js";
import {
  type ConformanceCheck,
  type ConformanceReport,
  ensure,
  expectRejection,
  runConformanceSuite,
} from "../../conformance.js";
import { observabilityCheck } from "../../observability.js";
import {
  CREDENTIALS_RESOLVER_V1,
  type CredentialsConformanceFixture,
  type CredentialsResolverSubject,
  type CredentialsResolverV1,
  isSecretRef,
} from "../types.js";

/** The `credentials.resolver/v1` conformance checks (ADR-0004 pillar 5). */
export const credentialsResolverV1ConformanceChecks: ReadonlyArray<
  ConformanceCheck<CredentialsResolverSubject>
> = [
  {
    id: `${CREDENTIALS_RESOLVER_V1}#get-returns-opaque-handle`,
    description: "get resolves a declared name to an opaque SecretRef",
    run: async ({ resolver, fixture }) => {
      const ref = await resolver.get(fixture.declaredName);
      ensure(isSecretRef(ref), "get did not resolve to an opaque SecretRef");
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#get-async`,
    description: "get returns a Promise",
    run: async ({ resolver, fixture }) => {
      const returned = resolver.get(fixture.declaredName);
      ensure(
        typeof (returned as { then?: unknown }).then === "function",
        "get did not return a Promise",
      );
      await returned;
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#get-never-leaks-plaintext`,
    description: "the SecretRef from get does not carry the credential plaintext",
    run: async ({ resolver, fixture }) => {
      const ref = await resolver.get(fixture.declaredName);
      ensure(
        !detectSecretLeak(JSON.stringify(ref), [fixture.declaredPlaintext])
          .leaked,
        "the resolved SecretRef contained the credential plaintext",
      );
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#get-rejects-undeclared`,
    description: "get rejects with an Error for an undeclared logical name",
    run: async ({ resolver, fixture }) => {
      const reason = await expectRejection(() =>
        resolver.get(fixture.undeclaredName),
      );
      ensure(
        reason instanceof Error,
        "get rejected with a non-Error value for an undeclared name",
      );
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#refresh-returns-opaque-handle`,
    description: "refresh resolves to an opaque SecretRef",
    run: async ({ resolver, fixture }) => {
      const ref = await resolver.get(fixture.declaredName);
      const refreshed = await resolver.refresh(ref);
      ensure(
        isSecretRef(refreshed),
        "refresh did not resolve to an opaque SecretRef",
      );
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#refresh-async`,
    description: "refresh returns a Promise",
    run: async ({ resolver, fixture }) => {
      const ref = await resolver.get(fixture.declaredName);
      const returned = resolver.refresh(ref);
      ensure(
        typeof (returned as { then?: unknown }).then === "function",
        "refresh did not return a Promise",
      );
      await returned;
    },
  },
  {
    id: `${CREDENTIALS_RESOLVER_V1}#refresh-never-leaks-plaintext`,
    description:
      "the SecretRef from refresh does not carry the credential plaintext",
    run: async ({ resolver, fixture }) => {
      const ref = await resolver.get(fixture.declaredName);
      const refreshed = await resolver.refresh(ref);
      ensure(
        !detectSecretLeak(JSON.stringify(refreshed), [
          fixture.declaredPlaintext,
        ]).leaked,
        "the refreshed SecretRef contained the credential plaintext",
      );
    },
  },
  observabilityCheck<CredentialsResolverSubject>(CREDENTIALS_RESOLVER_V1),
];

/** Plaintext vault for the reference resolver — never exposed via a handle. */
const REFERENCE_VAULT: Readonly<Record<string, string>> = {
  "api-key": "REFERENCE-PLAINTEXT-DO-NOT-LOG",
};

/**
 * Minimal conformant `credentials.resolver/v1` implementation: resolves a
 * declared name to an opaque `secret-ref:<name>` handle, rejects undeclared
 * names, and never lets plaintext escape `REFERENCE_VAULT`.
 */
export const referenceCredentialsResolverV1: CredentialsResolverV1 = {
  get(name) {
    if (Object.prototype.hasOwnProperty.call(REFERENCE_VAULT, name)) {
      return Promise.resolve({ __metaswarm_secret: true, id: `secret-ref:${name}` });
    }
    return Promise.reject(new Error(`undeclared credential: ${name}`));
  },
  refresh(ref) {
    return Promise.resolve({ __metaswarm_secret: true, id: `${ref.id}#refreshed` });
  },
};

/** Conformance fixture pairing the reference resolver with its declared name. */
export const referenceCredentialsFixture: CredentialsConformanceFixture = {
  declaredName: "api-key",
  declaredPlaintext: "REFERENCE-PLAINTEXT-DO-NOT-LOG",
  undeclaredName: "undeclared-key",
};

/** Run the full `credentials.resolver/v1` conformance suite. */
export function runCredentialsResolverV1Conformance(
  resolver: CredentialsResolverV1,
  fixture: CredentialsConformanceFixture,
): Promise<ConformanceReport> {
  return runConformanceSuite(
    CREDENTIALS_RESOLVER_V1,
    credentialsResolverV1ConformanceChecks,
    { resolver, fixture },
  );
}
