// MockRuntimeAdapter + interceptors — tests (WU9).

import { describe, expect, it, vi } from "vitest";
import { MockRuntimeAdapter } from "../../../src/pack-system/runtime/mock/mock-adapter.js";
import { redactHeaderValue } from "../../../src/pack-system/runtime/mock/interceptors/http.js";
import type { SecretRef } from "../../../src/pack-system/capabilities/credentials-resolver/types.js";
import type { CapabilityId } from "../../../src/pack-system/types/index.js";
import type { EmitterEvent } from "../../../src/pack-system/audit/types.js";
import { baseDescriptor } from "../validators/_fixtures.js";
import { baseEmitter } from "../audit/_fixtures.js";

const secret: SecretRef = { __metaswarm_secret: true, id: "api-key" };

function host() {
  return new MockRuntimeAdapter().createHost(baseDescriptor());
}

describe("redactHeaderValue", () => {
  it("keeps a plain string verbatim", () => {
    expect(redactHeaderValue("application/json")).toBe("application/json");
  });

  it("redacts a SecretRef to its opaque handle — never plaintext", () => {
    expect(redactHeaderValue(secret)).toBe("<secret:api-key>");
  });
});

describe("MockRuntimeHost — http", () => {
  it("records an http request (redacting SecretRef headers) and returns a deterministic response", async () => {
    const h = host();
    const response = await h.httpRequest({
      method: "POST",
      url: "https://api.example/x",
      headers: { Authorization: secret, Accept: "application/json" },
      body: "{}",
    });
    expect(response).toEqual({
      status: 200,
      body: "mock:POST https://api.example/x",
    });
    expect(h.recordedEffects()).toEqual([
      {
        kind: "http-request",
        pack: "example-minimal",
        detail: {
          method: "POST",
          url: "https://api.example/x",
          headers: { Authorization: "<secret:api-key>", Accept: "application/json" },
          body: "{}",
        },
      },
    ]);
  });

  it("records an http request with no headers and no body", async () => {
    const h = host();
    await h.httpRequest({ method: "GET", url: "https://x" });
    expect(h.recordedEffects()[0]?.detail).toEqual({
      method: "GET",
      url: "https://x",
      headers: {},
    });
  });
});

describe("MockRuntimeHost — state, events, credentials", () => {
  it("records a state write", async () => {
    const h = host();
    await h.writeState("progress.json", '{"step":1}');
    expect(h.recordedEffects()).toEqual([
      {
        kind: "state-write",
        pack: "example-minimal",
        detail: { relativePath: "progress.json", contents: '{"step":1}' },
      },
    ]);
  });

  it("records emitted events as event side-effects", () => {
    const h = host();
    h.emit(baseEmitter({ event_type: "capability.invoked" }));
    expect(h.recordedEffects()).toEqual([
      {
        kind: "event",
        pack: "example-minimal",
        detail: {
          event_type: "capability.invoked",
          payload: { detail: "example" },
        },
      },
    ]);
  });

  it("throws when a pack-emitted event carries a runtime-filled field (S4)", () => {
    const h = host();
    expect(() =>
      h.emit({ ...baseEmitter(), timestamp: "forged" } as unknown as EmitterEvent),
    ).toThrow(/runtime-fill enforcement/);
  });

  it("resolves credentials through the deterministic mock resolver and records them", async () => {
    const h = host();
    const ref = await h.credentials.get("buffer-token");
    expect(ref).toEqual({ __metaswarm_secret: true, id: "mock-secret:buffer-token" });
    const refreshed = await h.credentials.refresh(ref);
    expect(refreshed.id).toBe("mock-secret:buffer-token#refreshed");
    expect(h.recordedEffects()).toEqual([
      {
        kind: "credential-resolution",
        pack: "example-minimal",
        detail: { op: "get", name: "buffer-token" },
      },
      {
        kind: "credential-resolution",
        pack: "example-minimal",
        detail: { op: "refresh", ref: "mock-secret:buffer-token" },
      },
    ]);
  });

  it("records side-effects in occurrence order, interleaved across kinds", async () => {
    const h = host();
    await h.writeState("a", "1");
    await h.httpRequest({ method: "GET", url: "https://x" });
    await h.writeState("b", "2");
    expect(h.recordedEffects().map((e) => e.kind)).toEqual([
      "state-write",
      "http-request",
      "state-write",
    ]);
  });
});

describe("MockRuntimeAdapter", () => {
  it("has the mock runtime id and creates mock hosts", () => {
    const adapter = new MockRuntimeAdapter();
    expect(adapter.id).toBe("mock");
    expect(adapter.createHost(baseDescriptor()).runtimeId).toBe("mock");
  });

  it("loadCapability resolves the mock binding and imports the module", async () => {
    const importer = vi.fn().mockResolvedValue({ loaded: true });
    const mod = await new MockRuntimeAdapter().loadCapability(
      baseDescriptor(),
      "integrations.provider/v1" as CapabilityId,
      importer,
    );
    expect(importer).toHaveBeenCalledWith("./runtime/integrations-provider.ts");
    expect(mod).toEqual({ loaded: true });
  });
});
