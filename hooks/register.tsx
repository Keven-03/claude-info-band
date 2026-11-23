import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Clock, Lang, Limit, Mode, Prefs, Stats, Tokens, UpdateInfo } from '../types'

// =====================================================================
// 状态
// =====================================================================

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
// 默认英文，点信息条上的「中」可切换中文
const prefs = atom({ plugin: 'info-band', key: 'prefs' } as const, {
  lang: 'en',
  tz: 'Asia/Singapore',
} as Prefs)
const updateInfo = atom({ plugin: 'info-band', key: 'update' } as const, {
  current: '',
  latest: null,
  status: 'idle',
  message: '',
} as UpdateInfo)

const PREFS_KEY = 'prefs' // $.store 里的键，跨会话保存

// =====================================================================
// 配色：与银雷夜色主题一致
// =====================================================================

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

// =====================================================================
// 中英文案
// =====================================================================

const T = {
  zh: {
    weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    week: '周额',
    fableWeek: 'Fable周',
    session: '会话',
    thisTurn: '本轮',
    lastTurn: '上轮',
    cacheHit: '缓存命中率',
    read: '读',
    write: '写',
    input: '入',
    output: '出',
    turns: (n: number) => `${n} 轮`,
    tools: (n: number) => `${n} 次工具`,
    timezone: '时区',
    upToDate: (v: string) => `v${v} · 已是最新版`,
    newVersion: '有新版本',
    current: '当前',
    latest: '最新',
    updateNow: '一键更新',
    retry: '重试更新',
    updating: '正在更新…',
    updatedReloading: (v: string) => `已更新到 ${v}，正在重新加载…`,
    updatedManual: (v: string) => `已更新到 ${v}，运行 /reload-plugins 或重开窗口生效`,
    updateFailed: (why: string) => `更新失败：${why}`,
    langButton: 'EN',
    left: (d: number, h: number, m: number) =>
      d > 0 ? `${d}天${h}时` : h > 0 ? `${h}时${m}分` : `${m}分`,
  },
  en: {
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    week: 'Week',
    fableWeek: 'Fable wk',
    session: 'Session',
    thisTurn: 'Turn',
    lastTurn: 'Last',
    cacheHit: 'Cache hit',
    read: 'read',
    write: 'write',
    input: 'in',
    output: 'out',
    turns: (n: number) => `${n} turn${n === 1 ? '' : 's'}`,
    tools: (n: number) => `${n} tool call${n === 1 ? '' : 's'}`,
    timezone: 'Time zone',
    upToDate: (v: string) => `v${v} · up to date`,
    newVersion: 'Update available',
    current: 'current',
    latest: 'latest',
    updateNow: 'Update now',
    retry: 'Retry update',
    updating: 'Updating…',
    updatedReloading: (v: string) => `Updated to ${v}, reloading…`,
    updatedManual: (v: string) => `Updated to ${v}. Run /reload-plugins or reopen the window`,
    updateFailed: (why: string) => `Update failed: ${why}`,
    langButton: '中',
    left: (d: number, h: number, m: number) =>
      d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`,
  },
} as const

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// =====================================================================
// 时区
// =====================================================================

type Zone = {
  id: string
  zh: string
  en: string
  /** 不支持 Intl 时用的标准时差（分钟） */
  fallbackOffset: number
  /** 缩写：标准时 / 夏令时 */
  abbr: [string, string]
}

const ZONES: Zone[] = [
  { id: 'Asia/Singapore', zh: '新加坡', en: 'Singapore', fallbackOffset: 480, abbr: ['SGT', 'SGT'] },
  { id: 'Asia/Shanghai', zh: '北京 / 上海', en: 'Beijing / Shanghai', fallbackOffset: 480, abbr: ['CST', 'CST'] },
  { id: 'Asia/Hong_Kong', zh: '香港', en: 'Hong Kong', fallbackOffset: 480, abbr: ['HKT', 'HKT'] },
  { id: 'Asia/Taipei', zh: '台北', en: 'Taipei', fallbackOffset: 480, abbr: ['TST', 'TST'] },
  { id: 'Asia/Tokyo', zh: '东京', en: 'Tokyo', fallbackOffset: 540, abbr: ['JST', 'JST'] },
  { id: 'Asia/Seoul', zh: '首尔', en: 'Seoul', fallbackOffset: 540, abbr: ['KST', 'KST'] },
  { id: 'Asia/Kolkata', zh: '印度', en: 'India', fallbackOffset: 330, abbr: ['IST', 'IST'] },
  { id: 'Asia/Dubai', zh: '迪拜', en: 'Dubai', fallbackOffset: 240, abbr: ['GST', 'GST'] },
  { id: 'Europe/London', zh: '伦敦', en: 'London', fallbackOffset: 0, abbr: ['GMT', 'BST'] },
  { id: 'Europe/Paris', zh: '巴黎 / 柏林', en: 'Paris / Berlin', fallbackOffset: 60, abbr: ['CET', 'CEST'] },
  { id: 'America/New_York', zh: '美东（纽约）', en: 'US Eastern (New York)', fallbackOffset: -300, abbr: ['EST', 'EDT'] },
  { id: 'America/Chicago', zh: '美中（芝加哥）', en: 'US Central (Chicago)', fallbackOffset: -360, abbr: ['CST', 'CDT'] },
  { id: 'America/Denver', zh: '美山地（丹佛）', en: 'US Mountain (Denver)', fallbackOffset: -420, abbr: ['MST', 'MDT'] },
  { id: 'America/Los_Angeles', zh: '美西（洛杉矶）', en: 'US Pacific (Los Angeles)', fallbackOffset: -480, abbr: ['PST', 'PDT'] },
  { id: 'Australia/Sydney', zh: '悉尼', en: 'Sydney', fallbackOffset: 600, abbr: ['AEST', 'AEDT'] },
  { id: 'UTC', zh: 'UTC', en: 'UTC', fallbackOffset: 0, abbr: ['UTC', 'UTC'] },
  { id: 'local', zh: '跟随电脑', en: 'This computer', fallbackOffset: 0, abbr: ['', ''] },
]

function findZone(id: string): Zone {
  return ZONES.find(z => z.id === id) ?? ZONES[0]
}

/** 某时区在某时刻相对 UTC 的分钟数；优先用 Intl（自动处理夏令时） */
function offsetMinutes(zone: Zone, ms: number): number {
  if (zone.id === 'local') return -new Date(ms).getTimezoneOffset()
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone.id,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const p: Record<string, number> = {}
    for (const part of fmt.formatToParts(new Date(ms))) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10)
    }
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
  } catch {
    return zone.fallbackOffset
  }
}

function zoneAbbr(zone: Zone, offset: number): string {
  if (zone.id === 'local') {
    const sign = offset >= 0 ? '+' : '-'
    const a = Math.abs(offset)
    return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`
  }
  return offset !== zone.fallbackOffset ? zone.abbr[1] : zone.abbr[0]
}

