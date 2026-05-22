# ADR-0004: Capability Ontology v0

**Status**: Proposed — pending design review gate (revised after first review round)
**Date**: 2026-05-06 (revised 2026-05-07)
**Decision drivers** (in priority order):
1. Contractual quality
2. Composability
3. Explainability

## Context

L2 (capabilities) is the imperative surface of the pack format. Without governance, this surface becomes "load arbitrary code and hope" — exactly what the runtime path was built to avoid. The original ADR-0001 v1 proposed a four-capability v0 ontology (`routing.task-router/v1`, `integrations.provider/v1`, `credentials.resolver/v1`, `health.health-check/v1`).

The first review round surfaced three sharp findings: (1) `health.health-check/v1` is non-derivable for the v0 fixture pack (no concrete consumer); (2) `runtime_bindings` as a flat path leaks the JS/TS-runtime assumption into the manifest, violating invariant 2; (3) `credentials.resolver/v1` returning plaintext makes invariant 22 ("secrets never logged") an aspirational principle rather than a mechanical guarantee.

This ADR is the revised decision after that review.

## Decision

**v0 capability ontology — three capabilities (closed):**

- `routing.task-router/v1` — given a task, score how relevant this pack is.
- `integrations.provider/v1` — generic external system invocation. Per-action metadata in the manifest declares schema, side-effect profile, idempotency, permission class.
- `credentials.resolver/v1` — resolve a logical credential name to a `SecretRef` (opaque handle), with optional refresh.

`health.health-check/v1` is **deferred** to ADR-0010 with promotion criteria. v0 packs that need health expression do so via `integrations.provider/v1.invoke('<integration>.ping', {})` per integration, or via `on_load` validation for environment checks.

**Six-pillar capability specification.** Every v0 capability is specified along six axes: (1) Identifier, (2) Interface, (3) Semantics, (4) Lifecycle, (5) Conformance suite, (6) Observability contract. Each pillar's ownership (Core-authored / Implementor-authored / Both) is declared in the spec to clarify what an implementor actually has to write versus consume.

**Versioning.** Major version (`/v1` → `/v2`) lives in the identifier; patch and minor versions of the spec/conformance suite live in spec documentation. Core supports two consecutive majors during a deprecation window of two minor core releases.

**Discovery.** Manifest-declared only; no self-registration. The pack declares which capabilities it implements:

```yaml
provides:
  capabilities:
    - routing.task-router/v1
    - integrations.provider/v1
requires:
  runtimes: [claude-code, mock]   # v0: both are mandatory (no default)
runtime_bindings:
  integrations.provider/v1:
    claude-code:
      kind: ts-module
      path: ./runtime/integrations-provider.ts
    mock:
      # Required v0 — exercised by ADR-0008 cat. 12 parity test.
      # Same module is acceptable; MockRuntimeAdapter intercepts side effects
      # at the adapter boundary (HTTP fetch, fs writes, credential resolution).
      kind: ts-module
      path: ./runtime/integrations-provider.ts
    # future:
    # strands:
    #   kind: python-module
    #   path: ./runtime/integrations_provider.py
    # headless:
    #   kind: grpc
    #   address: ${METASWARM_BINDING_ADDR}
    #   service: IntegrationsProviderV1
```

**`runtime_bindings` shape (per-runtime-keyed map — revised):** the outer key is the *capability identifier*; the inner keys are *runtime adapter identifiers*; each value declares the binding shape for that adapter to consume.

**v0 mandatory binding keys (post-re-review fix).** Every capability in `provides.capabilities` MUST have binding entries for both `claude-code` AND `mock`. There is **no default** for `requires.runtimes` in v0 — the field is required and must include at minimum `[claude-code, mock]`. This guarantees that ADR-0008 cat. 12 (the cross-runtime parity test that makes invariant 2 load-bearing) is exercisable on every fixture pack, and removes any implicit-Claude-Code presupposition that a default would reintroduce. The harness verifies:
1. `requires.runtimes` is present and includes both `claude-code` and `mock`;
2. for every capability in `provides.capabilities`, the binding map includes both `claude-code` and `mock` entries;
3. the binding shape is valid for each declared runtime adapter.

This format makes the per-runtime-adapter coupling **explicit** rather than implicit-through-file-extension, satisfying invariant 2.

**`credentials.resolver/v1` — `SecretRef` opaque handle (revised):**

```typescript
interface CredentialsResolverV1 {
  get(name: string): Promise<SecretRef>;          // returns opaque handle, not plaintext
  refresh(ref: SecretRef): Promise<SecretRef>;    // rotation
}
type SecretRef = { __metaswarm_secret: true; id: string }; // opaque to pack
```

The pack receives a `SecretRef` opaque handle and passes it to `IntegrationsProvider.invoke`; plaintext is dereferenced by the runtime *only inside the adapter call boundary*, never in pack space. This collapses the "secrets never logged" enforcement surface from "everywhere a pack might log" to a single audit point (the adapter call). Invariant 22 becomes mechanical, not principled.

