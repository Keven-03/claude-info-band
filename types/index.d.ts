export type Stats = {
  turns: number
  tools: number
  lastSeconds: number | null
  lastTools: number
}

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type Clock = {
  /** 当前一轮开始的时间（毫秒），空闲时为 null */
  turnStartedAt: number | null
  /** 最近一次刷新时的时间（毫秒），用于驱动计时重绘 */
  now: number
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** compact：一行；detail：两行；hidden：只留一个小按钮 */
export type Mode = 'compact' | 'detail' | 'hidden'

declare module 'claude-code' {
  interface PluginState {
    'info-band': {
      stats: Stats
      tokens: Tokens
      clock: Clock
      usd: number | null
      limits: Limit[]
      model: string
      mode: Mode
    }
  }
}