/** 返回该时区的“墙上时间”（用 UTC 读数）和缩写 */
function zoned(ms: number, tz: string): { d: Date; abbr: string } {
  const zone = findZone(tz)
  const off = offsetMinutes(zone, ms)
  return { d: new Date(ms + off * 60000), abbr: zoneAbbr(zone, off) }
}

function fmtDate(d: Date, lang: Lang): string {
  const wd = T[lang].weekdays[d.getUTCDay()]
  if (lang === 'zh') {
    return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${wd}`
  }
  return `${wd}, ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** 24 小时制，例：06:05:14 SGT */
function fmtTime(d: Date, abbr: string): string {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}${abbr ? ` ${abbr}` : ''}`
}

// =====================================================================
// 其他格式化
// =====================================================================

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function fmtLeft(iso: string | undefined, now: number, lang: Lang): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((t - now) / 1000))
  return T[lang].left(Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60))
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
function pickWeekly(all: Limit[], isFable: boolean, lang: Lang): { limit: Limit | null; label: string } {
  const weekly = all.filter(l => /seven_day|week/i.test(l.kind))
  if (isFable) {
    const f = weekly.find(l => /fable/i.test(l.kind)) ?? all.find(l => /fable/i.test(l.kind))
    if (f) return { limit: f, label: T[lang].fableWeek }
  }
  const generic =
    all.find(l => l.kind === 'seven_day') ??
    weekly.find(l => !/fable|opus|sonnet|haiku/i.test(l.kind)) ??
    null
  return { limit: generic, label: T[lang].week }
}

// =====================================================================
// 会话数据、偏好
// =====================================================================

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

async function loadPrefs($: EngineInterface) {
  try {
    const saved = (await $.store.get(PREFS_KEY)) as Partial<Prefs> | undefined
    if (saved && typeof saved === 'object') {
      await update($, prefs, p => ({
        lang: saved.lang === 'en' || saved.lang === 'zh' ? saved.lang : p.lang,
        tz: typeof saved.tz === 'string' && ZONES.some(z => z.id === saved.tz) ? saved.tz : p.tz,
      }))
    }
  } catch {
    // 用默认值
  }
}

async function setPrefs($: EngineInterface, change: Partial<Prefs>) {
  await update($, prefs, p => ({ ...p, ...change }))
  try {
    await $.store.set(PREFS_KEY, await read($, prefs))
  } catch {
    // 保存失败也不影响本会话
  }
}

// =====================================================================
// GitHub 更新检查
// =====================================================================

const REPO = 'Keven-03/claude-info-band'
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/main/.claude-plugin/plugin.json`
const CHECK_EVERY_MS = 60 * 1000 // 每 1 分钟检查一次

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
    status: u.status === 'updating' || u.status === 'done' ? u.status : 'idle',
  }))
}

