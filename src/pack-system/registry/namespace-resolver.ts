// NamespaceResolver (WU3).
//
// Per ADR-0005 §"Decision":
//   - A reference is namespaced if it carries an explicit pack qualifier of
//     the form `<pack>:<name>`. Example: `b:editor` (agent), `b:b.echo/v1`
//     (action), `b:my-skill` (skill).
//   - Namespaced reference resolves directly against the named pack and
//     wins over any same-name local declaration ("namespaced reference
//     always wins").
//   - Bare reference resolves first inside the calling pack; if absent
//     there, the registry is searched globally. Multi-match across foreign
//     packs returns undefined — the caller relies on
//     NamespaceCollisionValidator (WU2) to refuse such compositions at
//     load time. The undefined return is the resolver's defensive behavior
//     for invariant 17 ("static ambiguity is forbidden") if a degraded
//     registry shape ever surfaces such input.
//
// AA-Q3 evidence: this module is purely lexical/structural. No TS-runtime
// presupposition; no binding loaded; no side effects.

import type {
  ActionDeclaration,
  AgentName,
  PackDescriptor,
  SkillName,
} from "../types/index.js";
import type {
  RegistryView,
  ResolvedAction,
  ResolvedAgent,
  ResolvedSkill,
} from "./types.js";

/**
 * Pack-qualifier separator. ADR-0005 uses `:` for cross-pack references on
 * agents/actions/skills/rubrics. Action ids themselves carry `.` and `/`,
 * so the qualifier separator must be unambiguous against the action-id
 * pattern (`<domain>.<verb>/v<n>`).
 */
const PACK_QUALIFIER_SEP = ":";

/**
 * Lexical splitter for `<pack>:<name>`. Returns null when the reference is
 * bare (no qualifier) or malformed. Caller treats a null result as bare.
 */
function parseQualified(reference: string): { pack: string; name: string } | null {
  const idx = reference.indexOf(PACK_QUALIFIER_SEP);
  if (idx <= 0 || idx === reference.length - 1) return null;
  return {
    pack: reference.slice(0, idx),
    name: reference.slice(idx + 1),
  };
}

/**
 * Resolve cross-pack references in agent / action / skill namespaces.
 *
 * A new resolver is constructed per resolution batch (the registry is
 * intentionally not snapshotted — the resolver always reflects current
 * state). Construction is cheap.
 */
export class NamespaceResolver {
  constructor(private readonly registry: RegistryView) {}

  /** Resolve an agent reference to (pack, name) or undefined. */
  resolveAgent(
    reference: string,
    callingPack: string,
  ): ResolvedAgent | undefined {
    const qualified = parseQualified(reference);
    if (qualified !== null) {
      const target = this.registry.get(qualified.pack);
      if (target === undefined) return undefined;
      return findAgentIn(target, qualified.name);
    }
    // Bare reference: calling pack first.
    const callerPack = this.registry.get(callingPack);
    if (callerPack !== undefined) {
      const local = findAgentIn(callerPack, reference);
      if (local !== undefined) return local;
    }
    // Cross-pack search across non-calling packs.
    const matches: ResolvedAgent[] = [];
    for (const candidate of this.registry.list()) {
      if (candidate.name === callingPack) continue;
      const m = findAgentIn(candidate, reference);
      if (m !== undefined) matches.push(m);
    }
    if (matches.length === 1) return matches[0];
    return undefined;
  }

  /** Resolve an action id reference to (pack, action) or undefined. */
  resolveAction(
    reference: string,
    callingPack: string,
  ): ResolvedAction | undefined {
    const qualified = parseQualified(reference);
    if (qualified !== null) {
      const target = this.registry.get(qualified.pack);
      if (target === undefined) return undefined;
      return findActionIn(target, qualified.name);
    }
    const callerPack = this.registry.get(callingPack);
    if (callerPack !== undefined) {
      const local = findActionIn(callerPack, reference);
      if (local !== undefined) return local;
    }
    const matches: ResolvedAction[] = [];
    for (const candidate of this.registry.list()) {
      if (candidate.name === callingPack) continue;
      const m = findActionIn(candidate, reference);
      if (m !== undefined) matches.push(m);
    }
    if (matches.length === 1) return matches[0];
    return undefined;
  }

  /** Resolve a skill reference to (pack, name) or undefined. */
  resolveSkill(
    reference: string,
    callingPack: string,
  ): ResolvedSkill | undefined {
    const qualified = parseQualified(reference);
    if (qualified !== null) {
      const target = this.registry.get(qualified.pack);
      if (target === undefined) return undefined;
      return findSkillIn(target, qualified.name);
    }
    const callerPack = this.registry.get(callingPack);
    if (callerPack !== undefined) {
      const local = findSkillIn(callerPack, reference);
      if (local !== undefined) return local;
    }
    const matches: ResolvedSkill[] = [];
    for (const candidate of this.registry.list()) {
      if (candidate.name === callingPack) continue;
      const m = findSkillIn(candidate, reference);
      if (m !== undefined) matches.push(m);
    }
    if (matches.length === 1) return matches[0];
    return undefined;
  }
}

// -- Module-private lookups ------------------------------------------------

function findAgentIn(
  pack: PackDescriptor,
  agentName: string,
): ResolvedAgent | undefined {
  const agents = (pack.provides.agents ?? []) as readonly AgentName[];
  for (const a of agents) {
    if ((a as string) === agentName) {
      return { packName: pack.name, name: a };
    }
  }
  return undefined;
}

function findActionIn(
  pack: PackDescriptor,
  actionId: string,
): ResolvedAction | undefined {
  const actions = pack.integrations.actions;
  for (const a of actions as readonly ActionDeclaration[]) {
    if ((a.id as string) === actionId) {
      return { packName: pack.name, action: a };
    }
  }
  return undefined;
}

function findSkillIn(
  pack: PackDescriptor,
  skillName: string,
): ResolvedSkill | undefined {
  const skills = (pack.provides.skills ?? []) as readonly SkillName[];
  for (const s of skills) {
    if ((s as string) === skillName) {
      return { packName: pack.name, name: s };
    }
  }
  return undefined;
}
