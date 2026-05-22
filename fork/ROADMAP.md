# Fork Roadmap

## Goal

Maintain a rebase-safe fork of metaswarm with:
- minimal upstream modifications
- externalized orchestration
- dynamic model routing via OpenCode
- future stateful execution

---

## Current State

- pack-system module isolated ✅
- fork layer (loader + router) ✅
- OpenCode CLI integration ✅
- upstream diff minimized ✅

---

## Next Steps

### Phase 1 — Model Routing Stabilization
- [ ] validate OpenCode profiles (review, plan, analysis, implement)
- [ ] add routing decision logging
- [ ] add fallback to native provider on failure

### Phase 2 — Wrapper Integration
- [ ] CLI wrapper for run-task
- [ ] optional integration with metaswarm commands (non-invasive)

### Phase 3 — Workflow Hooks (minimal)
- [ ] introduce before/after step hooks (no state)

### Phase 4 — Stateful Execution (controlled)
- [ ] introduce /fork/state
- [ ] todo.yaml + handoff.md
- [ ] resume protocol (dirty/paused)

### Phase 5 — Quality & Discipline
- [ ] enforce coding principles
- [ ] tests for fork/*
- [ ] reviewer roles (taste, architecture)

---

## Constraints

- never modify upstream files unless unavoidable
- prefer additive fork modules
- keep hooks minimal (<= 5 lines upstream)
- avoid premature abstraction

---

## Open Questions

- which OpenCode profiles are most reliable?
- when to fallback to native models?
- how much state is actually needed?
