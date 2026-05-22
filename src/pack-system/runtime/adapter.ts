// RuntimeAdapter contract + runtime-binding resolution (WU9).
//
// `RuntimeAdapter` is the single v0 adapter-family contract (ADR-0001). An
// adapter is, at its core, a factory of `RuntimeHost`s: the production
// `ClaudeCodeRuntimeAdapter` produces real-I/O hosts, the `MockRuntimeAdapter`
// produces recording hosts. This module also holds the pure binding-resolution
// logic both adapters share — projecting `runtime_bindings` to the binding
// spec for a given (pack, capability, runtime) and loading the bound module.
//
// References:
//   - Plan §4 WU9 row; ADR-0001 §"v0 materialized contract".
//   - ADR-0004 §"runtime_bindings shape" (per-runtime-keyed map).

import type {
  BindingSpec,
  CapabilityId,
  PackDescriptor,
  RuntimeAdapterId,
} from "../types/index.js";
import type { RuntimeHost } from "./types.js";

/**
 * The runtime adapter contract — the only adapter-family contract v0
 * materializes (ADR-0001). An adapter creates the {@link RuntimeHost} a
 * capability of `pack` executes against.
 */
export interface RuntimeAdapter {
  /** This adapter's runtime id — the key it resolves in `runtime_bindings`. */
  readonly id: RuntimeAdapterId;
  /** Create the I/O host a capability of `pack` runs against. */
  createHost(pack: PackDescriptor): RuntimeHost;
  /**
   * Resolve `pack`'s `runtime_bindings` for `capabilityId` under THIS
   * adapter's runtime and load the bound capability module via `importer`.
   * Throws when the pack declares no binding for this runtime.
   */
  loadCapability(
    pack: PackDescriptor,
    capabilityId: CapabilityId,
    importer: ModuleImporter,
  ): Promise<unknown>;
}

/**
 * Resolve the {@link BindingSpec} for `(pack, capabilityId, runtimeId)` from
 * `runtime_bindings`, or `undefined` when the pack declares no such binding.
 * A pure projection — no I/O, no state.
 */
export function resolveBindingSpec(
  pack: PackDescriptor,
  capabilityId: CapabilityId,
  runtimeId: RuntimeAdapterId,
): BindingSpec | undefined {
  const perRuntime = pack.runtime_bindings[capabilityId];
  if (perRuntime === undefined) {
    return undefined;
  }
  return perRuntime[runtimeId];
}

/**
 * A module importer. Injectable so the adapters are testable without a real
 * capability module on disk (fixture packs land in WU12); the production call
 * site passes a dynamic `import()`.
 */
export type ModuleImporter = (modulePath: string) => Promise<unknown>;

/**
 * Resolve the runtime binding for `(pack, capabilityId, runtimeId)` and load
 * the bound capability module via `importer`. v0 binding kind is always
 * `ts-module` (the only `BindingSpec` variant); the importer receives its
 * `path`.
 *
 * @throws Error when the pack declares no binding for that capability/runtime.
 */
export async function loadCapabilityModule(
  pack: PackDescriptor,
  capabilityId: CapabilityId,
  runtimeId: RuntimeAdapterId,
  importer: ModuleImporter,
): Promise<unknown> {
  const spec = resolveBindingSpec(pack, capabilityId, runtimeId);
  if (spec === undefined) {
    throw new Error(
      `pack '${pack.name}' declares no runtime binding for capability ` +
        `'${capabilityId}' under runtime '${runtimeId}'`,
    );
  }
  return importer(spec.path);
}
