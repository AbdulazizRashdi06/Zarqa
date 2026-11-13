import { expect, test, type Page } from '@playwright/test'

const me = { id: 'owner', email: 'maryam@student.gutech.edu.om', firstName: 'Maryam', isAdmin: false, isRsa: false, matchAlerts: true, showFirstName: true, avatarUrl: null }
async function session(page: Page, extra: Record<string, unknown> = {}) {
  let current = { ...me, ...extra }
  await page.route('**/api/me', (route) => {
    if (route.request().method() === 'PATCH') current = { ...current, ...route.request().postDataJSON() }
    return route.fulfill({ json: current })
  })
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: { posts: 2, gotBack: 1, helpedReturn: 1 } }))
}

test('alerts row says when this phone is blocked, and errors are announced', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }))
  await session(page)
  await page.goto('/profile')
  await expect(page.getByText('Notifications are blocked for Zarqa')).toBeVisible()
  await page.route('**/api/me', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 500, json: { error: 'Try that again.' } }) : route.fulfill({ json: me }),
  )
  await page.getByRole('switch', { name: 'Show my first name in chats' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Try that again.' })).toBeVisible()
})

test('a first name can be changed from Profile, and staff tools come first', async ({ page }) => {
  await session(page, { isRsa: true })
  await page.goto('/profile')
  await expect(page.getByText('STAFF', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Change name' }).click()
  await page.locator('#profile-name').fill('Mariam')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Mariam' })).toBeVisible()
})

test('long first names stay on one line', async ({ page }) => {
  await session(page, { firstName: 'Abdulrahman' })
  await page.goto('/profile')
  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toBeVisible()
  const box = await h1.boundingBox()
  const lineHeight = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(box!.height).toBeLessThan(lineHeight * 1.5)
})

test('sign out that cannot reach Zarqa says so and stays signed in', async ({ page }) => {
  await session(page)
  await page.route('**/api/auth/logout', (route) => route.abort('internetdisconnected'))
  await page.goto('/profile')
  await page.getByRole('button', { name: /sign out/i }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t sign out' })).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)
})

test('info pages go back to the page that opened them, and Privacy has lists', async ({ page }) => {
  await session(page)
  await page.goto('/profile')
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.locator('main li').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'hello@tryzarqa.com' }).first()).toHaveAttribute('href', 'mailto:hello@tryzarqa.com')
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Back', exact: true }).last().click()
  await expect(page).toHaveURL(/\/profile$/)
})
