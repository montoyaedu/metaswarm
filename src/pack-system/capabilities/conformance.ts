// Capability conformance harness — shared machinery (WU7).
//
// ADR-0004 specifies every v0 capability along six pillars; pillar 5 is the
// **conformance suite** — the executable contract an implementation must
// satisfy. This module is the capability-agnostic core of that machinery: a
// `ConformanceCheck` is one contract assertion, a suite is a list of them,
// and `runConformanceSuite` runs a suite against an implementation and
// reports per-check outcomes.
//
// A check signals conformance by returning normally and non-conformance by
// throwing — the thrown error's message becomes the failure detail. The
// runner never lets a check crash the suite: every check runs, every outcome
// is recorded. This is the runner WU8 harness category 3 ("Capability
// conformance") drives, and WU9 reuses for cross-runtime parity.
//
// References:
//   - Plan §4 WU7 row (conformance suites in code).
//   - Plan §4.2 (capability conformance assertions feed the contract-coverage
//     denominator — DoD Q2).
//   - ADR-0004 §"Six-pillar capability specification" (pillar 5).
//   - ADR-0008 §"Capability conformance" (the harness consumes these suites).

/**
 * One contract assertion in a capability conformance suite. `run` verifies a
 * single property of `impl`; it returns (or resolves) when the property holds
 * and throws (or rejects) — with an explanatory message — when it does not.
 */
export interface ConformanceCheck<TImpl> {
  /** Stable assertion id, e.g. `routing.task-router/v1#determinism`. */
  readonly id: string;
  /** One-line statement of the property the check verifies. */
  readonly description: string;
  /** Verify the property against `impl`; throw/reject to signal failure. */
  run(impl: TImpl): Promise<void> | void;
}

/** The outcome of running one {@link ConformanceCheck}. */
export interface ConformanceCheckOutcome {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  /** Failure explanation (the thrown error's message); absent when passed. */
  readonly detail?: string;
}

/** The result of running a full conformance suite against an implementation. */
export interface ConformanceReport {
  /** The capability identifier the suite belongs to. */
  readonly capability: string;
  /** Per-check outcomes, in suite order. */
  readonly outcomes: readonly ConformanceCheckOutcome[];
  /** True iff every check passed. */
  readonly conformant: boolean;
}

/**
 * Run every check in `checks` against `impl`. A check that throws or rejects
 * is recorded as a failed outcome; it never aborts the remaining checks.
 */
export async function runConformanceSuite<TImpl>(
  capability: string,
  checks: readonly ConformanceCheck<TImpl>[],
  impl: TImpl,
): Promise<ConformanceReport> {
  const outcomes: ConformanceCheckOutcome[] = [];
  for (const check of checks) {
    try {
      await check.run(impl);
      outcomes.push({
        id: check.id,
        description: check.description,
        passed: true,
      });
    } catch (error) {
      outcomes.push({
        id: check.id,
        description: check.description,
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    capability,
    outcomes,
    conformant: outcomes.every((outcome) => outcome.passed),
  };
}

/**
 * Assertion helper for writing conformance checks: throw a check failure with
 * `message` when `condition` is false.
 */
export function ensure(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/** True iff `value` is a plain JSON object (not null, not an array). */
export function isPlainJsonObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Run `thunk` and return the reason it rejected with. Throws a check failure
 * when `thunk` resolves instead — lets a check assert a rejection without
 * its own `try`/`catch` (keeping check bodies branch-free).
 */
export async function expectRejection(
  thunk: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await thunk();
  } catch (reason) {
    return reason;
  }
  throw new Error("expected the operation to reject, but it resolved");
}