**Pack-scoped credential resolution.** The runtime injects the calling `pack_id` into `resolver.get()`; the resolver rejects logical names not declared in the pack's `credentials.required` manifest entry. A pack cannot enumerate credentials it did not declare.

**v0 ships ONE credential resolver implementation: env-var.** Configuration in `.metaswarm/credentials.yaml` (project-scoped, gitignored) maps `<pack-id>.<logical-name>` → `<ENV_VAR_NAME>`. System keychain (macOS Keychain, libsecret, Windows Credential Manager), 1Password CLI, AWS Secrets Manager are **deferred to v0.5+** with promotion criteria in ADR-0010.

**Integration model — Modello A (opaque + governable metadata).** `integrations.provider/v1` is one generic capability. Each action is declared in the manifest with `id` (namespaced), `input_schema`, `output_schema`, `side_effect_profile` (`scope` × `reversibility` × `governance.human_approval_required`). The core does not know what `publishing.buffer.publish/v1` does semantically, but it knows enough metadata to govern it.

**Promotion to specialized capability** (Modello B): triggered when (3+ packs converge on a domain pattern) **OR** (the core needs semantic understanding of the domain to orchestrate). Tracked candidates in ADR-0010: `integrations.calendar/v1`, `integrations.crm/v1`, `integrations.document/v1`, `workflow.state-machine/v1`.

## Alternatives considered

- **Open-ended capabilities**: rejected (breaks observability, security review, deterministic routing, testability, cross-runtime portability, capability negotiation).
- **Specialized capabilities from v0**: rejected as premature ontology design.
- **Keep `health.health-check/v1` v0**: rejected because no concrete v0 consumer needs structured health; derivable.
- **Multi-platform credential resolvers v0** (keychain/1Password/AWS): rejected because no v0 deployment needs them; env-var with `.env`-file is the v0 standard practice.
- **`runtime_bindings` as flat path**: rejected because it leaks the TS-runtime assumption (Architect F1, AA F8 in first review).
- **Plaintext from `credentials.resolver/v1.get()`**: rejected because invariant 22 cannot be mechanically enforced without `SecretRef` indirection.

## Rejected temptations

- **"Add a capability for X just in case"**: rejected — every capability that ships in v0 is locked into the deprecation contract; an unused capability still imposes spec-maintenance cost and ontology bloat.
- **"Self-registering capabilities"**: rejected (breaks invariant 13).
- **"Keep `health.health-check/v1` because it's already specified"**: tempting because it preserves consistency with prior brainstorm. Rejected because consistency without consumer is the precise failure mode of premature primitives.
- **"Ship multi-platform credential resolvers anticipatorily"**: rejected because each platform-specific resolver is 1-2 weeks of v0+ value, not v0 value.
- **"`SecretRef` adds friction; pack authors won't like opaque handles"**: rejected — friction is the design intent; mechanical enforcement of invariant 22 is non-negotiable.

## Consequences

**Positive**: v0 capability count down to three; `SecretRef` makes invariant 22 mechanically enforceable; `runtime_bindings` per-runtime-keyed makes invariant 2 honest; pack-scoped credential resolution eliminates trivial credential enumeration.

**Negative**: pack authors who model "pack health" must express it as a `<pack>.ping` action; production environments requiring keychain/cloud-secrets must wait for v0.5; pack authors learn the `SecretRef`/`SecretRef→adapter` flow.

**Follow-up needed**: ADR-0010 lists `health.health-check/v1`, `integrations.calendar/v1`, multi-platform credential resolvers as deferred strong candidates with promotion criteria. ADR-0008 verifies `runtime_bindings` resolution and `SecretRef` enforcement.

## Deferred complexity

- **`health.health-check/v1`**: deferred (ADR-0010).
- **Multi-platform credential resolvers**: deferred (ADR-0010).
- **Specialized integration capabilities**: deferred per invariant 14.
- **Capability `v2` machinery**: deferred until first v2 is on roadmap.
- **Capability traits / optional methods**: deferred to v0.5+ (ADR-0010).
- **Capability state across L2 invocations** (e.g., OAuth flows with PKCE): deferred until first concrete v0+ consumer; v0 capabilities are deterministic over (input, declared-state).

## Invariants introduced or strengthened

- 6, 11, 12, 13, 14 — see `docs/principles.md`.
- **2 strengthened**: `runtime_bindings` per-runtime-keyed format makes runtime-independence honest at the manifest level.
- **22 strengthened**: `SecretRef` opaque handle moves enforcement from principle to mechanism.

## Related ADRs

- **Depends on**: ADR-0000, ADR-0003.
- **Refined by**: ADR-0005 (`side_effect_profile`), ADR-0006 (observability contract = pillar 6, runtime-filled `pack_id`), ADR-0008 (conformance suites + `runtime_bindings` resolution check), ADR-0009 (env-var resolver, distribution gate), ADR-0010 (deferred capabilities and traits).
- **Supersedes**: none. (Revision of v1; the v1 four-capability ontology and flat `runtime_bindings` path are collapsed/replaced in this revision.)
