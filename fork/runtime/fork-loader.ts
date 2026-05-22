// Minimal fork loader: safe, no-op if not used by upstream.
// This keeps fork logic isolated and ready for future hook integration.

export interface ForkModule {
  modelRouter?: {
    selectModel?: (ctx: any) => string
  }
  workflow?: {
    beforeStep?: (step: string, ctx: any) => void
    afterStep?: (step: string, ctx: any) => void
  }
  state?: {
    load?: () => any
    save?: (state: any) => void
  }
}

let cached: ForkModule | null = null

export function loadFork(): ForkModule | null {
  if (cached) return cached

  try {
    // Lazy require to avoid breaking environments where fork is unused
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../index")
    cached = mod?.default || mod || null
    return cached
  } catch {
    return null
  }
}
