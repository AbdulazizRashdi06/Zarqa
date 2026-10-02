import { expect, test, type Page } from '@playwright/test'

const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, matchAlerts: false, showFirstName: true }
async function session(page: Page, admin = false) {
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, isAdmin: admin } }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
}
test('public information opens without a session and fits a phone', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: {} }))
  for (const [path, title] of [['terms', 'Terms'], ['privacy', 'Privacy'], ['help', 'Help & feedback'], ['tips', 'Safe handover tips']]) {
    await page.goto(`/${path}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/signin')
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await page.screenshot({ path: 'test-results/privacy-phone.png', fullPage: true })
})
test('account deletion requires both confirmations and keeps session on failure', async ({ page }) => {
  await session(page)
  let deletes = 0
  await page.route('**/api/me', route => {
    if (route.request().method() === 'DELETE') { deletes++; return route.fulfill({ status: 500, json: { error: 'Please retry deletion.' } }) }
    return route.fulfill({ json: me })
  })
  await page.goto('/profile')
  let dialogs = 0
  const cancelSecond = async (dialog: import('@playwright/test').Dialog) => { dialogs++; if (dialogs === 1) await dialog.accept(); else await dialog.dismiss() }
  page.on('dialog', cancelSecond)
  await page.getByRole('button', { name: 'Delete my account' }).click()
  expect(dialogs).toBe(2); expect(deletes).toBe(0)
  page.off('dialog', cancelSecond)
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByText('Please retry deletion.')).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
  await page.route('**/api/me', route => route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.fulfill({ json: me }))
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await expect(page).toHaveURL(/\/signin$/)
})
test('non-admin cannot open admin screen', async ({ page }) => {
  await session(page)
  let adminCalls = 0
  await page.route('**/api/admin/**', route => { adminCalls++; return route.fulfill({ status: 403 }) })
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/profile$/)
  expect(adminCalls).toBe(0)
})
test('admin can moderate and inspect logs without requesting sensitive photos', async ({ page }) => {
  await session(page, true)
  const report = { id: 'report', title: 'Student ID', kind: 'found', status: 'Open', owner: 'finder@gutech.edu.om', ownerId: 'finder', ownerBanned: false, isSensitive: true, photoIds: ['private-photo'], description: 'A card', location: 'Library' }
  await page.route('**/api/admin/stats', route => route.fulfill({ json: { users: 2, newUsers30d: 2, returned: 0, pendingJobs: 1, failedJobs: 0, spendTodayUsd: 0, spend30dUsd: 0, reports: [], matches: [], decidedBy: [] } }))
  await page.route('**/api/admin/reports', route => route.fulfill({ json: [report] }))
  await page.route('**/api/admin/log?*', route => route.fulfill({ json: [{ id: 1, step: 'shortlist', payload: '{"count":0}', createdAt: '2026-10-02T12:00:00Z' }] }))
  let privateCalls = 0
  await page.route('**/api/photos/**', route => { privateCalls++; return route.fulfill({ status: 403 }) })
  await page.route('**/api/admin/reports/report/close', route => { report.status = 'Closed'; return route.fulfill({ status: 204 }) })
  await page.route('**/api/admin/users/finder/ban', route => { report.ownerBanned = true; return route.fulfill({ status: 204 }) })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'View match log' }).click()
  await page.getByText(/shortlist ·/).click()
  await expect(page.getByText('{"count":0}')).toBeVisible()
  page.on('dialog', d => d.accept())
  await page.getByRole('button', { name: 'Close report', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close report', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Ban owner', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unban owner' })).toBeVisible()
  expect(privateCalls).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/admin-phone.png', fullPage: true })
})
