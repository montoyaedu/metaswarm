# ADR-0009: Original Five Open Questions — Formal Closure

**Status**: Proposed — pending design review gate
**Date**: 2026-05-06
**Decision drivers** (in priority order):
1. Contractual quality
2. Composability
3. Explainability

## Context

At the start of the brainstorm that produced this ADR set, five open questions were left explicitly unresolved pending the architectural exploration:

1. **Distribution** — should packs be Claude Code plugins, separate repos, both?
2. **Versioning** — how do packs constrain core versions; how are breaking changes managed?
3. **Test harness** — does the core ship one; what does it cover?
4. **Marketplace** — does v0 include one; if not, when?
5. **Credentials** — where do secrets live; how do packs access them?

After the closure of decisions A through H, these five remain to be formally archived with their final v0 answers and the constraints they impose on implementation.

## Decision

**1. Distribution.**

- v0: subdir in the metaswarm-core monorepo (`metaswarm-core/examples/packs/<name>-fixture/`). Zero distribution overhead; schema and validators in-tree; `metaswarm pack test` runs from the subdir.
- v0.5+: extraction into separate repos, distributed via npm (`@metaswarm/<name>-pack`) or git URL. Schema published as `@metaswarm/pack-schema`.
- v1+: dedicated metaswarm marketplace as a *packaging adapter* (a candidate family materialized at v0.5+ per ADR-0001 revision; tracked in ADR-0010).

The pack format is identical across all three stages. Distribution and format are orthogonal (invariant 27); the pack must not depend on its distribution channel.

**v0.5 distribution gate (NEW — per first-round design review honesty pass).** v0.5's npm distribution path is **conditional** on a future *Isolation ADR* (tracked in ADR-0010) landing first. The trust model "pack source code AND ALL TRANSITIVE DEPENDENCIES are trusted" (ADR-0001) is acceptable for v0 because v0 ships only first-party in-tree fixture packs. Once external authors can publish packs via npm, the trust model breaks; **v0.5 cannot ship before the Isolation ADR provides a coherent v0.5+ trust model.**

**2. Versioning.**

Three independent version axes:

| Axis | Meaning | Example |
|---|---|---|
| `pack_format` | manifest envelope contract | `0.1`, `1.0` |
| `version` (of the pack) | semver of pack content | `0.3.2` |
| capability major in identifier | per-capability evolution | `routing.task-router/v2` |

Plus two compatibility mechanisms:

- `requires.metaswarm: ">=0.11"` — minimum core version.
- `requires.capabilities: [routing.task-router/v1, ...]` — capability negotiation, not just version check.

Default deprecation window: two minor core releases. During the window, both capability majors coexist with warnings; after the window, the loader rejects deprecated majors with an explicit error.

`pack_format: 0.x` allows breaking changes between minors. `pack_format: 1.0` is the format-stability commitment moment, not now.

**3. Test harness.**

Provided by the core. Mandatory. Sixteen verification categories. See ADR-0008.

**4. Marketplace.**

Not in v0. Pack format must be marketplace-ready (manifest discovery-friendly, signed-source-ready, semantic versioning rigorous, conformance suites runnable in isolation), but no marketplace ships in v0. Marketplace is a *packaging adapter* added when the pack format has been validated by 3+ real packs.

**5. Credentials (REVISED per first-round design review — `SecretRef` opaque handle, env-var resolver only v0).**

Four-property architecture:

- **Pack declares facts** in the manifest: `credentials.required` lists logical names with required scope, never values.
- **Resolution via L2 capability returning `SecretRef`**: `credentials.resolver/v1.get(name) → SecretRef` (ADR-0004). The pack receives an **opaque handle**, never plaintext. Plaintext is dereferenced only inside the `IntegrationsProvider.invoke` adapter call boundary, never in pack space. This makes invariant 22 ("secrets never logged") mechanically enforced rather than principled.
- **Pack-scoped resolution.** The runtime injects the calling `pack_id` into `resolver.get()`; the resolver rejects logical names not declared in the calling pack's `credentials.required` manifest entry. A pack cannot enumerate credentials it did not declare.
- **v0 ships ONE resolver implementation: env-var.** Configuration in `.metaswarm/credentials.yaml` (project-scoped, gitignored) maps `<pack-id>.<logical-name>` → `<ENV_VAR_NAME>`. System keychain (macOS Keychain, libsecret, Windows Credential Manager), 1Password CLI, AWS Secrets Manager are **deferred to v0.5+** (ADR-0010, with promotion criteria).

Strong constraints (v0):

- **Secrets never enter the audit trail**, not even tagged (invariant 22). Enforced by `SecretRef` indirection plus runtime-side leak detector at `JsonlAuditWriter.append()` (ADR-0006).
- **Resolution is on-demand, not ahead-of-time** — the runtime does not load all secrets at `on_load`; it asks for them when needed. Reduces blast radius.
- **Rotation supported via `credentials.resolver/v1.refresh(SecretRef)`** — the resolver can invalidate and re-fetch credentials.
- **Pack code never sees plaintext.** All adapter-call sites that need plaintext are in core-reviewed adapter implementations, not in pack `runtime_bindings`.

## Alternatives considered

- **Marketplace from v0**: rejected because format stability is the prerequisite; shipping a marketplace before the format has been validated by real packs would lock in mistakes.
- **Distribution as Claude Code plugins only**: rejected because it ties the format to a single distribution channel (invariant 27).
- **Single version field instead of three**: rejected because the three axes evolve independently; conflating them creates breaking-change discipline that does not match either axis cleanly.
- **Secrets in `.metaswarm/secrets/` plaintext** with file-permission protection: rejected because plaintext on disk is the wrong default for credentials; system keychain or external resolver is the right default.
- **Secrets as environment variables loaded into pack memory at startup**: rejected because it broadens blast radius (a process leak exposes all credentials); on-demand resolution via capability is safer.

## Rejected temptations

- **"Just use env vars for credentials, that's what everyone does"**: tempting because env vars are simple. Rejected because the pack does not control its own process; the resolver capability gives the runtime control over storage and rotation, which env vars cannot.
- **"Ship the marketplace early to drive adoption"**: tempting because a marketplace creates a flywheel. Rejected because shipping a marketplace built on an unvalidated format means re-publishing every pack on the first format change.

## Consequences

**Positive**: implementation order is constrained and clear (synthesis §10); credential infrastructure is L2-bounded; format evolution path is explicit; marketplace remains a future option without retrofit.

**Negative**: v0 distribution model (subdir) is awkward for external pack authors; credential resolver implementations require platform-specific code (Keychain, libsecret, etc.).

**Follow-up needed**: implementation of `credentials.resolver/v1` includes at least env-var and system-keychain implementations; deprecation window mechanics are specified in `PackLoader` and tested in the harness.

## Deferred complexity

- **Marketplace, public registry, signing**: deferred to v1+.
- **Pack-to-pack capability negotiation** beyond version check: deferred to v0.5+.
- **Cross-runtime credential portability**: deferred until the second runtime adapter ships.
- **Secret rotation policy** beyond manual `refresh`: deferred indefinitely.

## Invariants introduced or strengthened

- 22, 27 — see `docs/principles.md`.
- Strengthens 8 (capability boundary) by giving credentials a capability-bounded home.

## Related ADRs

- **Depends on**: ADR-0000 through ADR-0008.
- **Refined by**: marketplace ADR (forthcoming, post-v0).
- **Supersedes**: none.
