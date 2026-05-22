// Cross-runtime parity — tests (WU9, DoD A3 foundation).
//
// ADR-0008 cat. 12 makes the headless invariant mechanical: a capability must
// produce identical observable outcomes under `ClaudeCodeRuntimeAdapter` and
// `MockRuntimeAdapter`. This test demonstrates the foundation — a deterministic
// capability driven through both adapters yields the same side-effect trace.
// Final cat. 12 green-lighting is WU10.

import { describe, expect, it } from "vitest";
import { MockRuntimeAdapter } from "../../../src/pack-system/runtime/mock/mock-adapter.js";
import { ClaudeCodeRuntimeAdapter } from "../../../src/pack-system/runtime/claude-code/claude-code-adapter.js";
import type {
  RuntimeHost,
  SideEffectRecord,
} from "../../../src/pack-system/runtime/types.js";
import { baseDescriptor } from "../validators/_fixtures.js";
import { baseContext, baseEmitter } from "../audit/_fixtures.js";

/** A deterministic demo capability — one of each host operation. */
async function runDemoCapability(host: RuntimeHost): Promise<void> {
  await host.httpRequest({
    method: "GET",
    url: "https://api.example/data",
    headers: { "X-Trace": "t-1" },
  });
  await host.writeState("progress.json", '{"step":1}');
  host.emit(baseEmitter({ event_type: "capability.invoked" }));
}

describe("cross-runtime parity (A3 foundation, ADR-0008 cat. 12)", () => {
  it("MockRuntimeAdapter records a deterministic side-effect trace", async () => {
    const pack = baseDescriptor();
    const first = new MockRuntimeAdapter().createHost(pack);
    await runDemoCapability(first);
    const second = new MockRuntimeAdapter().createHost(pack);
    await runDemoCapability(second);
    expect(first.recordedEffects()).toEqual(second.recordedEffects());
  });

  it("a deterministic capability drives both adapters through the same operation sequence (A3 foundation)", async () => {
    // This is the A3 *foundation*, not the final cat. 12 check. The Claude
    // Code arm below uses test-authored recording transports — the real
    // cross-runtime recorder (a CC adapter run against core-shipped fakes)
    // lands in WU8/WU10. What this proves: the same deterministic capability
    // issues the same ordered host calls regardless of adapter.
    const pack = baseDescriptor();

    const mockHost = new MockRuntimeAdapter().createHost(pack);
    await runDemoCapability(mockHost);
    const mockEffects = mockHost.recordedEffects();

    // Claude Code run — test recording transports capture the same operations.
    const ccEffects: SideEffectRecord[] = [];
    const ccHost = new ClaudeCodeRuntimeAdapter({
      httpTransport: (request, headers) => {
        ccEffects.push({
          kind: "http-request",
          pack: pack.name,
          detail: { method: request.method, url: request.url, headers },
        });
        return Promise.resolve({ status: 200, body: "ok" });
      },
      stateWriter: (_packName, relativePath, contents) => {
        ccEffects.push({
          kind: "state-write",
          pack: pack.name,
          detail: { relativePath, contents },
        });
        return Promise.resolve();
      },
      eventSink: (_packName, event) => {
        ccEffects.push({
          kind: "event",
          pack: pack.name,
          detail: { event_type: event.event_type, payload: event.payload },
        });
      },
      runtimeContext: () => baseContext(),
      dereferenceSecret: () =>
        Promise.reject(new Error("the parity demo uses no secrets")),
      credentialsResolver: {
        get: () => Promise.resolve({ __metaswarm_secret: true, id: "stub" }),
        refresh: (ref) => Promise.resolve(ref),
      },
    }).createHost(pack);
    await runDemoCapability(ccHost);

    expect(ccEffects).toEqual(mockEffects);
  });
});
