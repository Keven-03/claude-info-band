import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'info-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 } },
} as const

// 2026-11-22 22:05:14 UTC = 2026-11-23 06:05:14 SGT（星期一）
const FIXED_NOW = Date.UTC(2026, 10, 22, 22, 5, 14)

function stubSession(on: any, now: number, remote = '1.1.0', saved?: unknown) {
  on('clock.now', () => ({ value: now }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: now, context: {}, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('clock.every', () => ({ value: {} }))
  on('fs.read', () => ({ value: JSON.stringify({ name: 'info-band', version: '1.1.0' }) }))
  on('http.fetch', () => ({
    value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: remote }) },
  }))
  on('store.get', () => ({ value: saved }))
  on('store.set', () => ({ value: undefined }))
}

test('default: English, Singapore time, 24-hour, on every surface', async ($, on) => {
  stubSession(on, FIXED_NOW)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /November/ }))?.text).toBe('Monday, November 23, 2026')
    expect((await ui.find({ type: 'Text', text: /SGT/ }))?.text).toBe('06:05:14 SGT')
    expect(await ui.find({ type: 'Text', text: /Cache hit/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the language button switches to Chinese and back', async ($, on) => {
  stubSession(on, FIXED_NOW)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'lang' })
  expect((await ui.find({ type: 'Text', text: /年/ }))?.text).toBe('2026年11月23日 星期一')
  expect(await ui.find({ type: 'Text', text: /缓存命中率/ })).toBeDefined()
  await ui.press({ key: 'lang' })
  expect(await ui.find({ type: 'Text', text: /Monday, November 23, 2026/ })).toBeDefined()
  await ui.unmount()
})

test('the time zone picker changes the clock, with daylight saving', async ($, on) => {
  // 2026-07-01 12:00:00 UTC：纽约夏令时 08:00 EDT，伦敦 13:00 BST
  stubSession(on, Date.UTC(2026, 6, 1, 12, 0, 0))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'toggle' })
  await ui.select({ key: 'tz', value: 'America/New_York' })
  expect((await ui.find({ type: 'Text', text: /ED?T|EST/ }))?.text).toBe('08:00:00 EDT')
  await ui.select({ key: 'tz', value: 'Europe/London' })
  expect((await ui.find({ type: 'Text', text: /BST|GMT/ }))?.text).toBe('13:00:00 BST')
  await ui.unmount()
})

test('winter time in New York is EST', async ($, on) => {
  stubSession(on, Date.UTC(2026, 0, 15, 12, 0, 0), '1.1.0', { lang: 'en', tz: 'America/New_York' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /EST|EDT/ }))?.text).toBe('07:00:00 EST')
  await ui.unmount()
})

test('saved preferences are restored', async ($, on) => {
  stubSession(on, FIXED_NOW, '1.1.0', { lang: 'zh', tz: 'Asia/Tokyo' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /JST/ }))?.text).toBe('07:05:14 JST')
  expect(await ui.find({ type: 'Text', text: /星期一/ })).toBeDefined()
  await ui.unmount()
})

test('a newer GitHub version shows the update row, and one click updates', async ($, on) => {
  stubSession(on, FIXED_NOW, '1.2.0')
  const ran: string[] = []
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    ran.push(argv.join(' '))
    const stdout = argv.includes('list') ? JSON.stringify([{ id: 'info-band@claude-info-band' }]) : 'ok'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('command.run', () => ({ text: '' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Text', text: /Update available/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^v1\.1\.0$/ }))?.text).toBe('v1.1.0')
  expect((await ui.find({ type: 'Text', text: /^v1\.2\.0$/ }))?.text).toBe('v1.2.0')

  await ui.press({ key: 'update' })
  expect(ran).toContain('claude plugin marketplace update claude-info-band')
  expect(ran).toContain('claude plugin update info-band@claude-info-band --yes')
  expect(await ui.find({ type: 'Text', text: /Updated to 1\.2\.0/ })).toBeDefined()
  await ui.unmount()
})

test('no update row when already on the latest version', async ($, on) => {
  stubSession(on, FIXED_NOW, '1.1.0')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Text', text: /Update available/ })).toBeUndefined()
  await ui.unmount()
})
