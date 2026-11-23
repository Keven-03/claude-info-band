import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Clock, Limit, Mode, Stats, Tokens } from '../types'

const stats = atom({ plugin: 'info-band', key: 'stats' } as const, {
  turns: 0,
  tools: 0,
  lastSeconds: null,
  lastTools: 0,
} as Stats)
const tokens = atom({ plugin: 'info-band', key: 'tokens' } as const, {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as Tokens)
const clock = atom({ plugin: 'info-band', key: 'clock' } as const, {
  turnStartedAt: null,
  now: 0,
} as Clock)
const usd = atom({ plugin: 'info-band', key: 'usd' } as const, null as number | null)
const limits = atom({ plugin: 'info-band', key: 'limits' } as const, [] as Limit[])
const model = atom({ plugin: 'info-band', key: 'model' } as const, '')
const mode = atom({ plugin: 'info-band', key: 'mode' } as const, 'compact' as Mode)

// ---------- 配色：与银雷夜色主题一致 ----------

const C = {
  bolt: '#4fc3ff',
  violet: '#a78bfa',
  silver: '#eef2ff',
  soft: '#c5cde8',
  dim: '#7c87ad',
  track: '#2a3352',
  amber: '#ffc857',
  red: '#ff5d7a',
  green: '#5be3a8',
}

// ---------- 美式日期时间 ----------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// 新加坡时间 = UTC+8，全年无夏令时：把时间戳加 8 小时后用 UTC 读数，不受电脑时区影响
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000

function toSgt(ms: number): Date {
  return new Date(ms + SGT_OFFSET_MS)
}

/** 例：Monday, November 23, 2026（传入 toSgt 之后的时间） */
function usDate(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** 例：06:05:14 SGT，24 小时制（传入 toSgt 之后的时间） */
function usTime(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss} SGT`
}

// ---------- 其他格式化 ----------

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function fmtLeft(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((t - now) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}天${h}时`
  if (h > 0) return `${h}时${m}分`
  return `${m}分`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function usageColor(pct: number): string {
  if (pct >= 80) return C.red
  if (pct >= 50) return C.amber
  return C.bolt
}

function hitColor(ratio: number): string {
  if (ratio >= 0.8) return C.green
  if (ratio >= 0.5) return C.amber
  return C.red
}

/** 选出要显示的周额度：Fable 时优先 Fable 专属窗口，否则用全部模型的周额度 */
function pickWeekly(all: Limit[], isFable: boolean): { limit: Limit | null; label: string } {
  const weekly = all.filter(l => /seven_day|week/i.test(l.kind))
  if (isFable) {
    const f = weekly.find(l => /fable/i.test(l.kind)) ?? all.find(l => /fable/i.test(l.kind))
    if (f) return { limit: f, label: 'Fable周' }
  }
  const generic =
    all.find(l => l.kind === 'seven_day') ??
    weekly.find(l => !/fable|opus|sonnet|haiku/i.test(l.kind)) ??
    null
  return { limit: generic, label: '周额' }
}

async function refreshSession($: EngineInterface) {
  try {
    const u = await $.session.usage()
    await update($, usd, () => (u.cost ? u.cost.usd : null))
    await update($, limits, () =>
      u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    )
  } catch {
    // 拿不到时保持原值
  }
  try {
    const m = await $.session.model()
    await update($, model, () => m)
  } catch {
    // ignore
  }
}

// ---------- 钩子 ----------

export const register: Register = on => {
  let turnTools = 0
  let sessionStartedAt: number | null = null

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      sessionStartedAt = (await $.session.usage()).startedAt
    } catch {
      sessionStartedAt = await $.clock.now()
    }
    await refreshSession($)

    // 每秒刷新一次（顶部时钟精确到秒）；空闲时每 20 秒顺带更新模型和额度
    let ticks = 0
    $.clock.every(1000, () => {
      void (async () => {
        ticks += 1
        const c = await read($, clock)
        if (c.turnStartedAt === null && ticks % 20 === 0) await refreshSession($)
        const now = await $.clock.now()
        await update($, clock, v => ({ ...v, now }))
      })()
    })
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    turnTools = 0
    await update($, clock, () => ({ turnStartedAt: now, now }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    turnTools += 1
    await update($, stats, s => ({ ...s, tools: s.tools + 1 }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      await update($, tokens, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
      }))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    const now = await $.clock.now()
    const c = await read($, clock)
    const seconds =
      c.turnStartedAt === null ? 0 : Math.round((now - c.turnStartedAt) / 1000)
    await update($, stats, s => ({
      ...s,
      turns: s.turns + 1,
      lastSeconds: seconds,
      lastTools: turnTools,
    }))
    await update($, clock, () => ({ turnStartedAt: null, now }))
    await refreshSession($)
    return r
  })

  // ---------- 输入框上方：时间 + 会话信息 ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const m = await read($, mode)
    const setMode = (v: Mode) => update($, mode, () => v)

    if (m === 'hidden') {
      return (
        <Box justifyContent="flex-end">
          <Button key="show" label="▾" onPress={() => setMode('compact')} />
        </Box>
      )
    }

    const s = await read($, stats)
    const t = await read($, tokens)
    const c = await read($, clock)
    const cost = await read($, usd)
    const lims = await read($, limits)
    const modelName = await read($, model)

    const now = c.now || (await $.clock.now())
    const date = toSgt(now)
    const running = c.turnStartedAt !== null
    const sessionMs = sessionStartedAt === null ? 0 : now - sessionStartedAt
    const total = t.input + t.cacheRead + t.cacheWrite + t.output

    const isFable = /fable/i.test(modelName)
    const five = lims.find(l => l.kind === 'five_hour') ?? null
    const week = pickWeekly(lims, isFable)

    const sep = () => <Text color={C.track}>  ·  </Text>
    const meter = (pct: number, cells = 6) => {
      const n = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells)
      return (
        <Text>
          <Text color={usageColor(pct)}>{'━'.repeat(n)}</Text>
          <Text color={C.track}>{'━'.repeat(cells - n)}</Text>
        </Text>
      )
    }
    const quota = (label: string, l: Limit | null) =>
      l === null ? (
        <Text>
          <Text color={C.dim} size="caption">{label} </Text>
          <Text color={C.dim}>—</Text>
        </Text>
      ) : (
        <Text>
          <Text color={C.dim} size="caption">{label} </Text>
          {meter(l.percentUsed)}
          <Text color={usageColor(l.percentUsed)} weight="semibold" tabular>
            {' '}
            {Math.round(l.percentUsed)}%
          </Text>
          {l.resetsAt ? (
            <Text color={C.dim} size="caption"> ↻{fmtLeft(l.resetsAt, now)}</Text>
          ) : (
            <Text> </Text>
          )}
        </Text>
      )

    // 第一行：美式日期时间
    const timeRow = (
      <Box flexDirection="row" alignItems="center" paddingX={1}>
        <Box flexDirection="row" flexGrow={1}>
          <Text color={C.silver} weight="semibold">{usDate(date)}</Text>
          <Text color={C.track}>  │  </Text>
          <Text color={C.bolt} weight="semibold" tabular>{usTime(date)}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Button
            key="toggle"
            label={m === 'detail' ? '▴' : '▾'}
            onPress={() => setMode(m === 'detail' ? 'compact' : 'detail')}
          />
          <Button key="hide" label="×" onPress={() => setMode('hidden')} />
        </Box>
      </Box>
    )

    // 第二行：额度、用时、Token、费用
    const infoRow = (
      <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
        {quota('5h', five)}
        {sep()}
        {quota(week.label, week.limit)}
        {sep()}
        <Text>
          <Text color={C.dim} size="caption">会话 </Text>
          <Text color={C.soft} tabular weight="semibold">{fmtClock(sessionMs)}</Text>
        </Text>
        {sep()}
        <Text>
          <Text color={C.dim} size="caption">{running ? '本轮 ' : '上轮 '}</Text>
          <Text color={running ? C.amber : C.soft} tabular weight="semibold">
            {running
              ? fmtClock(now - (c.turnStartedAt as number))
              : s.lastSeconds === null
                ? '—'
                : fmtClock(s.lastSeconds * 1000)}
          </Text>
        </Text>
        {sep()}
        <Text>
          <Text color={C.dim} size="caption">Token </Text>
          <Text color={C.violet} tabular weight="semibold">{fmtTokens(total)}</Text>
        </Text>
        {cost !== null ? (
          <Text>
            {sep()}
            <Text color={C.amber} tabular>${cost.toFixed(2)}</Text>
          </Text>
        ) : (
          <Text> </Text>
        )}
      </Box>
    )

    // 最下面一行：缓存命中率
    const promptTotal = t.input + t.cacheRead + t.cacheWrite
    const hit = promptTotal > 0 ? t.cacheRead / promptTotal : null
    const hitCells = 12
    const hitN = hit === null ? 0 : Math.round(hit * hitCells)
    const hitCol = hit === null ? C.dim : hitColor(hit)
    const cacheRow = (
      <Box flexDirection="row" paddingX={1}>
        <Text>
          <Text color={C.dim} size="caption">缓存命中率 </Text>
          <Text color={hitCol}>{'━'.repeat(hitN)}</Text>
          <Text color={C.track}>{'━'.repeat(hitCells - hitN)}</Text>
          <Text color={hitCol} weight="semibold" tabular>
            {' '}
            {hit === null ? '—' : `${(hit * 100).toFixed(1)}%`}
          </Text>
          <Text color={C.dim} size="caption">
            {'   '}读 {fmtTokens(t.cacheRead)} · 写 {fmtTokens(t.cacheWrite)}
          </Text>
        </Text>
      </Box>
    )

    if (m !== 'detail') {
      return (
        <Box flexDirection="column">
          {timeRow}
          {infoRow}
          {cacheRow}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {timeRow}
        {infoRow}
        {cacheRow}
        <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
          <Text color={C.dim} size="caption">
            {modelName ? `${modelName}  ·  ` : ''}入 {fmtTokens(t.input)}  出 {fmtTokens(t.output)}
            {'  ·  '}{s.turns} 轮 {s.tools} 次工具
          </Text>
        </Box>
      </Box>
    )
  })

  // ---------- 输入框下方：缓存命中率 ----------

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const t = await read($, tokens)
    const promptTotal = t.input + t.cacheRead + t.cacheWrite
    const hit = promptTotal > 0 ? t.cacheRead / promptTotal : null
    const text = hit === null ? '缓存命中率 —' : `缓存命中率 ${(hit * 100).toFixed(1)}%`

    // 只有终端会画这行的追加文字；桌面端的命中率在信息条最下面一行
    if (e.surface === 'terminal') {
      return next({ ...e, props: { ...e.props, tail: `  ·  ${text}` } })
    }
    return next(e)
  })
}
