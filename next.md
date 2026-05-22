## Non-negotiable fork policy

This fork is optimized for **clean rebases onto `upstream/main`**, not for upstream PR mergeability.

- Keep fork-specific code in dedicated namespaces and modules whenever possible.
- Prefer additive integration over edits to shared upstream entrypoints and root files.
- Treat high-churn files (`package.json`, lockfiles, root agent/instruction files, shared config) as expensive integration points: change them only when the behavior cannot live at the edges.
- When adding compatibility layers, use explicit feature detection and fallback paths so the shim can be removed cleanly if upstream later ships the capability out of the box.

Bash(git add src/pack-system/permissions/ src/pack-system/gates/ tests/pack-system/permissions/ tests/pack-system/gates/ && git commit 
      -m "$(cat <<'EOF'
      feat(pack-sy…)                                                                                                                     
  ⎿  [main 6453c75] feat(pack-system): WU4 GateRegistry, PermissionRegistry, classifyPermission
      11 files changed, 1073 insertions(+)                                                                                               
      create mode 100644 src/pack-system/gates/gate-registry.ts
     … +21 lines (ctrl+o to expand)
  ⎿  Allowed by auto mode classifier                                                                                                     
   
⏺ WU4 committed: 6453c75. 11 file, 1073 insertions, working tree clean.                                                                  
                                                         
  MVP progress (5 di 17 WU completi)                                                                                                     
   
  ┌─────────────────────────────────────────────┬───────────────────────────────────────────────┬──────────────────┬───────┬─────────┐   
  │                     WU                      │                    Status                     │       Tier       │ Tests │ Commit  │
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤   
  │ WU0 — scaffolding                           │ ✅                                            │ subagent         │ —     │ 4b7ea2d │
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤
  │ WU1 — schema + envelope                     │ ✅ orchestrated PASS                          │ full             │ +38   │ 7aeb76c │   
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤   
  │ WU2 — loader + 7 validators + type freeze   │ ✅ orchestrated PASS                          │ full             │ +58   │ edee05c │   
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤   
  │ WU3 — registry + namespace + matrix         │ ✅ batch + AA-Q2 correction                   │ batch            │ +44   │ b852dc1 │
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤   
  │ WU4 — gates + permissions +                 │ ✅ orchestrated PASS                          │ full             │ +43   │ 6453c75 │
  │ classifyPermission                          │                                               │                  │       │         │   
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤
  │ WU5 — RouteResolver                         │ next (batch)                                  │ batch            │ —     │ —       │   
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤
  │ WU6 — JsonlAuditWriter + hash chain         │ unblocked (choke point, was waiting on WU4    │ full             │ —     │ —       │   
  │                                             │ close)                                        │ orchestrated     │       │         │
  ├─────────────────────────────────────────────┼───────────────────────────────────────────────┼──────────────────┼───────┼─────────┤   
  │ WU7-WU17                                    │ 11 unità rimanenti                            │ misto            │ —     │ —       │
  └─────────────────────────────────────────────┴───────────────────────────────────────────────┴──────────────────┴───────┴─────────┘   
  
  Test cumulativi: 184 passing (15 per dimensione: lines/branches/functions/statements al 100%). Anchor lint: 40 references resolved.    
                                                         
  Choke point window aperta                                                                                                              
                                                         
  Con WU4 chiuso, sia WU5 che WU6 possono partire (per §6.1: WU5 non è choke point, WU6 è choke point — ma non con WU4 che è ora chiuso).
   Per plan §5 v0.3:
                                                                                                                                         
  ▎ "After WU4: WU5 begins. After WU5 + WU6: WU7 begins."                                                                                
  
  Quindi:                                                                                                                                
  - WU5 (batch-subagent): RouteResolver — default scorer su L1 routing_hints + L2 task-router/v1 invocation + deterministic tie-break +
  ambiguity event. ~4-6 file.                                                                                                            
  - WU6 (orchestrated, choke point): JsonlAuditWriter + RFC 8785 hash chain + leak detector + runtime-filled fields + trace verify
  walker. THE security-critical WU. ~10 file.                                                                                            
                                                                                                                                         
  WU5 ⊥ WU6 può paralleliziare per §6.1 (solo WU6 è choke point; WU5 routing-only). Ma WU6 orchestrated è 4-phase, mentre WU5 batch è
  1-phase.                                                                                                                               
                                                         
  Tre opzioni                                                                                                                            
                                                         
  A) Sequential: WU5 (batch, ~1 turn) → WU6 (orchestrated, ~3 turn). Cleaner output flow, ~4 turn totali.                                
  
  B) Parallel: WU5 + WU6 IMPLEMENT in parallelo (1 turn), poi WU6 ADVERSARIAL REVIEW + COMMIT (~2 turn). ~3 turn totali, output          
  mescolato.                                             
                                                                                                                                         
  C) WU6 first, WU5 after: orchestrated prima (più critico — security), batch dopo. Same total turn count ma WU6 attenzione completa.    
  
  Mia raccomandazione: A. WU5 è veloce e libera momentum su critical path → WU7 (capability conformance, che richiede sia WU5 che WU6). E
   WU6 merita full attention per security mechanisms (hash chain, SecretRef leak detector, runtime-filled field enforcement).
                                                                                                                                         
  Procedo con WU5 IMPLEMENT? 
