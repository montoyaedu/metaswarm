// ClaudeCodeRuntimeAdapter — the production runtime (WU9).
//
// ADR-0001's production runtime adapter. It routes capability I/O to real
// transports supplied at construction, and is the **sole site** that
// dereferences a `SecretRef` to plaintext — inside `httpRequest`, never in
// pack space (ADR-0004 §"SecretRef opaque handle", DoD S1).
//
// The transports are constructor-injected rather than bundled: WU9 ships the
// adapter *contract logic* (binding, the SecretRef boundary, runtime-fill
// enforcement, host wiring); the concrete network/fs/audit/credential
// transports are the integration's to provide. This keeps the adapter free of
// an untestable real-I/O default.
//
// References: plan §4 WU9 row; ADR-0001 §"v0 materialized contract".

import { fillRuntimeFields } from "../../audit/event-fill.js";
import type {
  EmitterEvent,
  RuntimeContext,
  RuntimeFilledEvent,
} from "../../audit/types.js";
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
  RuntimeHost,
  SecretRef,
} from "../types.js";

const CLAUDE_CODE_RUNTIME_ID = "claude-code" as RuntimeAdapterId;

/** Real HTTP transport — `headers` arrive already resolved to plaintext. */
export type HttpTransport = (
  request: { method: string; url: string; body: string | undefined },
  headers: Readonly<Record<string, string>>,
) => Promise<HostHttpResponse>;

/** Real pack-private state writer. */
export type StateWriter = (
  packName: string,
  relativePath: string,
  contents: string,
) => Promise<void>;

/** Observability event sink — receives the runtime-filled event. */
export type EventSink = (packName: string, event: RuntimeFilledEvent) => void;

/** Supplies the runtime-allocated identity/correlation fields for an event. */
export type RuntimeContextProvider = () => RuntimeContext;

/**
 * Dereference a `SecretRef` to plaintext — the credential-store boundary.
 * Async: a real credential store (keychain, cloud secrets) resolves
 * asynchronously.
 */
export type SecretDereferencer = (ref: SecretRef) => Promise<string>;

/** Transports the production adapter routes capability I/O through. */
export interface ClaudeCodeRuntimeOptions {
  readonly httpTransport: HttpTransport;
  readonly stateWriter: StateWriter;
  readonly eventSink: EventSink;
  readonly runtimeContext: RuntimeContextProvider;
  readonly dereferenceSecret: SecretDereferencer;
  /** The production `credentials.resolver/v1` (the env-var resolver, WU11). */
  readonly credentialsResolver: CredentialsResolverV1;
}

/** A {@link RuntimeHost} backed by the production transports. */
class ClaudeCodeRuntimeHost implements RuntimeHost {
  readonly runtimeId: RuntimeAdapterId = CLAUDE_CODE_RUNTIME_ID;

  private readonly packName: string;
  private readonly options: ClaudeCodeRuntimeOptions;
  readonly credentials: CredentialsResolverV1;

  constructor(packName: string, options: ClaudeCodeRuntimeOptions) {
    this.packName = packName;
    this.options = options;
    this.credentials = options.credentialsResolver;
  }

  async httpRequest(request: HostHttpRequest): Promise<HostHttpResponse> {
    // SecretRef headers are dereferenced HERE — inside the adapter boundary.
    // The resolved plaintext goes only to the transport, never back to pack
    // code, which passed (and still holds) only the opaque handle (DoD S1).
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers[name] =
        typeof value === "string"
          ? value
          : await this.options.dereferenceSecret(value);
    }
    return this.options.httpTransport(
      { method: request.method, url: request.url, body: request.body },
      headers,
    );
  }

  writeState(relativePath: string, contents: string): Promise<void> {
    return this.options.stateWriter(this.packName, relativePath, contents);
  }

  emit(event: EmitterEvent): void {
    // `fillRuntimeFields` enforces S4: it throws if the pack-emitted event
    // already carries a runtime-filled or hash-chain field (a forgery
    // attempt), then merges the runtime context. Only the runtime-filled
    // event reaches the sink.
    this.options.eventSink(
      this.packName,
      fillRuntimeFields(event, this.options.runtimeContext()),
    );
  }
}

/** The production runtime adapter (ADR-0001). */
export class ClaudeCodeRuntimeAdapter implements RuntimeAdapter {
  readonly id: RuntimeAdapterId = CLAUDE_CODE_RUNTIME_ID;

  private readonly options: ClaudeCodeRuntimeOptions;

  constructor(options: ClaudeCodeRuntimeOptions) {
    this.options = options;
  }

  createHost(pack: PackDescriptor): RuntimeHost {
    return new ClaudeCodeRuntimeHost(pack.name, this.options);
  }

  loadCapability(
    pack: PackDescriptor,
    capabilityId: CapabilityId,
    importer: ModuleImporter,
  ): Promise<unknown> {
    return loadCapabilityModule(pack, capabilityId, this.id, importer);
  }
}
