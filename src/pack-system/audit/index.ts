// Audit-local barrel (WU6).
//
// Ergonomic import point for the audit module. Distinct from the
// manifest-surface freeze barrel at `src/pack-system/types/index.ts` — audit
// types are pack-system internals (they never appear in `pack.yaml`) and the
// freeze barrel's own header explicitly places them outside the freeze.

export { canonicalize } from "./canonicalize-rfc8785.js";
export {
  GENESIS,
  HASH_CHAIN_FIELDS,
  computeRecordHash,
  sha256Hex,
  verifyRecordHash,
} from "./hash-chain.js";
export {
  RESERVED_EVENT_FIELDS,
  RUNTIME_FILLED_FIELDS,
  fillRuntimeFields,
} from "./event-fill.js";
export { detectSecretLeak } from "./leak-detector.js";
export type { SecretLeakResult } from "./leak-detector.js";
export { JsonlAuditWriter } from "./jsonl-audit-writer.js";
export type { JsonlAuditWriterOptions } from "./jsonl-audit-writer.js";
export { verifyTrace } from "./trace-verifier.js";
export type { VerifyTraceOptions } from "./trace-verifier.js";
export type {
  AuditRecord,
  ChainBreak,
  ChainBreakKind,
  EmitterEvent,
  FieldSensitivity,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RuntimeContext,
  RuntimeFilledEvent,
  TraceVerifyResult,
} from "./types.js";
