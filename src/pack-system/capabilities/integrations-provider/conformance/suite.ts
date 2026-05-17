// `integrations.provider/v1` — conformance suite (WU7).
//
// ADR-0004 pillar 5. Each check verifies one semantic property from the spec
// against a (provider, fixture) subject — the fixture names a declared
// action, a declared idempotent action, and an undeclared action id.
// `referenceIntegrationsProviderV1` + `referenceIntegrationsFixture` are the
// in-process stub the suite is proven against.
//
// References: docs/capabilities/integrations-provider.md; plan §4 WU7 row.

import { canonicalize } from "../../../audit/canonicalize-rfc8785.js";
import {
  type ConformanceCheck,
  type ConformanceReport,
  ensure,
  expectRejection,
  isPlainJsonObject,
  runConformanceSuite,
} from "../../conformance.js";
import { observabilityCheck } from "../../observability.js";
import {
  INTEGRATIONS_PROVIDER_V1,
  type IntegrationsConformanceFixture,
  type IntegrationsProviderSubject,
  type IntegrationsProviderV1,
} from "../types.js";

/** The `integrations.provider/v1` conformance checks (ADR-0004 pillar 5). */
export const integrationsProviderV1ConformanceChecks: ReadonlyArray<
  ConformanceCheck<IntegrationsProviderSubject>
> = [
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#invoke-returns-promise`,
    description: "invoke returns a Promise",
    run: async ({ provider, fixture }) => {
      const returned = provider.invoke(fixture.knownAction.id, {
        ...fixture.knownAction.args,
      });
      ensure(
        typeof (returned as { then?: unknown }).then === "function",
        "invoke did not return a Promise",
      );
      await returned;
    },
  },
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#invoke-resolves-json-object`,
    description: "invoke resolves to a JSON object for a declared action",
    run: async ({ provider, fixture }) => {
      const result = await provider.invoke(fixture.knownAction.id, {
        ...fixture.knownAction.args,
      });
      ensure(
        isPlainJsonObject(result),
        "invoke did not resolve to a JSON object",
      );
    },
  },
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#result-canonicalizable`,
    description: "the invoke result is canonicalizable JSON (RFC 8785)",
    run: async ({ provider, fixture }) => {
      const result = await provider.invoke(fixture.knownAction.id, {
        ...fixture.knownAction.args,
      });
      // canonicalize throws on non-finite numbers / non-JSON values.
      canonicalize(result);
    },
  },
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#unknown-action-rejected`,
    description: "invoke rejects with an Error for an undeclared action id",
    run: async ({ provider, fixture }) => {
      const reason = await expectRejection(() =>
        provider.invoke(fixture.unknownActionId, {}),
      );
      ensure(
        reason instanceof Error,
        "invoke rejected with a non-Error value for an undeclared action",
      );
    },
  },
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#args-not-mutated`,
    description: "invoke does not mutate the args object",
    run: async ({ provider, fixture }) => {
      const args = { ...fixture.knownAction.args };
      const snapshot = JSON.stringify(args);
      await provider.invoke(fixture.knownAction.id, args);
      ensure(
        JSON.stringify(args) === snapshot,
        "invoke mutated the args argument",
      );
    },
  },
  {
    id: `${INTEGRATIONS_PROVIDER_V1}#idempotent-stable`,
    description:
      "a declared-idempotent action returns equal results for equal (fresh) args",
    run: async ({ provider, fixture }) => {
      const { id, args } = fixture.idempotentAction;
      const first = await provider.invoke(id, { ...args });
      const second = await provider.invoke(id, { ...args });
      ensure(
        canonicalize(first) === canonicalize(second),
        "idempotent action returned different results for equal args",
      );
    },
  },
  observabilityCheck<IntegrationsProviderSubject>(INTEGRATIONS_PROVIDER_V1),
];

/**
 * Minimal conformant `integrations.provider/v1` implementation: one declared
 * action `example.echo/v1` that echoes its args (pure, hence idempotent);
 * every other action id rejects.
 */
export const referenceIntegrationsProviderV1: IntegrationsProviderV1 = {
  invoke(actionId, args) {
    if (actionId === "example.echo/v1") {
      return Promise.resolve({ echoed: args });
    }
    return Promise.reject(new Error(`unknown action: ${actionId}`));
  },
};

/** Conformance fixture pairing the reference implementation with its actions. */
export const referenceIntegrationsFixture: IntegrationsConformanceFixture = {
  knownAction: { id: "example.echo/v1", args: { message: "hello" } },
  idempotentAction: { id: "example.echo/v1", args: { message: "stable" } },
  unknownActionId: "example.absent/v1",
};

/** Run the full `integrations.provider/v1` conformance suite. */
export function runIntegrationsProviderV1Conformance(
  provider: IntegrationsProviderV1,
  fixture: IntegrationsConformanceFixture,
): Promise<ConformanceReport> {
  return runConformanceSuite(
    INTEGRATIONS_PROVIDER_V1,
    integrationsProviderV1ConformanceChecks,
    { provider, fixture },
  );
}
