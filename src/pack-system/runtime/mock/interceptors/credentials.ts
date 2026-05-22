// Mock credential interceptor (WU9).
//
// Builds the deterministic mock `credentials.resolver/v1` for
// `MockRuntimeAdapter`: it resolves any logical name to an opaque mock
// `SecretRef` and reports every resolution to the host's ordered side-effect
// log. There is no real secret store and no plaintext — a pack that uses
// credentials runs under the mock adapter with no environment configured, and
// the recorded resolutions never carry a secret value (DoD S1).
//
// References: plan §4 WU9 row; ADR-0004 §"SecretRef opaque handle".

import type {
  CredentialsResolverV1,
  SecretRef,
} from "../../../capabilities/credentials-resolver/types.js";
import type { JsonObject } from "../../types.js";

/** Callback the mock resolver reports each resolution to (host log). */
export type CredentialResolutionRecorder = (detail: JsonObject) => void;

/**
 * Build the deterministic mock `credentials.resolver/v1`. Every `get`/`refresh`
 * is reported to `record` (in call order) and yields an opaque mock
 * `SecretRef`; no plaintext is ever produced or recorded.
 */
export function createMockCredentialsResolver(
  record: CredentialResolutionRecorder,
): CredentialsResolverV1 {
  return {
    get: (name: string): Promise<SecretRef> => {
      record({ op: "get", name });
      return Promise.resolve({
        __metaswarm_secret: true,
        id: `mock-secret:${name}`,
      });
    },
    refresh: (ref: SecretRef): Promise<SecretRef> => {
      record({ op: "refresh", ref: ref.id });
      return Promise.resolve({
        __metaswarm_secret: true,
        id: `${ref.id}#refreshed`,
      });
    },
  };
}
