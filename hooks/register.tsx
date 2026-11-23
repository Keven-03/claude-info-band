import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Clock, Limit, Mode, Stats, Tokens, UpdateInfo } from '../types'

// ---------- GitHub 更新检查 ----------

const REPO = 'Keven-03/claude-info-band'
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000 // 每 6 小时检查一次

const updateInfo = atom({ plugin: 'info-band', key: 'update' } as const, {
  current: '',
  latest: null,
  status: 'idle',
  message: '',
} as UpdateInfo)

/** a 比 b 新返回正数 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map(x => parseInt(x, 10) || 0)
  const pb = b.split(/[.+-]/).map(x => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

async function readLocalVersion($: EngineInterface): Promise<string> {
  try {
    const raw = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)
    const v = (JSON.parse(String(raw)) as { version?: unknown }).version
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

async function checkForUpdate($: EngineInterface) {
  const current = await readLocalVersion($)
  let latest: string | null = null
  try {
    const r = await $.http.fetch(`${REMOTE_MANIFEST}?t=${await $.clock.now()}`)
    if (r.ok) {
      const v = (JSON.parse(r.text) as { version?: unknown }).version
      if (typeof v === 'string') latest = v
    }
  } catch {
    // 网络不通时不提示
  }
  await update($, updateInfo, u => ({
    ...u,
    current,
    latest,
    // 正在更新或刚更新完时不覆盖状态
    status: u.status === 'updating' || u.status === 'done' ? u.status : 'idle',
  }))
}

/** 一键更新：刷新插件市场 → 更新插件 → 重新加载插件 */
async function runUpdate($: EngineInterface) {
  const info = await read($, updateInfo)
  if (info.status === 'updating') return
  await update($, updateInfo, u => ({ ...u, status: 'updating', message: '正在更新…' }))

  try {
    // 找到这个插件是从哪个插件市场装的（例如 info-band@claude-info-band）
    const list = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 60000 })
    const parsed = JSON.parse(list.stdout) as unknown
    const rows = (
      Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { value?: unknown })?.value)
          ? (parsed as { value: unknown[] }).value
          : []
    ) as { id?: string }[]
    const id = rows.map(r => r.id ?? '').find(x => x.startsWith('info-band@')) ?? 'info-band'
    const marketplace = id.includes('@') ? id.slice(id.indexOf('@') + 1) : null

    if (marketplace) {
      await $.process.run(['claude', 'plugin', 'marketplace', 'update', marketplace], {
        timeoutMs: 120000,
      })
    }
    const up = await $.process.run(['claude', 'plugin', 'update', id, '--yes'], {
      timeoutMs: 180000,
    })
    if (up.exitCode !== 0) {
      const why = (up.stderr || up.stdout).trim().split('\n').pop() ?? ''
      throw new Error(why || `exit ${up.exitCode}`)
    }

    await update($, updateInfo, u => ({
      ...u,
      status: 'done',
      message: `已更新到 ${u.latest ?? '最新版'}，正在重新加载…`,
    }))
    try {
      await $.command.run({ command: 'reload-plugins' })
    } catch {
      await update($, updateInfo, u => ({
        ...u,
        message: `已更新到 ${u.latest ?? '最新版'}，运行 /reload-plugins 或重开窗口生效`,
      }))
    }
  } catch (error) {
    await update($, updateInfo, u => ({
      ...u,
      status: 'error',
      message: `更新失败：${String(error instanceof Error ? error.message : error).slice(0, 120)}`,
    }))
  }
}

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

    // 更新检查：启动时一次，之后每 6 小时一次
    void checkForUpdate($)
    $.clock.every(CHECK_EVERY_MS, () => {
      void checkForUpdate($)
    })

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

    // 有新版本时最上面多一行提示和一键更新按钮
    const up = await read($, updateInfo)
    const hasNew = up.latest !== null && up.current !== '' && compareVersions(up.latest, up.current) > 0
    const showUpdate = hasNew || up.status !== 'idle'
    const updateRow = showUpdate ? (
      <Box flexDirection="row" alignItems="center" paddingX={1}>
        <Box flexDirection="row" flexGrow={1}>
          <Text color={C.amber} weight="semibold">有新版本</Text>
          <Text color={C.dim}>  当前 </Text>
          <Text color={C.soft} tabular>v{up.current || '?'}</Text>
          <Text color={C.dim}>  →  最新 </Text>
          <Text color={C.green} weight="semibold" tabular>v{up.latest ?? '?'}</Text>
          {up.message ? (
            <Text color={up.status === 'error' ? C.red : C.dim} size="caption">
              {'   '}
              {up.message}
            </Text>
          ) : (
            <Text> </Text>
          )}
        </Box>
        {up.status === 'updating' || up.status === 'done' ? (
          <Text> </Text>
        ) : (
          <Button
            key="update"
            label={up.status === 'error' ? '重试更新' : '一键更新'}
            onPress={() => runUpdate($)}
          />
        )}
      </Box>
    ) : null

    if (m !== 'detail') {
      if (updateRow === null) {
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
          {updateRow}
          {timeRow}
          {infoRow}
          {cacheRow}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {updateRow ?? <Text color={C.dim} size="caption">  v{up.current} · 已是最新版</Text>}
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
