// integrations.provider/v1 conformance suite — tests (WU7).

import { describe, expect, it } from "vitest";
import {
  type IntegrationsProviderV1,
  type JsonObject,
  integrationsProviderV1ConformanceChecks,
  referenceIntegrationsFixture,
  referenceIntegrationsProviderV1,
  runIntegrationsProviderV1Conformance,
} from "../../../src/pack-system/capabilities/integrations-provider/index.js";

/** Run the suite against `provider` (with the reference fixture) and list failures. */
async function failedChecks(
  provider: IntegrationsProviderV1,
): Promise<string[]> {
  const report = await runIntegrationsProviderV1Conformance(
    provider,
    referenceIntegrationsFixture,
  );
  return report.outcomes.filter((o) => !o.passed).map((o) => o.id);
}

describe("integrations.provider/v1 — reference implementation", () => {
  it("the reference implementation is fully conformant", async () => {
    const report = await runIntegrationsProviderV1Conformance(
      referenceIntegrationsProviderV1,
      referenceIntegrationsFixture,
    );
    expect(report.conformant).toBe(true);
    expect(report.capability).toBe("integrations.provider/v1");
  });

  it("ships a conformance check per documented semantic", () => {
    expect(
      integrationsProviderV1ConformanceChecks.length,
    ).toBeGreaterThanOrEqual(7);
  });
});

describe("integrations.provider/v1 — non-conformant implementations", () => {
  it("flags a provider that resolves for an undeclared action", async () => {
    const permissive: IntegrationsProviderV1 = {
      invoke: () => Promise.resolve({ ok: true }),
    };
    expect(await failedChecks(permissive)).toContain(
      "integrations.provider/v1#unknown-action-rejected",
    );
  });

  it("flags a provider that returns a non-canonicalizable result", async () => {
    const badResult: IntegrationsProviderV1 = {
      invoke: (actionId) =>
        actionId === referenceIntegrationsFixture.unknownActionId
          ? Promise.reject(new Error("unknown"))
          : Promise.resolve({ bad: NaN } as unknown as JsonObject),
    };
    expect(await failedChecks(badResult)).toContain(
      "integrations.provider/v1#result-canonicalizable",
    );
  });

  it("flags a non-idempotent provider for a declared-idempotent action", async () => {
    let counter = 0;
    const drifting: IntegrationsProviderV1 = {
      invoke: (actionId) =>
        actionId === referenceIntegrationsFixture.unknownActionId
          ? Promise.reject(new Error("unknown"))
          : Promise.resolve({ n: counter++ }),
    };
    expect(await failedChecks(drifting)).toContain(
      "integrations.provider/v1#idempotent-stable",
    );
  });

  it("flags a provider that mutates the args object", async () => {
    const mutating: IntegrationsProviderV1 = {
      invoke: (actionId, args) => {
        if (actionId === referenceIntegrationsFixture.unknownActionId) {
          return Promise.reject(new Error("unknown"));
        }
        (args as Record<string, unknown>).injected = true;
        return Promise.resolve({ ok: true });
      },
    };
    expect(await failedChecks(mutating)).toContain(
      "integrations.provider/v1#args-not-mutated",
    );
  });
});
