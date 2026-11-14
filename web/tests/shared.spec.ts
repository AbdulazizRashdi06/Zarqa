import { expect, test, type Page } from '@playwright/test'

// The shared foundation: session states, crash recovery, page titles and focus, history-aware Back.
const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, isRsa: false, matchAlerts: false, showFirstName: true, avatarUrl: null }
const report = {
  id: 'r1', kind: 'lost', title: 'Black AirPods case', category: 'Electronics', categoryKey: 'Electronics', description: 'Black case.',
  locationName: 'Library', locationText: 'Library', eventDate: null, eventTime: null, status: 'Active', pill: 'Searching', isSensitive: false, photoIds: [],
  matchId: null, conversationId: null, createdAt: '2026-11-10T08:00:00Z', dropAtRsa: false, dropCode: null, rsaReceived: false, pickupMatchId: null,
}

async function app(page: Page, reports: unknown[] = [report]) {
  await page.route('**/api/me', (route) => route.fulfill({ json: me }))
  await page.route('**/api/home', (route) => route.fulfill({ json: { active: 1, matchesWaiting: 0, unreadChats: 0, postsLeft: 3 } }))
  await page.route('**/api/locations', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/reports/mine', (route) => route.fulfill({ json: reports }))
}

test('a failed /me at start-up offers Try again instead of the sign-in screen, and keeps the page', async ({ page }) => {
  let fail = true
  await app(page)
  await page.route('**/api/me', (route) => (fail ? route.fulfill({ status: 502, body: '' }) : route.fulfill({ json: me })))
  await page.goto('/reports')
  await expect(page.getByRole('heading', { name: /can't reach zarqa/i })).toBeVisible()
  await expect(page).toHaveURL(/\/reports$/)
  fail = false
  await page.getByRole('button', { name: /try again/i }).click()
  await expect(page.getByRole('heading', { name: /your reports/i })).toBeVisible()
})

test('a 401 mid-session signs out, says so, and returns to the page after signing in', async ({ page }) => {
  await app(page)
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.route('**/api/reports/mine', (route) => route.fulfill({ status: 401, json: { error: 'Sign in first.' } }))
  await page.route('**/api/me', (route) => route.fulfill({ status: 401, json: { error: 'Sign in first.' } }))
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.getByText(/you were signed out/i)).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('zarqa.returnTo'))).toBe('/reports')
})

test('a page that crashes shows a way out instead of a blank screen, and Back home recovers', async ({ page }) => {
  // An object where the screen expects text: React can't render it, so the report list really crashes.
  await app(page, [{ ...report, title: { en: 'Black AirPods case' } }])
  await page.goto('/reports')
  await expect(page.getByRole('heading', { level: 1, name: 'Something broke' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back home' })).toBeVisible()
  await page.getByRole('button', { name: 'Back home' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel('What did you lose?')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Something broke' })).toHaveCount(0)
})

test('unexpected values a screen can handle render normally', async ({ page }) => {
  await app(page, [{ ...report, photoIds: undefined, pill: 'Some new pill' }])
  await page.goto('/reports')
  await expect(page.getByRole('link', { name: /black airpods case/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Something broke' })).toHaveCount(0)
})

// The service worker module is swapped for a stand-in that records what the app asks of it.
async function stubPwa(page: Page) {
  await page.route(/virtual:pwa-register/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function registerSW(options) {
        window.__pwa = { options, applied: 0 }
        return async () => { window.__pwa.applied++ }
      }`,
    }),
  )
  await page.addInitScript(() => sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') ?? 0) + 1)))
}
const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
const applied = (page: Page) => page.evaluate(() => (window as unknown as { __pwa: { applied: number } }).__pwa.applied)
// How many times this tab has loaded the app; -1 while a reload is under way.
const loads = (page: Page) => page.evaluate(() => Number(sessionStorage.getItem('loads'))).catch(() => -1)

test('a waiting app update never goes live while the page is hidden, only at the next page change', async ({ page }) => {
  await stubPwa(page)
  await app(page)
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __pwa?: unknown }).__pwa))).toBe(true)
  await page.evaluate(() => (window as unknown as { __pwa: { options: { onNeedRefresh: () => void } } }).__pwa.options.onNeedRefresh())
  // The camera or the mail app hides the page: the form must still be there when the user comes back.
  await setVisibility(page, 'hidden')
  await page.waitForTimeout(200)
  await setVisibility(page, 'visible')
  expect(await applied(page)).toBe(0)
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect.poll(() => applied(page)).toBe(1)
  // The version this tab asked for took over: now it reloads.
  await page.evaluate(() => (window as unknown as { __pwa: { options: { onNeedReload: () => void } } }).__pwa.options.onNeedReload())
  await expect.poll(() => loads(page)).toBe(2)
})

test('another tab putting the new version live does not reload this one mid-form', async ({ page }) => {
  await stubPwa(page)
  await app(page)
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __pwa?: unknown }).__pwa))).toBe(true)
  await page.evaluate(() => {
    const pwa = (window as unknown as { __pwa: { options: { onNeedRefresh: () => void; onNeedReload: () => void } } }).__pwa
    pwa.options.onNeedRefresh()
    pwa.options.onNeedReload()
  })
  await page.waitForTimeout(300)
  expect(await loads(page)).toBe(1)
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
  // It picks the new version up at its own next page change.
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect.poll(() => loads(page)).toBe(2)
  await expect(page).toHaveURL(/\/reports$/)
})

test('a tab opened on a first visit still reloads into the update it asked for, and never on the first takeover', async ({ page }) => {
  await stubPwa(page)
  await app(page)
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __pwa?: unknown }).__pwa))).toBe(true)
  const workerChanged = () => page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')))
  // The first worker claiming the page is not an update: nothing reloads, now or at the next page change.
  await workerChanged()
  await page.waitForTimeout(200)
  expect(await loads(page)).toBe(1)
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
  // A new version waits; the page change asks for it; the worker changes. The plugin stays silent for such a tab.
  await page.evaluate(() => (window as unknown as { __pwa: { options: { onNeedRefresh: () => void } } }).__pwa.options.onNeedRefresh())
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect.poll(() => applied(page)).toBe(1)
  expect(await loads(page)).toBe(1)
  await workerChanged()
  await expect.poll(() => loads(page)).toBe(2)
})

test('page changes set the title and move focus to the new heading; Back goes back through history', async ({ page }) => {
  await app(page)
  await page.route('**/api/reports/r1', (route) => route.fulfill({ json: report }))
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await expect(page).toHaveTitle('Home · Zarqa')
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect(page).toHaveTitle('My reports · Zarqa')
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('H1')

  await page.waitForTimeout(350) // past the double-tap guard
  await page.getByRole('link', { name: /black airpods case/i }).click()
  await expect(page).toHaveURL(/\/reports\/r1$/)
  await page.waitForTimeout(350)
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/reports$/)
  // In-app Back went back: the phone's back now leads Home, not to the report again.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
})

test('a click anywhere on the date or time box opens its picker', async ({ page }) => {
  // Record the calls instead of opening the real picker, which would cover the page.
  await page.addInitScript(() => {
    const opened: string[] = []
    Object.assign(window, { opened })
    HTMLInputElement.prototype.showPicker = function () {
      opened.push(this.type)
    }
  })
  await app(page)
  await page.goto('/')
  await page.getByRole('switch', { name: /I know when/ }).click()
  await page.locator('input[type="date"]').click({ position: { x: 12, y: 12 } })
  await page.locator('input[type="time"]').click({ position: { x: 12, y: 12 } })
  expect(await page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual(['date', 'time'])
})
