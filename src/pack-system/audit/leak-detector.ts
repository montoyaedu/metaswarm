// SecretRef-plaintext leak detector (WU6).
//
// ADR-0004 makes `SecretRef` an opaque handle so secret *plaintext* never
// reaches pack space; ADR-0006 adds a defence-in-depth check at the audit
// sink: before a record is written, the runtime checks the serialized record
// against every active secret's plaintext and rejects the append if a secret
// appears verbatim. This catches the case where a credential's plaintext
// reached an event payload through some path the opaque-handle discipline
// did not cover.
//
// Mechanism note: ADR-0006 phrases this as "hashes all known active SecretRef
// plaintext values and rejects any event whose serialized payload contains a
// match." Detecting a *plaintext* leak in serialized output is, concretely, a
// verbatim substring search for each plaintext — that is what this module
// does. The result deliberately reports only a count, never the secret value
// or its location, so the detector itself cannot become a leak.
//
// References:
//   - Plan §4 WU6 row (SecretRef-plaintext leak detector at append).
//   - ADR-0006 §"Secrets are never logged".
//   - ADR-0004 §"SecretRef opaque handle".
//   - docs/principles.md#invariant-22 (secrets never logged — DoD S1).

/** Outcome of a leak scan. Never carries the secret value itself. */
export interface SecretLeakResult {
  /** True when at least one active secret appeared verbatim in the input. */
  readonly leaked: boolean;
  /** How many distinct active secret values were found verbatim. */
  readonly leakCount: number;
}

/**
 * Scan `serialized` (a serialized audit record) for any active secret
 * plaintext. Empty-string secrets are skipped — a zero-length needle would
 * "match" every record and is never a real secret.
 */
export function detectSecretLeak(
  serialized: string,
  secrets: Iterable<string>,
): SecretLeakResult {
  let leakCount = 0;
  for (const secret of new Set(secrets)) {
    if (secret.length === 0) {
      continue;
    }
    if (serialized.includes(secret)) {
      leakCount += 1;
    }
  }
  return { leaked: leakCount > 0, leakCount };
}
