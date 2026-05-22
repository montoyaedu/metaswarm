// Mock filesystem interceptor (WU9).
//
// Shapes the recorded detail of a pack-private state write. Under
// `MockRuntimeAdapter` no file ever touches disk; the host records the write
// in its ordered side-effect log.
//
// References: plan §4 WU9 row.

import type { JsonObject } from "../../types.js";

/** The recorded detail of a pack-private state write. */
export function stateWriteDetail(
  relativePath: string,
  contents: string,
): JsonObject {
  return { relativePath, contents };
}
