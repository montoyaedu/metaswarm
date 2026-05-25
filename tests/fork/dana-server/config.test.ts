import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { randomUUID } from "crypto"
import { loadConfig, getProviderForPhase } from "../../../fork/dana-server/config"

function tmpDir(): string {
  const d = join(tmpdir(), `dana-config-test-${randomUUID().slice(0, 8)}`)
  mkdirSync(d, { recursive: true })
  return d
}

describe("loadConfig", () => {
  let dir: string

  beforeEach(() => { dir = tmpDir() })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("returns defaults when no config file exists", () => {
    const cfg = loadConfig(join(dir, "nonexistent.json"))
    expect(cfg.server.port).toBe(4173)
    expect(cfg.server.host).toBe("127.0.0.1")
    expect(cfg.providers.default).toBe("gemini")
    expect(cfg.providers.phase.plan).toContain("gemini")
    expect(cfg.checkpoint.enabled).toBe(true)
    expect(cfg.checkpoint.autoApprove).toBe(false)
    expect(cfg.execution.wuTimeout).toBe(300)
    expect(cfg.execution.maxRetries).toBe(3)
  })

  it("loads and merges override config", () => {
    const cfgPath = join(dir, "test-config.json")
    writeFileSync(cfgPath, JSON.stringify({
      server: { port: 9999 },
      providers: { default: "codex" },
      checkpoint: { autoApprove: true, autoApproveDelayMs: 1000 }
    }))
    const cfg = loadConfig(cfgPath)
    expect(cfg.server.port).toBe(9999)
    expect(cfg.providers.default).toBe("codex")
    // Non-overridden fields keep defaults
    expect(cfg.server.host).toBe("127.0.0.1")
    expect(cfg.checkpoint.autoApprove).toBe(true)
    expect(cfg.checkpoint.autoApproveDelayMs).toBe(1000)
    expect(cfg.checkpoint.enabled).toBe(true)
    expect(cfg.execution.wuTimeout).toBe(300)
  })

  it("handles invalid JSON gracefully", () => {
    const cfgPath = join(dir, "bad.json")
    writeFileSync(cfgPath, "not json")
    const cfg = loadConfig(cfgPath)
    expect(cfg.server.port).toBe(4173)
  })

  it("loads from default path", () => {
    const cfg = loadConfig()
    expect(cfg.server.port).toBe(4173)
  })
})

describe("getProviderForPhase", () => {
  const baseConfig = loadConfig()

  it("returns configured providers for known phase", () => {
    const providers = getProviderForPhase(baseConfig, "implement")
    expect(providers).toEqual(["codex", "opencode", "gemini", "claude"])
  })

  it("returns default for unknown phase", () => {
    const providers = getProviderForPhase(baseConfig, "unknown-phase")
    expect(providers).toEqual(["gemini"])
  })

  it("returns default when phase has empty array", () => {
    const cfg = { ...baseConfig, providers: { ...baseConfig.providers, phase: {} } }
    const providers = getProviderForPhase(cfg, "plan")
    expect(providers).toEqual(["gemini"])
  })
})
