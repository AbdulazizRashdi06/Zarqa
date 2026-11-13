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

test('a page that crashes on an unexpected value shows a way out instead of a blank screen', async ({ page }) => {
  await app(page, [{ ...report, photoIds: undefined, pill: 'Some new pill' }])
  await page.goto('/reports')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: /reload|back home/i }).or(page.getByRole('link', { name: /black airpods case/i })).first()).toBeVisible()
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
