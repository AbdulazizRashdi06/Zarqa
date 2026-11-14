import { expect, test, type Page } from '@playwright/test'

const me = { id: 'admin', email: 'admin@gutech.edu.om', firstName: 'Ada', isAdmin: true, isRsa: false, matchAlerts: false, showFirstName: true, avatarUrl: null }
const stats = {
  users: 14, admins: 1, sampleUsers: 9, sampleReports: 15, newUsers30d: 3, returned: 1, pendingJobs: 2, failedJobs: 0, spendTodayUsd: 0.031, spend30dUsd: 1.5,
  reports: [{ kind: 'Lost', status: 'Open', count: 12 }, { kind: 'Found', status: 'Pickup', count: 8 }], matches: [], decidedBy: [{ by: 'Debate', count: 3 }],
}
const long = 'Supercalifragilisticexpialidocious-water-bottle-with-stickers-everywhere'
function report(over: Record<string, unknown> = {}) {
  return { id: 'r1', kind: 'lost', title: 'Blue bottle', description: 'Hydro flask', location: 'Library', status: 'Open', isSensitive: false, owner: 'student@gutech.edu.om', ownerId: 'u1', ownerBanned: false, ownerIsAdmin: false, photoIds: [], createdAt: '2026-11-10T08:00:00Z', ...over }
}
async function session(page: Page) {
  await page.route('**/api/me', route => route.fulfill({ json: me }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
}

test('a failed load offers Try again instead of an empty list, and keeps Delete everything off', async ({ page }) => {
  await session(page)
  let fail = true
  await page.route('**/api/admin/stats', route => fail ? route.fulfill({ status: 500, json: { error: 'boom' } }) : route.fulfill({ json: stats }))
  await page.route('**/api/admin/reports*', route => fail ? route.fulfill({ status: 500, json: { error: 'boom' } }) : route.fulfill({ json: [report()] }))
  await page.goto('/admin')
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible()
  await expect(page.getByText('No reports here yet.')).toHaveCount(0)
  await page.getByText('Demo and danger tools').click()
  await expect(page.locator('#wipe-word')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
  fail = false
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(2)
  await page.getByRole('button', { name: 'Try again' }).first().click()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Blue bottle' })).toBeVisible()
  await expect(page.locator('#wipe-word')).toBeEnabled()
})

test('Delete everything names the site and the scope, needs the site name and a second confirmation, and runs once', async ({ page }) => {
  await session(page)
  await page.route('**/api/admin/stats', route => route.fulfill({ json: stats }))
  await page.route('**/api/admin/reports*', route => route.fulfill({ json: [] }))
  let wipes = 0
  let body: unknown = null
  await page.route('**/api/admin/delete-everything', async route => {
    wipes++; body = route.request().postDataJSON()
    await new Promise(r => setTimeout(r, 400))
    return route.fulfill({ json: { reports: 20, users: 13 } })
  })
  await page.goto('/admin')
  const tools = page.getByText('Demo and danger tools')
  // The first screen is the numbers, not the danger box.
  await expect(page.getByRole('heading', { name: 'Numbers' })).toBeInViewport()
  await expect(page.locator('#wipe-word')).not.toBeVisible()
  await tools.click()
  const site = await page.evaluate(() => location.hostname)
  await expect(page.getByText(`On ${site} this deletes 20 reports and 13 accounts.`).first()).toBeVisible()
  const word = page.locator('#wipe-word')
  await word.fill('DELETE')
  await expect(page.getByText(`Not quite: type ${site} exactly.`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
  await word.fill(site)
  await page.getByRole('button', { name: 'Delete everything' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('heading', { name: `Delete everything on ${site}?` })).toBeVisible()
  // Cancelling clears the typed word.
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(word).toHaveValue('')
  expect(wipes).toBe(0)
  await word.fill(site)
  await page.getByRole('button', { name: 'Delete everything' }).click()
  const go = page.getByRole('dialog').getByRole('button', { name: /Yes, delete everything/ })
  await go.click()
  await go.click({ force: true, timeout: 500 }).catch(() => {})
  await expect(page.getByText('Deleted 20 reports and 13 accounts.')).toBeVisible()
  await expect(page.getByText('Deleted 20 reports and 13 accounts.')).toBeInViewport()
  expect(wipes).toBe(1)
  expect(body).toEqual({ confirm: 'DELETE' })
  await expect(word).toHaveValue('')
})

test('an action error shows on the card that was tapped, and admin owners have no Ban button', async ({ page }) => {
  await session(page)
  await page.route('**/api/admin/stats', route => route.fulfill({ json: stats }))
  const many = Array.from({ length: 8 }, (_, i) => report({ id: `r${i}`, title: `Item ${i}`, ownerId: `u${i}` }))
  many.push(report({ id: 'adm', title: 'Admin item', ownerId: 'a1', owner: 'admin@gutech.edu.om', ownerIsAdmin: true }))
  await page.route('**/api/admin/reports*', route => route.fulfill({ json: many }))
  await page.route('**/api/admin/reports/r7/close', route => route.fulfill({ status: 500, json: { error: 'Could not close that one.' } }))
  await page.goto('/admin')
  const card = page.locator('div', { has: page.getByRole('heading', { name: 'Item 7' }) }).last()
  await card.getByRole('button', { name: 'Close report' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText('Item 7')
  await expect(sheet).toContainText("can't be reopened here")
  await sheet.getByRole('button', { name: 'Close it' }).click()
  const err = card.getByRole('alert')
  await expect(err).toHaveText('Could not close that one.')
  await expect(err).toBeInViewport()
  const adminCard = page.locator('div', { has: page.getByRole('heading', { name: 'Admin item' }) }).last()
  await expect(adminCard.getByRole('button', { name: 'Ban owner' })).toHaveCount(0)
  await expect(adminCard.getByText('Admin', { exact: true })).toBeVisible()
})

test('sample data is shown as on, sample rows are tagged, and the tiles leave sample people out', async ({ page }) => {
  await session(page)
  await page.route('**/api/admin/stats', route => route.fulfill({ json: stats }))
  await page.route('**/api/admin/reports*', route => route.fulfill({ json: [report({ owner: 'huda@sample.invalid' }), report({ id: 'r2', title: long, ownerBanned: true, status: 'Pickup', kind: 'found' })] }))
  await page.goto('/admin')
  await expect(page.getByText('Students & staff').locator('..')).toContainText('5')
  await expect(page.getByText('Sample', { exact: true })).toBeVisible()
  await expect(page.getByText('Banned', { exact: true })).toBeVisible()
  await expect(page.getByText('Found · Waiting at RSA')).toBeVisible()
  await expect(page.getByText('Lost / Open: 12')).toBeVisible()
  await expect(page.getByText('Debate (two advocates and a judge): 3')).toBeVisible()
  await page.getByText('Demo and danger tools').click()
  await expect(page.getByText('Sample data is in: 15 reports from 9 made-up people.', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
})

test('search and the Pickup filter go to the server, and the match log names the other report', async ({ page }) => {
  await session(page)
  await page.route('**/api/admin/stats', route => route.fulfill({ json: stats }))
  const urls: string[] = []
  await page.route('**/api/admin/reports*', route => { urls.push(route.request().url()); return route.fulfill({ json: [report({ photoIds: ['p1'], isSensitive: true })] }) })
  await page.route('**/api/admin/log?*', route => route.fulfill({ json: [{ id: 1, step: 'review', payload: '{"finalScore":0.91,"sameItem":0.9}', costUsd: 0.031, createdAt: '2026-11-13T09:00:00Z', counterpartTitle: 'Blue Hydro flask', counterpartKind: 'found' }] }))
  await page.route('**/api/photos/p1', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="63"><rect width="100" height="63" fill="#888"/></svg>' }))
  await page.goto('/admin')
  await page.getByLabel('Report status').selectOption('Pickup')
  await expect.poll(() => urls.some(u => u.includes('status=Pickup'))).toBe(true)
  await page.getByLabel('Search reports').fill('flask')
  await expect.poll(() => urls.some(u => u.includes('q=flask') && u.includes('status=Pickup'))).toBe(true)
  const toggle = page.getByRole('button', { name: 'View match log' })
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Hide match log' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('review · vs “Blue Hydro flask” (Found) · score 0.91 · $0.031', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Open photo of Blue bottle' }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Photo of Blue bottle' })).toBeVisible()
  await page.getByRole('button', { name: 'Close photo' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Re-check asks first, refreshes the numbers and words zero results', async ({ page }) => {
  await session(page)
  let statsCalls = 0
  await page.route('**/api/admin/stats', route => { statsCalls++; return route.fulfill({ json: stats }) })
  await page.route('**/api/admin/reports*', route => route.fulfill({ json: [] }))
  await page.route('**/api/admin/rematch', route => route.fulfill({ json: { queued: 0 } }))
  await page.goto('/admin')
  await expect(page.getByText('Matching queue')).toBeVisible()
  const before = statsCalls
  await page.getByRole('button', { name: 'Re-check open reports' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Re-check them' }).click()
  await expect(page.getByText('No open reports to re-check.')).toBeVisible()
  expect(statsCalls).toBeGreaterThan(before)
})

test('on a laptop the admin page uses the width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await session(page)
  await page.route('**/api/admin/stats', route => route.fulfill({ json: stats }))
  await page.route('**/api/admin/reports*', route => route.fulfill({ json: [report(), report({ id: 'r2', title: 'Red umbrella' })] }))
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Red umbrella' })).toBeVisible()
  expect(await page.locator('main').evaluate(m => m.getBoundingClientRect().width)).toBeGreaterThan(900)
  const a = await page.getByRole('heading', { name: 'Blue bottle' }).boundingBox()
  const b = await page.getByRole('heading', { name: 'Red umbrella' }).boundingBox()
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(5)
})
