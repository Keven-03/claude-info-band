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

/** GitHub 更新检查的状态 */
export type UpdateInfo = {
  current: string
  latest: string | null
  status: 'idle' | 'updating' | 'done' | 'error'
  message: string
}

export type Lang = 'zh' | 'en'

/** 用户偏好：界面语言和时区（IANA 名称，或 'local' 表示跟随电脑） */
export type Prefs = { lang: Lang; tz: string }

declare module 'claude-code' {
  interface PluginState {
    'info-band': {
      prefs: Prefs
      update: UpdateInfo
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
