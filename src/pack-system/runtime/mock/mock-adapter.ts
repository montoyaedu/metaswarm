// MockRuntimeAdapter — the headless parity-stub runtime (WU9).
//
// ADR-0001 ships `MockRuntimeAdapter` as the second consumer that makes the
// runtime adapter contract load-bearing and the headless invariant
// (invariant 2) mechanical rather than aspirational. It launches no Claude
// Code and makes no real I/O: every host it creates appends each capability
// I/O to a single ordered side-effect log. `recordedEffects()` preserves the
// cross-kind interleaving order, so two runs of the same deterministic
// capability produce equal logs — the foundation of ADR-0008 cat. 12
// cross-runtime parity (final-greened in WU10).
//
// References: plan §4 WU9 row; ADR-0001 §"Headless invariant enforcement";
// ADR-0008 §"MockRuntimeAdapter".

import { fillRuntimeFields } from "../../audit/event-fill.js";
import type { EmitterEvent, RuntimeContext } from "../../audit/types.js";
import type { CredentialsResolverV1 } from "../../capabilities/credentials-resolver/types.js";
import type {
  CapabilityId,
  PackDescriptor,
  RuntimeAdapterId,
} from "../../types/index.js";
import {
  loadCapabilityModule,
  type ModuleImporter,
  type RuntimeAdapter,
} from "../adapter.js";
import type {
  HostHttpRequest,
  HostHttpResponse,
  JsonObject,
  RuntimeHost,
  SideEffectKind,
  SideEffectRecord,
} from "../types.js";
import { createMockCredentialsResolver } from "./interceptors/credentials.js";
import { stateWriteDetail } from "./interceptors/fs.js";
import { httpRequestDetail, mockHttpResponse } from "./interceptors/http.js";

const MOCK_RUNTIME_ID = "mock" as RuntimeAdapterId;

/**
 * The deterministic runtime context the mock adapter fills events with — a
 * fixed stand-in for the real runtime-allocated identity/correlation fields.
 */
const MOCK_RUNTIME_CONTEXT: RuntimeContext = {
  event_id: "mock-event-id",
  timestamp: "2026-01-01T00:00:00.000Z",
  trace_id: "mock-trace-id",
  span_id: "mock-span-id",
  parent_span_id: "",
  pack_id: "mock-pack",
  correlation_id: "mock-correlation-id",
  task_id: "mock-task-id",
};

/**
 * A {@link RuntimeHost} that records every side-effect — in occurrence order —
 * instead of performing it. `recordedEffects()` exposes the deterministic log.
 */
export class MockRuntimeHost implements RuntimeHost {
  readonly runtimeId: RuntimeAdapterId = MOCK_RUNTIME_ID;

  private readonly packName: string;
  private readonly effects: SideEffectRecord[] = [];

  /** The deterministic mock credential resolver — reports into the log. */
  readonly credentials: CredentialsResolverV1;

  constructor(packName: string) {
    this.packName = packName;
    this.credentials = createMockCredentialsResolver((detail) => {
      this.record("credential-resolution", detail);
    });
  }

  httpRequest(request: HostHttpRequest): Promise<HostHttpResponse> {
    this.record("http-request", httpRequestDetail(request));
    return Promise.resolve(mockHttpResponse(request));
  }

  writeState(relativePath: string, contents: string): Promise<void> {
    this.record("state-write", stateWriteDetail(relativePath, contents));
    return Promise.resolve();
  }

  emit(event: EmitterEvent): void {
    // `fillRuntimeFields` enforces S4 — it throws if the pack-emitted event
    // carries a runtime-filled or hash-chain field — then merges the
    // deterministic mock runtime context.
    const filled = fillRuntimeFields(event, MOCK_RUNTIME_CONTEXT);
    this.record("event", {
      event_type: filled.event_type,
      payload: filled.payload,
    });
  }

  /** Every observable side-effect this host recorded, in occurrence order. */
  recordedEffects(): readonly SideEffectRecord[] {
    return [...this.effects];
  }

  private record(kind: SideEffectKind, detail: JsonObject): void {
    this.effects.push({ kind, pack: this.packName, detail });
  }
}

/** The headless parity-stub runtime adapter (ADR-0001, ADR-0008 cat. 12). */
export class MockRuntimeAdapter implements RuntimeAdapter {
  readonly id: RuntimeAdapterId = MOCK_RUNTIME_ID;

  createHost(pack: PackDescriptor): MockRuntimeHost {
    return new MockRuntimeHost(pack.name);
  }

  loadCapability(
    pack: PackDescriptor,
    capabilityId: CapabilityId,
    importer: ModuleImporter,
  ): Promise<unknown> {
    return loadCapabilityModule(pack, capabilityId, this.id, importer);
  }
}
