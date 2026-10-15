import { expect, test, type Page } from '@playwright/test'

const MIN = 60_000

/** Record every oscillator start time, relative to the audio clock at that moment. */
async function spyAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __osc: number[] }
    w.__osc = []
    const orig = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when?: number) {
      if (this.frequency.value > 100) w.__osc.push((when ?? 0) - this.context.currentTime)
      return orig.call(this, when)
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-15T09:00:00') })
})

test('starts a focus block on a task and logs it', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('phase-label')).toHaveText('Ready when you are')
  await page.getByRole('radio', { name: /25m/ }).click()
  await expect(page.getByRole('timer')).toHaveAttribute('aria-label', /Ready/)
  await expect(page.getByRole('timer')).toContainText('25:00')

  await page.getByLabel('Task for this block').fill('Write the report 45m')
  await page.getByLabel('Task for this block').press('Enter')
  await expect(page.locator('.task-chip-title')).toHaveText('Write the report')
  await expect(page.locator('.task-chip-meta')).toHaveText('0m of 45m')

  await page.getByTestId('start').click()
  await expect(page.getByTestId('phase-label')).toHaveText('Focus')
  await page.clock.fastForward(10 * MIN)
  await expect(page.getByRole('timer')).toContainText('15:00')
  await expect(page).toHaveTitle(/15:00 · Write the report/)

  // Pause holds time.
  await page.getByTestId('pause').click()
  await page.clock.fastForward(5 * MIN)
  await expect(page.getByRole('timer')).toContainText('15:00')
  await page.getByTestId('resume').click()

  // Reaches the end: overtime (flow mode is on by default).
  await page.clock.fastForward(15 * MIN + 2000)
  await expect(page.getByTestId('phase-label')).toHaveText('In flow')
  await expect(page.locator('.ringing')).toBeVisible()
  await page.clock.fastForward(3 * MIN)
  await expect(page.getByRole('timer')).toContainText('+3:0')

  await page.getByTestId('take-break').click()
  await expect(page.getByTestId('phase-label')).toHaveText('Break')
  await page.getByRole('button', { name: /Deep/ }).click()
  await expect(page.getByText('How deep did you go?')).toBeHidden()

  // Insights reflect the block.
  await page.getByTestId('open-insights').click()
  await expect(page.locator('.stat').first()).toContainText('28m')
  await expect(page.locator('.recent')).toContainText('Write the report')
  await expect(page.locator('.recent')).toContainText('deep')
})

test('persists across reloads and resumes the running block', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start').click()
  await page.clock.fastForward(5 * MIN)
  await page.reload()
  await expect(page.getByTestId('phase-label')).toHaveText('Focus')
  await expect(page.getByRole('timer')).toContainText('45:00')
})

test('chime is pre-scheduled on the audio clock for the end of the block', async ({ page }) => {
  await spyAudio(page)
  await page.goto('./')
  await page.getByRole('radio', { name: /25m/ }).click()
  await page.getByTestId('start').click()
  await page.waitForFunction(() => (window as unknown as { __osc: number[] }).__osc.length > 0)
  const starts = await page.evaluate(() => (window as unknown as { __osc: number[] }).__osc)
  const first = Math.min(...starts)
  // ~25 minutes ahead, rendered by the audio thread even if page JS is frozen.
  expect(first).toBeGreaterThan(25 * 60 - 2)
  expect(first).toBeLessThan(25 * 60 + 2)
  // Repeats at +2, +4, +6 minutes.
  expect(Math.max(...starts)).toBeGreaterThan(25 * 60 + 6 * 60 - 1)
})

test('tasks: add with estimate, run play on remaining time, finish and pick next', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('open-tasks').click()
  await page.getByTestId('new-task').fill('Plan sprint')
  await page.getByTestId('new-task-est').fill('20m')
  await page.getByTestId('new-task').press('Enter')
  await page.getByTestId('new-task').fill('Review PRs')
  await page.getByTestId('new-task').press('Enter')
  await expect(page.getByTestId('task-list').locator('li')).toHaveCount(2)

  await page.getByRole('button', { name: /Start focus on Plan sprint for 20 minutes/ }).click()
  await expect(page.locator('.sheet')).toBeHidden()
  await expect(page.getByRole('timer')).toContainText('20:00')
  await page.clock.fastForward(8 * MIN)
  await page.getByTestId('task-done').click()
  // Sheet opens to choose what is next; the clock keeps going.
  await page.getByRole('button', { name: /Switch to Review PRs/ }).click()
  await expect(page.locator('.task-chip-title')).toHaveText('Review PRs')
  await expect(page.getByRole('timer')).toContainText('12:00')
})

test('park a thought with N and turn it into a task', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start').click()
  await page.locator('body').press('n')
  await page.getByTestId('park-input').fill('Email Sam about invoice')
  await page.getByTestId('park-input').press('Enter')
  await expect(page.getByText('Parked. Back to it.')).toBeVisible()
  await page.getByTestId('open-tasks').click()
  await expect(page.locator('.note-row')).toContainText('Email Sam about invoice')
  await page.getByRole('button', { name: 'Turn into task' }).click()
  await expect(page.getByTestId('task-list')).toContainText('Email Sam about invoice')
})

test('keyboard: space starts and pauses', async ({ page }) => {
  await page.goto('./')
  await page.locator('body').press(' ')
  await expect(page.getByTestId('phase-label')).toHaveText('Focus')
  await page.locator('body').press(' ')
  await expect(page.getByTestId('phase-label')).toHaveText('Paused')
})

test('custom durations and classic mode stop at the plan', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('radio', { name: /Custom/ }).click()
  await page.getByLabel('Focus minutes').fill('7')
  await page.getByLabel('Break minutes').fill('2')
  await expect(page.getByRole('timer')).toContainText('7:00')
  await page.getByTestId('open-settings').click()
  await page.getByRole('switch', { name: /Don't break my flow/ }).uncheck()
  await page.getByTestId('close-sheet').click()
  await page.getByTestId('start').click()
  await page.clock.fastForward(7 * MIN + 1000)
  await expect(page.getByTestId('phase-label')).toHaveText('Logged 7m of focus')
  await expect(page.getByTestId('start-break')).toContainText('Start 2m break')
  await page.getByTestId('start-break').click()
  await page.clock.fastForward(2 * MIN + 1000)
  await expect(page.getByTestId('phase-label')).toHaveText(/Break over/)
})

test('backup round-trip', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('open-tasks').click()
  await page.getByTestId('new-task').fill('Keep me')
  await page.getByTestId('new-task').press('Enter')
  await page.getByTestId('tab-settings').click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  const file = await (await download).path()
  await page.getByRole('button', { name: 'Erase all data…' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await page.locator('input[type=file]').setInputFiles(file)
  await expect(page.getByText(/Imported 0 sessions and 1 tasks/)).toBeVisible()
  await page.getByTestId('tab-tasks').click()
  await expect(page.getByTestId('task-list')).toContainText('Keep me')
})

test('makes no network requests beyond its own origin', async ({ page }) => {
  const foreign: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173/')) foreign.push(r.url())
  })
  await page.goto('./')
  await page.getByTestId('start').click()
  await page.getByTestId('open-insights').click()
  await page.getByTestId('tab-settings').click()
  expect(foreign.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([])
})
