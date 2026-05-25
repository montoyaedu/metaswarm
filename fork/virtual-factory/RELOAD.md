# Virtual Factory — Reload Protocol

Perduto contesto a metà pipeline? Usa:

```bash
# 1. Riconosci il contesto
cat fork/virtual-factory/SKILL.md | head -100

# 2. Verifica lo stato corrente
cat .beads/context/execution-state.md 2>/dev/null || echo "No saved state"

# 3. Riprendi l'esecuzione
npx tsx fork/orchestrate.ts "<same-goal>"
```

## Ricreare la factory da zero

```bash
# Elimina e ricrea: cancella contesto e riparti
rm -rf .beads/context/
npx tsx fork/orchestrate.ts "<new-goal>"
```

## Verificare che tutto sia in ordine

```bash
# I file del fork sono intatti?
ls fork/ | grep -E "orchestrate|chat|run-task|model-router|session|virtual-factory"

# Provider disponibili?
for cmd in opencode codex gemini claude; do
  command -v $cmd >/dev/null && echo "✅ $cmd" || echo "❌ $cmd"
done
```
