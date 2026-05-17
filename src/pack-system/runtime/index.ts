// Runtime-local barrel (WU9).
//
// Ergonomic import point for the runtime adapter contract and its two v0
// implementations. Distinct from the manifest-surface freeze barrel — runtime
// types are pack-system internal (they never appear in `pack.yaml`).

export {
  type ModuleImporter,
  type RuntimeAdapter,
  loadCapabilityModule,
  resolveBindingSpec,
} from "./adapter.js";
export type {
  CredentialsResolverV1,
  HeaderValue,
  HostHttpRequest,
  HostHttpResponse,
  RuntimeHost,
  SideEffectKind,
  SideEffectRecord,
} from "./types.js";
export { MockRuntimeAdapter, MockRuntimeHost } from "./mock/index.js";
export { ClaudeCodeRuntimeAdapter } from "./claude-code/index.js";
export type {
  ClaudeCodeRuntimeOptions,
  EventSink,
  HttpTransport,
  RuntimeContextProvider,
  SecretDereferencer,
  StateWriter,
} from "./claude-code/index.js";
