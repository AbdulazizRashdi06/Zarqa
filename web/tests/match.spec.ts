import { expect, test, type Page } from '@playwright/test'

// The Match screen ("Is this yours?") at 390px with a mocked API.
const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, isRsa: false, matchAlerts: false, showFirstName: true, avatarUrl: null, needsConsent: false }
const side = (o = {}) => ({
  id: 's', title: 'Black wallet', description: 'Black leather wallet with a gold button.', categoryKey: 'Wallet', locationText: 'GU1 Library', eventDate: null, eventTime: null,
  photoIds: [] as string[], createdAt: '2026-11-10T08:00:00Z', isSensitive: false, hasPrivatePhoto: false, ...o,
})
const base = {
  id: 'm1', status: 'Suggested', finalScore: 0.9, strength: 'big', reasons: ['Same kind of item: wallet', 'Same spot: GU1 Library'], createdAt: '2026-11-10T09:00:00Z',
  lost: side(), found: side(), conversationId: null, atRsa: false, rsaReceived: false, pickupCode: null as string | null, collected: false, taken: false,
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function app(page: Page, match: Record<string, unknown> | (() => object)) {
  await page.route('**/api/me', (route) => route.fulfill({ json: me }))
  await page.route('**/api/home', (route) => route.fulfill({ json: { active: 1, matchesWaiting: 1, unreadChats: 0, postsLeft: 3 } }))
  await page.route('**/api/reports/mine', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/photos/*', (route) => route.fulfill({ contentType: 'image/png', body: png }))
  await page.route('**/api/matches/m1', (route) => route.fulfill({ json: typeof match === 'function' ? match() : match }))
}

test('"Not mine" asks first, and saying so shows it closed', async ({ page }) => {
  let rejected = 0
  await app(page, base)
  await page.route('**/api/matches/m1/reject', (route) => {
    rejected++
    return route.fulfill({ status: 204 })
  })
  await page.goto('/matches/m1')
  await page.getByRole('button', { name: 'Not mine, keep looking' }).click()
  const sheet = page.getByRole('dialog', { name: "Sure it's not yours?" })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Look again' }).click()
  await expect(sheet).toBeHidden()
  expect(rejected).toBe(0)

  await page.getByRole('button', { name: 'Not mine, keep looking' }).click()
  await sheet.getByRole('button', { name: 'Not mine' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Closed' })).toBeFocused()
  await expect(page.getByText("Got it, not yours. I'll keep looking.")).toBeVisible()
  expect(rejected).toBe(1)
})

test('an RSA claim shows the ticket even if the refresh fails, and can be taken back', async ({ page }) => {
  let claimed = false
  await app(page, () => ({ ...base, atRsa: true }))
  await page.route('**/api/matches/m1', (route) => (claimed ? route.fulfill({ status: 500, json: { error: 'Something went wrong. Try again.' } }) : route.fallback()))
  await page.route('**/api/matches/m1/confirm', (route) => {
    claimed = true
    return route.fulfill({ json: { pickupCode: 'K7P-4QM' } })
  })
  let released = 0
  await page.route('**/api/matches/m1/release', (route) => {
    released++
    return route.fulfill({ status: 204 })
  })
  await page.goto('/matches/m1')
  await expect(page.getByText(/The finder is taking it to the RSA desk/)).toBeVisible()
  await page.getByRole('button', { name: 'Could be mine' }).click()
  // Not received yet: no "Go get it".
  await expect(page.getByRole('heading', { level: 1, name: 'Not there yet' })).toBeFocused()
  await expect(page.getByText('K 7 P 4 Q M')).toBeAttached()

  await page.getByRole('button', { name: 'Not mine after all' }).click()
  await page.getByRole('dialog', { name: 'Not yours after all?' }).getByRole('button', { name: 'Not mine' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Closed' })).toBeVisible()
  expect(released).toBe(1)
})

test('photos open whole in a viewer', async ({ page }) => {
  await app(page, { ...base, found: side({ photoIds: ['p1', 'p2'] }) })
  await page.goto('/matches/m1')
  await page.getByRole('button', { name: "Finder's photo 2 of 2" }).click()
  const viewer = page.getByRole('dialog', { name: "Finder's photo 2 of 2" })
  await expect(viewer).toBeVisible()
  await viewer.getByRole('button', { name: 'Previous photo' }).click()
  await expect(page.getByRole('dialog', { name: "Finder's photo 1 of 2" })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a match someone else has claimed waits instead of offering a button that fails', async ({ page }) => {
  await app(page, { ...base, taken: true })
  await page.goto('/matches/m1')
  await expect(page.getByText(/Someone else claimed this one first/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Could be mine' })).toHaveCount(0)
})

test('a failed load offers Try again, and long words never widen the page', async ({ page }) => {
  let fail = true
  await app(page, () => ({ ...base, reasons: ['Same kind of item: ' + 'x'.repeat(150)], found: side({ description: 'y'.repeat(400) }) }))
  await page.route('**/api/matches/m1', (route) => (fail ? route.fulfill({ status: 500, json: { error: 'Something went wrong. Try again.' } }) : route.fallback()))
  await page.goto('/matches/m1')
  await expect(page.getByRole('alert')).toContainText('Something went wrong')
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByRole('button', { name: 'What they wrote' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/is this/i)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
