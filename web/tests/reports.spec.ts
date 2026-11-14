import { expect, test, type Page } from '@playwright/test'

// My reports and one report: load states, the in-app close sheet, editing, ended reports.
const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, isRsa: false, matchAlerts: false, showFirstName: true, avatarUrl: null }
const base = {
  id: 'r1', kind: 'lost', title: 'Black AirPods case', category: 'Electronics', categoryKey: 'Electronics', description: 'Black AirPods case, scratched lid',
  locationName: 'Library', locationText: 'Library', eventDate: null, eventTime: null, status: 'Open', pill: 'Searching', isSensitive: false, photoIds: [],
  matchId: null, conversationId: null, createdAt: '2026-11-10T08:00:00Z', dropAtRsa: false, dropCode: null, rsaReceived: false, pickupMatchId: null,
}

async function app(page: Page, reports: unknown[] = [base]) {
  await page.route('**/api/me', (route) => route.fulfill({ json: me }))
  await page.route('**/api/home', (route) => route.fulfill({ json: { active: 1, matchesWaiting: 0, unreadChats: 0, postsLeft: 3 } }))
  await page.route('**/api/locations', (route) => route.fulfill({ json: [{ name: 'Library', aliases: [] }] }))
  await page.route('**/api/reports/mine', (route) => route.fulfill({ json: reports }))
}

test('a list that fails to load says so and retries, instead of "Nothing posted yet"', async ({ page }) => {
  let fail = true
  await app(page)
  await page.route('**/api/reports/mine', (route) => (fail ? route.fulfill({ status: 500, json: { error: 'x' } }) : route.fulfill({ json: [base] })))
  await page.goto('/reports')
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  await expect(page.getByText(/nothing posted yet/i)).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: /try again/i }).click()
  await expect(page.getByRole('link', { name: /black airpods case/i })).toBeVisible()
})

test('closing asks in an in-app sheet, then the list says it closed', async ({ page }) => {
  await app(page)
  let closed = false
  await page.route('**/api/reports/r1', (route) => route.fulfill({ json: base }))
  await page.route('**/api/reports/r1/close', (route) => {
    closed = true
    return route.fulfill({ status: 204 })
  })
  page.on('dialog', () => {
    throw new Error('no browser dialogs')
  })
  await page.goto('/reports/r1')
  await page.getByRole('button', { name: 'I found it myself' }).click()
  const sheet = page.getByRole('dialog', { name: 'Close it?' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Keep looking' }).click()
  expect(closed).toBe(false)
  await page.getByRole('button', { name: 'I found it myself' }).click()
  await page.getByRole('dialog', { name: 'Close it?' }).getByRole('button', { name: 'Close it' }).click()
  await expect(page).toHaveURL(/\/reports$/)
  expect(closed).toBe(true)
  await expect(page.getByText("Closed. I've stopped looking for it.")).toBeVisible()
})

test('a searching report can be edited with the one text box', async ({ page }) => {
  await app(page)
  let sent: Record<string, unknown> | null = null
  await page.route('**/api/reports/r1', (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill({ json: base })
    sent = route.request().postDataJSON()
    return route.fulfill({ json: { ...base, title: 'Black AirPods case', description: 'Black AirPods case, green cable tie' } })
  })
  await page.goto('/reports/r1')
  await page.getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('WHAT IT IS').fill('Black AirPods case, green cable tie')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText("Saved. I'm checking it again.")).toBeVisible()
  await expect(page.getByText('Black AirPods case, green cable tie')).toBeVisible()
  expect(sent).toMatchObject({ text: 'Black AirPods case, green cable tie', locationName: 'Library', locationText: 'Library', eventDate: '' })
})

test('an expired report says why and offers to post it again; a deleted one says it is gone', async ({ page }) => {
  await app(page)
  await page.route('**/api/reports/r1', (route) => route.fulfill({ json: { ...base, status: 'Expired', pill: 'Expired' } }))
  await page.route('**/api/reports/gone', (route) => route.fulfill({ status: 404, json: { error: 'Not found.' } }))
  await page.goto('/reports/r1')
  await expect(page.getByText(/stopped looking after 60 days/)).toBeVisible()
  await page.getByRole('button', { name: /post it again/i }).click()
  await expect(page).toHaveURL(/\/$/)
  // Home is handed the old report's words and fills its form with them (it then clears the one-shot state itself).
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Black AirPods case, scratched lid')
  await expect(page.getByRole('combobox')).toHaveValue('Library')

  await page.goto('/reports/gone')
  await expect(page.getByRole('heading', { level: 1, name: /report not found/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /my reports/i })).toBeVisible()
})
