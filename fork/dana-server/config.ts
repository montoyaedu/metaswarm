import { readFileSync, existsSync } from "fs"
import { join } from "path"

export interface DanaConfig {
  server: {
    port: number
    host: string
  }
  providers: {
    default: string
    phase: Record<string, string[]>
    command: Record<string, string>
  }
  checkpoint: {
    enabled: boolean
    autoApprove: boolean
    autoApproveDelayMs: number
  }
  execution: {
    wuTimeout: number
    maxRetries: number
  }
}

const LOG_PREFIX = "[dana:config]"

const DEFAULTS: DanaConfig = {
  server: { port: 4173, host: "127.0.0.1" },
  providers: {
    default: "gemini",
    phase: {
      plan: ["gemini", "codex", "opencode", "claude"],
      "plan-review": ["gemini", "codex", "opencode", "claude"],
      implement: ["codex", "opencode", "gemini", "claude"],
      validate: ["gemini", "codex", "opencode", "claude"],
      review: ["gemini", "codex", "opencode", "claude"],
      commit: ["codex", "opencode", "gemini", "claude"]
    },
    command: {}
  },
  checkpoint: {
    enabled: true,
    autoApprove: false,
    autoApproveDelayMs: 5000
  },
  execution: {
    wuTimeout: 300,
    maxRetries: 3
  }
}

export function loadConfig(configPath?: string): DanaConfig {
  const paths = configPath
    ? [configPath]
    : [join(process.cwd(), "fork", "dana-server", "config.json")]

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8")
        const parsed = JSON.parse(raw)
        return mergeDeep(structuredClone(DEFAULTS), parsed)
      } catch (err) {
        console.warn(`${LOG_PREFIX} failed to load config from ${p}:`, err)
      }
    }
  }

  console.log(`${LOG_PREFIX} using defaults`)
  return structuredClone(DEFAULTS)
}

function mergeDeep(base: unknown, override: unknown): DanaConfig {
  const b = base as Record<string, unknown>
  const o = override as Record<string, unknown>
  for (const key of Object.keys(o)) {
    const val = o[key]
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      b[key] = mergeDeep(
        (b[key] as Record<string, unknown>) || {},
        val as Record<string, unknown>
      ) as unknown as Record<string, unknown>
    } else {
      b[key] = val
    }
  }
  return b as unknown as DanaConfig
}

export function getProviderForPhase(config: DanaConfig, phase: string): string[] {
  const phaseProviders = config.providers.phase[phase]
  if (phaseProviders && phaseProviders.length > 0) return phaseProviders
  return [config.providers.default]
}
