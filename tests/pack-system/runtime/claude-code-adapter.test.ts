// ClaudeCodeRuntimeAdapter — tests (WU9).

import { describe, expect, it, vi } from "vitest";
import {
  ClaudeCodeRuntimeAdapter,
  type ClaudeCodeRuntimeOptions,
} from "../../../src/pack-system/runtime/claude-code/claude-code-adapter.js";
import type {
  CredentialsResolverV1,
  SecretRef,
} from "../../../src/pack-system/capabilities/credentials-resolver/types.js";
import type {
  CapabilityId,
  PackDescriptor,
} from "../../../src/pack-system/types/index.js";
import type { EmitterEvent } from "../../../src/pack-system/audit/types.js";
import { baseDescriptor } from "../validators/_fixtures.js";
import { baseContext, baseEmitter, baseFilledEvent } from "../audit/_fixtures.js";

const secret: SecretRef = { __metaswarm_secret: true, id: "api-key" };

const stubResolver: CredentialsResolverV1 = {
  get: () => Promise.resolve({ __metaswarm_secret: true, id: "stub" }),
  refresh: (ref) => Promise.resolve(ref),
};

function options(
  over: Partial<ClaudeCodeRuntimeOptions> = {},
): ClaudeCodeRuntimeOptions {
  return {
    httpTransport: vi.fn().mockResolvedValue({ status: 200, body: "ok" }),
    stateWriter: vi.fn().mockResolvedValue(undefined),
    eventSink: vi.fn(),
    runtimeContext: () => baseContext(),
    dereferenceSecret: vi.fn().mockResolvedValue("PLAINTEXT-SECRET"),
    credentialsResolver: stubResolver,
    ...over,
  };
}

const pack: PackDescriptor = baseDescriptor();

describe("ClaudeCodeRuntimeAdapter", () => {
  it("has the claude-code runtime id and creates claude-code hosts", () => {
    const adapter = new ClaudeCodeRuntimeAdapter(options());
    expect(adapter.id).toBe("claude-code");
    expect(adapter.createHost(pack).runtimeId).toBe("claude-code");
  });

  it("exposes the injected credentials resolver on the host", () => {
    const host = new ClaudeCodeRuntimeAdapter(
      options({ credentialsResolver: stubResolver }),
    ).createHost(pack);
    expect(host.credentials).toBe(stubResolver);
  });

  it("loadCapability resolves the claude-code binding and imports the module", async () => {
    const importer = vi.fn().mockResolvedValue({ loaded: true });
    const mod = await new ClaudeCodeRuntimeAdapter(options()).loadCapability(
      pack,
      "integrations.provider/v1" as CapabilityId,
      importer,
    );
    expect(importer).toHaveBeenCalledWith("./runtime/integrations-provider.ts");
    expect(mod).toEqual({ loaded: true });
  });
});

describe("ClaudeCodeRuntimeHost — httpRequest", () => {
  it("passes plain-string headers verbatim to the transport", async () => {
    const httpTransport = vi.fn().mockResolvedValue({ status: 201, body: "created" });
    const host = new ClaudeCodeRuntimeAdapter(
      options({ httpTransport }),
    ).createHost(pack);
    const response = await host.httpRequest({
      method: "GET",
      url: "https://x",
      headers: { Accept: "application/json" },
    });
    expect(response).toEqual({ status: 201, body: "created" });
    expect(httpTransport).toHaveBeenCalledWith(
      { method: "GET", url: "https://x", body: undefined },
      { Accept: "application/json" },
    );
  });

  it("dereferences a SecretRef header to plaintext at the adapter boundary, and never leaks it back (S1)", async () => {
    const httpTransport = vi.fn().mockResolvedValue({ status: 200, body: "ok" });
    const dereferenceSecret = vi.fn().mockResolvedValue("PLAINTEXT-SECRET");
    const host = new ClaudeCodeRuntimeAdapter(
      options({ httpTransport, dereferenceSecret }),
    ).createHost(pack);
    const response = await host.httpRequest({
      method: "POST",
      url: "https://x",
      headers: { Authorization: secret },
      body: "payload",
    });
    expect(dereferenceSecret).toHaveBeenCalledWith(secret);
    // The transport receives plaintext; pack code passed only the handle.
    expect(httpTransport).toHaveBeenCalledWith(
      { method: "POST", url: "https://x", body: "payload" },
      { Authorization: "PLAINTEXT-SECRET" },
    );
    // The response handed back to pack code carries no plaintext.
    expect(JSON.stringify(response)).not.toContain("PLAINTEXT-SECRET");
  });

  it("handles a request with no headers", async () => {
    const httpTransport = vi.fn().mockResolvedValue({ status: 200, body: "ok" });
    const host = new ClaudeCodeRuntimeAdapter(
      options({ httpTransport }),
    ).createHost(pack);
    await host.httpRequest({ method: "GET", url: "https://x" });
    expect(httpTransport).toHaveBeenCalledWith(
      { method: "GET", url: "https://x", body: undefined },
      {},
    );
  });
});

describe("ClaudeCodeRuntimeHost — writeState and emit", () => {
  it("routes writeState to the injected state writer with the pack name", async () => {
    const stateWriter = vi.fn().mockResolvedValue(undefined);
    const host = new ClaudeCodeRuntimeAdapter(
      options({ stateWriter }),
    ).createHost(pack);
    await host.writeState("notes.md", "hello");
    expect(stateWriter).toHaveBeenCalledWith(
      "example-minimal",
      "notes.md",
      "hello",
    );
  });

  it("runtime-fills an emitted event and routes it to the event sink", () => {
    const eventSink = vi.fn();
    const host = new ClaudeCodeRuntimeAdapter(
      options({ eventSink, runtimeContext: () => baseContext() }),
    ).createHost(pack);
    host.emit(baseEmitter());
    expect(eventSink).toHaveBeenCalledWith("example-minimal", baseFilledEvent());
  });

  it("throws when a pack-emitted event carries a runtime-filled field (S4)", () => {
    const host = new ClaudeCodeRuntimeAdapter(options()).createHost(pack);
    expect(() =>
      host.emit({ ...baseEmitter(), pack_id: "forged" } as unknown as EmitterEvent),
    ).toThrow(/runtime-fill enforcement/);
  });
});
