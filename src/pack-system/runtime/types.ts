// Runtime-adapter types (WU9).
//
// The runtime adapter is the **single v0 adapter-family contract** (ADR-0001):
// the format is runtime-independent, and the only materialized contract is the
// one with a load-bearing second consumer — `MockRuntimeAdapter`. These types
// describe that contract surface: the I/O `RuntimeHost` a capability runs
// against, and the recorded side-effects the mock adapter produces.
//
// IMPORTANT: these are NOT exported from the manifest-surface freeze barrel at
// `src/pack-system/types/index.ts` — they are runtime-internal (they never
// appear in `pack.yaml`). Re-exported via `src/pack-system/runtime/index.ts`.
//
// References:
//   - Plan §4 WU9 row; ADR-0001 §"Decision" (runtime adapter = the one v0
//     contract); ADR-0004 §"runtime_bindings" (per-runtime binding map);
//     ADR-0006 §"Event taxonomy"; ADR-0008 cat. 12 (headless parity).

import type { RuntimeAdapterId } from "../types/index.js";
import type { EmitterEvent, JsonObject } from "../audit/types.js";
import type {
  CredentialsResolverV1,
  SecretRef,
} from "../capabilities/credentials-resolver/types.js";

export type {
  CredentialsResolverV1,
  EmitterEvent,
  JsonObject,
  RuntimeAdapterId,
  SecretRef,
};

/**
 * A header value passed to {@link RuntimeHost.httpRequest}. A plain string is
 * sent verbatim; a {@link SecretRef} is an opaque handle the **adapter**
 * dereferences to plaintext inside the request boundary — pack code passes
 * only the handle and never sees plaintext (ADR-0004 §"SecretRef", DoD S1).
 */
export type HeaderValue = string | SecretRef;

/** An HTTP request a capability issues through its {@link RuntimeHost}. */
export interface HostHttpRequest {
  readonly method: string;
  readonly url: string;
  /** Header values; `SecretRef`s are dereferenced by the adapter, not here. */
  readonly headers?: Readonly<Record<string, HeaderValue>>;
  readonly body?: string;
}

/** The response a {@link RuntimeHost.httpRequest} resolves to. */
export interface HostHttpResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * The interceptable I/O surface a capability implementation runs against. The
 * production adapter routes these to real transports; the mock adapter routes
 * them to recording interceptors. A capability that performs I/O does it ONLY
 * through this host — that is what makes the headless invariant (invariant 2)
 * mechanically checkable (ADR-0008 cat. 12).
 */
export interface RuntimeHost {
  /** The adapter that produced this host. */
  readonly runtimeId: RuntimeAdapterId;
  /**
   * Issue an HTTP request at the adapter boundary. This is the v0
   * `SecretRef`-dereference site: a credential is delivered by placing its
   * `SecretRef` in a header, where the adapter resolves it to plaintext just
   * before the transport call (DoD S1). An `integrations.provider/v1` action
   * that needs a credential routes it this way — the `SecretRef` rides
   * through `invoke` args as an opaque handle and is dereferenced only here.
   */
  httpRequest(request: HostHttpRequest): Promise<HostHttpResponse>;
  /** Write a file into the pack's private state directory. */
  writeState(relativePath: string, contents: string): Promise<void>;
  /** Emit an observability event (ADR-0006 emitter surface). */
  emit(event: EmitterEvent): void;
  /**
   * The runtime's `credentials.resolver/v1` — uniform across adapters so a
   * capability resolves credentials the same way under either runtime.
   */
  readonly credentials: CredentialsResolverV1;
}

/** The kind of observable side-effect the mock adapter records. */
export type SideEffectKind =
  | "http-request"
  | "state-write"
  | "credential-resolution"
  | "event";

/**
 * One observable side-effect recorded by `MockRuntimeAdapter`. `detail` never
 * carries secret plaintext — a `SecretRef` is recorded as its opaque handle
 * (DoD S1). Two runs of the same deterministic capability produce equal
 * `SideEffectRecord` lists; that is the foundation of the ADR-0008 cat. 12
 * cross-runtime parity check.
 */
export interface SideEffectRecord {
  readonly kind: SideEffectKind;
  /** The pack whose capability produced the effect. */
  readonly pack: string;
  /** Effect-specific, secret-free detail. */
  readonly detail: JsonObject;
}
