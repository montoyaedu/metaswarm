// SecretRef-plaintext leak detector — unit tests (WU6, DoD S1).
//
// References: plan §4 WU6 row; ADR-0006 §"Secrets are never logged".

import { describe, expect, it } from "vitest";
import { detectSecretLeak } from "../../../src/pack-system/audit/leak-detector.js";

describe("detectSecretLeak", () => {
  it("reports no leak when no secrets are active", () => {
    const result = detectSecretLeak('{"payload":{"k":"v"}}', []);
    expect(result).toEqual({ leaked: false, leakCount: 0 });
  });

  it("reports no leak when no active secret appears in the input", () => {
    const result = detectSecretLeak('{"payload":{"k":"v"}}', [
      "super-secret-token",
    ]);
    expect(result).toEqual({ leaked: false, leakCount: 0 });
  });

  it("detects a secret plaintext that appears verbatim", () => {
    const result = detectSecretLeak('{"payload":{"token":"hunter2-xyz"}}', [
      "hunter2-xyz",
    ]);
    expect(result).toEqual({ leaked: true, leakCount: 1 });
  });

  it("counts each distinct leaked secret", () => {
    const serialized = '{"a":"AKIA-LEAK","b":"pw-LEAK","c":"clean"}';
    const result = detectSecretLeak(serialized, [
      "AKIA-LEAK",
      "pw-LEAK",
      "not-present",
    ]);
    expect(result).toEqual({ leaked: true, leakCount: 2 });
  });

  it("ignores empty-string secrets (a zero-length needle would match everything)", () => {
    const result = detectSecretLeak('{"payload":{}}', [""]);
    expect(result).toEqual({ leaked: false, leakCount: 0 });
  });

  it("deduplicates repeated secret values so each is counted once", () => {
    const result = detectSecretLeak('{"t":"dup-secret"}', [
      "dup-secret",
      "dup-secret",
    ]);
    expect(result).toEqual({ leaked: true, leakCount: 1 });
  });
});
