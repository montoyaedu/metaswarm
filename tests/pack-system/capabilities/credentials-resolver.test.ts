// credentials.resolver/v1 conformance suite — tests (WU7).

import { describe, expect, it } from "vitest";
import {
  type CredentialsResolverV1,
  type SecretRef,
  credentialsResolverV1ConformanceChecks,
  isSecretRef,
  referenceCredentialsFixture,
  referenceCredentialsResolverV1,
  runCredentialsResolverV1Conformance,
} from "../../../src/pack-system/capabilities/credentials-resolver/index.js";

const FIXTURE = referenceCredentialsFixture;
const PLAINTEXT = FIXTURE.declaredPlaintext;

/** Run the suite against `resolver` (with the reference fixture) and list failures. */
async function failedChecks(
  resolver: CredentialsResolverV1,
): Promise<string[]> {
  const report = await runCredentialsResolverV1Conformance(resolver, FIXTURE);
  return report.outcomes.filter((o) => !o.passed).map((o) => o.id);
}

const opaqueRef: SecretRef = { __metaswarm_secret: true, id: "ref" };

describe("isSecretRef", () => {
  it("accepts a structurally-valid opaque handle", () => {
    expect(isSecretRef(opaqueRef)).toBe(true);
  });

  it("rejects non-objects, missing brand, wrong brand, and non-string id", () => {
    expect(isSecretRef(null)).toBe(false);
    expect(isSecretRef({ id: "ref" })).toBe(false);
    expect(isSecretRef({ __metaswarm_secret: false, id: "ref" })).toBe(false);
    expect(isSecretRef({ __metaswarm_secret: true, id: 7 })).toBe(false);
  });
});

describe("credentials.resolver/v1 — reference implementation", () => {
  it("the reference implementation is fully conformant", async () => {
    const report = await runCredentialsResolverV1Conformance(
      referenceCredentialsResolverV1,
      FIXTURE,
    );
    expect(report.conformant).toBe(true);
    expect(report.capability).toBe("credentials.resolver/v1");
  });

  it("ships at least 8 conformance checks", () => {
    expect(
      credentialsResolverV1ConformanceChecks.length,
    ).toBeGreaterThanOrEqual(8);
  });
});

describe("credentials.resolver/v1 — non-conformant implementations", () => {
  it("flags a resolver that resolves an undeclared name", async () => {
    const permissive: CredentialsResolverV1 = {
      get: () => Promise.resolve(opaqueRef),
      refresh: () => Promise.resolve(opaqueRef),
    };
    expect(await failedChecks(permissive)).toContain(
      "credentials.resolver/v1#get-rejects-undeclared",
    );
  });

  it("flags a resolver whose handle leaks the credential plaintext", async () => {
    const leaky: CredentialsResolverV1 = {
      get: (name) =>
        name === FIXTURE.declaredName
          ? Promise.resolve({ __metaswarm_secret: true, id: `x:${PLAINTEXT}` })
          : Promise.reject(new Error("undeclared")),
      refresh: () => Promise.resolve(opaqueRef),
    };
    expect(await failedChecks(leaky)).toContain(
      "credentials.resolver/v1#get-never-leaks-plaintext",
    );
  });

  it("flags a resolver whose get returns a non-opaque handle", async () => {
    const badHandle: CredentialsResolverV1 = {
      get: (name) =>
        name === FIXTURE.declaredName
          ? Promise.resolve({ plaintext: "oops" } as unknown as SecretRef)
          : Promise.reject(new Error("undeclared")),
      refresh: () => Promise.resolve(opaqueRef),
    };
    expect(await failedChecks(badHandle)).toContain(
      "credentials.resolver/v1#get-returns-opaque-handle",
    );
  });

  it("flags a resolver whose refresh leaks the credential plaintext", async () => {
    const leakyRefresh: CredentialsResolverV1 = {
      get: (name) =>
        name === FIXTURE.declaredName
          ? Promise.resolve(opaqueRef)
          : Promise.reject(new Error("undeclared")),
      refresh: () =>
        Promise.resolve({ __metaswarm_secret: true, id: `r:${PLAINTEXT}` }),
    };
    expect(await failedChecks(leakyRefresh)).toContain(
      "credentials.resolver/v1#refresh-never-leaks-plaintext",
    );
  });
});
