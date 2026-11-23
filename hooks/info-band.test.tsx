import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'info-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 } },
} as const

// 2026-11-22 22:05:14 UTC = 2026-11-23 06:05:14 SGT（星期一）
const FIXED_NOW = Date.UTC(2026, 10, 22, 22, 5, 14)

test('band shows Singapore time in US format on every surface', async ($, on) => {
  on('clock.now', () => ({ value: FIXED_NOW }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /November/ }))?.text).toBe('Monday, November 23, 2026')
    expect((await ui.find({ type: 'Text', text: /SGT/ }))?.text).toBe('06:05:14 SGT')
    await ui.unmount()
  }
})

test('afternoon and midnight use 24-hour time', async ($, on) => {
  let now = Date.UTC(2026, 0, 1, 15, 30, 9) // 23:30:09 SGT
  on('clock.now', () => ({ value: now }))
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /SGT/ }))?.text).toBe('23:30:09 SGT')
  await ui.unmount()

  now = Date.UTC(2026, 0, 1, 16, 0, 0) // 00:00:00 SGT, next day
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /SGT/ }))?.text).toBe('00:00:00 SGT')
  expect((await ui.find({ type: 'Text', text: /January/ }))?.text).toBe('Friday, January 2, 2026')
  await ui.unmount()
})

test('band bottom row shows the cache hit rate on every surface', async ($, on) => {
  on('clock.now', () => ({ value: FIXED_NOW }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect(await ui.find({ type: 'Text', text: /缓存命中率/ })).toBeDefined()
    await ui.unmount()
  }
})
