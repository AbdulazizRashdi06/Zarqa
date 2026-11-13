import { expect, test, type Page } from '@playwright/test'

const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, isRsa: false, matchAlerts: false, showFirstName: true, avatarUrl: null }
const report = {
  id: 'r1', kind: 'lost', title: 'Black AirPods case', category: 'Electronics', categoryKey: 'Electronics', description: 'Black case, scratched lid.',
  locationName: 'Library', locationText: 'Library', eventDate: null, eventTime: null, status: 'Active', pill: 'Searching', isSensitive: false, photoIds: [],
  matchId: null, conversationId: null, createdAt: '2026-11-10T08:00:00Z', dropAtRsa: false, dropCode: null, rsaReceived: false, pickupMatchId: null,
}
const side = { id: 's', title: 'Black AirPods case', description: 'Found on a table.', categoryKey: 'Electronics', locationText: 'Library', eventDate: null, eventTime: null, photoIds: [], createdAt: '2026-11-10T08:00:00Z', isSensitive: false }
const match = { id: 'm1', status: 'Suggested', finalScore: 0.9, strength: 'big', reasons: ['Same kind of item'], createdAt: '2026-11-10T09:00:00Z', lost: side, found: side, conversationId: null, atRsa: false, rsaReceived: false, pickupCode: null, collected: false }

async function app(page: Page) {
  await page.route('**/api/me', (route) => route.fulfill({ json: me }))
  await page.route('**/api/home', (route) => route.fulfill({ json: { active: 1, matchesWaiting: 0, unreadChats: 0, postsLeft: 3 } }))
  await page.route('**/api/locations', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/reports/mine', (route) => route.fulfill({ json: [report] }))
  await page.route('**/api/reports/r1', (route) => route.fulfill({ json: report }))
  await page.route('**/api/matches/m1', (route) => route.fulfill({ json: match }))
}

/** Names of the animations that move something (not plain fades) and are running or waiting to run. */
const moving = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' || a.playState === 'pending')
      .map((a) => (a as CSSAnimation).animationName ?? 'transition')
      .filter((name) => !/fade/i.test(name)),
  )

test('pages change through the slide and open at the top', async ({ page }) => {
  await app(page)
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.getByRole('link', { name: /my reports/i }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('heading', { name: /your reports/i })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // A report opens at once from its card (the card grows into the ticket), and Back returns to the list.
  await page.getByRole('link', { name: /black airpods case/i }).click()
  await expect(page).toHaveURL(/\/reports\/r1$/)
  await expect(page.getByRole('heading', { name: 'Black AirPods case' })).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('link', { name: /black airpods case/i })).toBeVisible()
  // The page is never left frozen in a transition.
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.nav ?? null)).toBeNull()
})

test('the match reveal plays, and never hides the answer buttons', async ({ page }) => {
  await app(page)
  await page.goto('/matches/m1')
  // The buttons work from the first frame: nothing in the reveal delays them.
  await expect(page.getByRole('button', { name: /could be mine|mine/i }).first()).toBeEnabled()
  expect((await moving(page)).some((name) => /stampDown/.test(name))).toBe(true)
  await expect(page.getByRole('img', { name: /chance|match/i }).first()).toBeVisible()
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('keeps the fades and drops the movement', async ({ page }) => {
    await app(page)
    await page.goto('/matches/m1')
    await page.getByRole('heading', { level: 1 }).waitFor()
    expect(await moving(page)).toEqual([])
    await expect(page.getByText('Same kind of item')).toBeVisible()

    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    expect(await moving(page)).toEqual([])
  })
})