/** 一键更新：刷新插件市场 → 更新插件 → 重新加载插件 */
async function runUpdate($: EngineInterface) {
  const info = await read($, updateInfo)
  if (info.status === 'updating') return
  await update($, updateInfo, u => ({ ...u, status: 'updating', message: '' }))

  try {
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

    await update($, updateInfo, u => ({ ...u, status: 'done', message: 'reloading' }))
    try {
      await $.command.run({ command: 'reload-plugins' })
    } catch {
      await update($, updateInfo, u => ({ ...u, message: 'manual' }))
    }
  } catch (error) {
    await update($, updateInfo, u => ({
      ...u,
      status: 'error',
      message: String(error instanceof Error ? error.message : error).slice(0, 120),
    }))
  }
}

// =====================================================================
// 钩子
// =====================================================================

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
    await loadPrefs($)
    await refreshSession($)

    // 更新检查：启动时一次，之后每 1 分钟一次
    void checkForUpdate($)
    $.clock.every(CHECK_EVERY_MS, () => {
      void checkForUpdate($)
    })

    // 每秒刷新一次（时钟精确到秒）；空闲时每 20 秒顺带更新模型和额度
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

  // ---------- 输入框上方的信息条 ----------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text, Select } = $.ui.resolve(e)
    const m = await read($, mode)
    const setMode = (v: Mode) => update($, mode, () => v)

    if (m === 'hidden') {
      return (
        <Box justifyContent="flex-end">
          <Button key="show" label="▾" onPress={() => setMode('compact')} />
        </Box>
      )
    }

    const p = await read($, prefs)
    const L = T[p.lang]
    const s = await read($, stats)
    const t = await read($, tokens)
    const c = await read($, clock)
    const cost = await read($, usd)
    const lims = await read($, limits)
    const modelName = await read($, model)
    const up = await read($, updateInfo)

    const now = c.now || (await $.clock.now())
    const z = zoned(now, p.tz)
    const running = c.turnStartedAt !== null
    const sessionMs = sessionStartedAt === null ? 0 : now - sessionStartedAt
    const total = t.input + t.cacheRead + t.cacheWrite + t.output

    const isFable = /fable/i.test(modelName)
    const five = lims.find(l => l.kind === 'five_hour') ?? null
    const week = pickWeekly(lims, isFable, p.lang)

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
            <Text color={C.dim} size="caption"> ↻{fmtLeft(l.resetsAt, now, p.lang)}</Text>
          ) : (
            <Text> </Text>
          )}
        </Text>
      )

    // 更新提示行
    const hasNew = up.latest !== null && up.current !== '' && compareVersions(up.latest, up.current) > 0
    const updateMsg =
      up.status === 'updating'
        ? L.updating
        : up.status === 'done'
          ? up.message === 'manual'
            ? L.updatedManual(up.latest ?? '')
            : L.updatedReloading(up.latest ?? '')
          : up.status === 'error'
            ? L.updateFailed(up.message)
            : ''
    const updateRow =
      hasNew || up.status !== 'idle' ? (
        <Box flexDirection="row" alignItems="center" paddingX={1}>
          <Box flexDirection="row" flexGrow={1}>
            <Text color={C.amber} weight="semibold">{L.newVersion}</Text>
            <Text color={C.dim}>  {L.current} </Text>
            <Text color={C.soft} tabular>v{up.current || '?'}</Text>
            <Text color={C.dim}>  →  {L.latest} </Text>
            <Text color={C.green} weight="semibold" tabular>v{up.latest ?? '?'}</Text>
            {updateMsg ? (
              <Text color={up.status === 'error' ? C.red : C.dim} size="caption">
                {'   '}
                {updateMsg}
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
              label={up.status === 'error' ? L.retry : L.updateNow}
              onPress={() => runUpdate($)}
            />
          )}
        </Box>
      ) : null

    // 第一行：日期时间 + 语言切换 + 展开/收起
    const timeRow = (
      <Box flexDirection="row" alignItems="center" paddingX={1}>
        <Box flexDirection="row" flexGrow={1}>
          <Text color={C.silver} weight="semibold">{fmtDate(z.d, p.lang)}</Text>
          <Text color={C.track}>  │  </Text>
          <Text color={C.bolt} weight="semibold" tabular>{fmtTime(z.d, z.abbr)}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Button
            key="lang"
            label={L.langButton}
            onPress={() => setPrefs($, { lang: p.lang === 'zh' ? 'en' : 'zh' })}
          />
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
          <Text color={C.dim} size="caption">{L.session} </Text>
          <Text color={C.soft} tabular weight="semibold">{fmtClock(sessionMs)}</Text>
        </Text>
        {sep()}
        <Text>
          <Text color={C.dim} size="caption">{running ? L.thisTurn : L.lastTurn} </Text>
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

    // 第三行：缓存命中率
    const promptTotal = t.input + t.cacheRead + t.cacheWrite
    const hit = promptTotal > 0 ? t.cacheRead / promptTotal : null
    const hitCells = 12
    const hitN = hit === null ? 0 : Math.round(hit * hitCells)
    const hitCol = hit === null ? C.dim : hitColor(hit)
    const cacheRow = (
      <Box flexDirection="row" paddingX={1}>
        <Text>
          <Text color={C.dim} size="caption">{L.cacheHit} </Text>
          <Text color={hitCol}>{'━'.repeat(hitN)}</Text>
          <Text color={C.track}>{'━'.repeat(hitCells - hitN)}</Text>
          <Text color={hitCol} weight="semibold" tabular>
            {' '}
            {hit === null ? '—' : `${(hit * 100).toFixed(1)}%`}
          </Text>
          <Text color={C.dim} size="caption">
            {'   '}
            {L.read} {fmtTokens(t.cacheRead)} · {L.write} {fmtTokens(t.cacheWrite)}
          </Text>
        </Text>
      </Box>
    )

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

    // 展开：多一行明细，和时区选择
    return (
      <Box flexDirection="column">
        {updateRow ?? <Text color={C.dim} size="caption">  {L.upToDate(up.current)}</Text>}
        {timeRow}
        {infoRow}
        {cacheRow}
        <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
          <Text color={C.dim} size="caption">
            {modelName ? `${modelName}  ·  ` : ''}
            {L.input} {fmtTokens(t.input)}  {L.output} {fmtTokens(t.output)}
            {'  ·  '}
            {L.turns(s.turns)} {L.tools(s.tools)}
          </Text>
        </Box>
        <Box flexDirection="row" alignItems="center" paddingX={1} gap={1}>
          <Text color={C.dim} size="caption">{L.timezone}</Text>
          <Select
            key="tz"
            options={ZONES.map(zz => ({ value: zz.id, label: p.lang === 'zh' ? zz.zh : zz.en }))}
            value={p.tz}
            onSelect={value => {
              void setPrefs($, { tz: value })
            }}
          />
        </Box>
      </Box>
    )
  })

  // ---------- 终端：输入框下方提示行末尾追加缓存命中率 ----------

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const p = await read($, prefs)
    const t = await read($, tokens)
    const promptTotal = t.input + t.cacheRead + t.cacheWrite
    const hit = promptTotal > 0 ? t.cacheRead / promptTotal : null
    const text = `${T[p.lang].cacheHit} ${hit === null ? '—' : `${(hit * 100).toFixed(1)}%`}`
    return next({ ...e, props: { ...e.props, tail: `  ·  ${text}` } })
  })
}
