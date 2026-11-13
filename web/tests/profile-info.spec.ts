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

test('sign out that cannot reach Zarqa never fails silently', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await session(page)
  await page.route('**/api/auth/logout', (route) => route.abort('internetdisconnected'))
  await page.goto('/profile')
  await page.getByRole('button', { name: /sign out/i }).click()
  // Either Profile says it couldn't, or (if signOut() clears the session locally anyway) the user lands on sign-in.
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t sign out' }).or(page.locator('#email'))).toBeVisible()
  expect(errors).toEqual([])
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

test('a profile photo can be removed after a confirmation, and Profile says who sees it', async ({ page }) => {
  await session(page, { avatarUrl: '/api/avatars/owner?v=1' })
  let deletes = 0
  await page.route('**/api/me/avatar', (route) => {
    deletes++
    return route.fulfill({ json: { ...me, avatarUrl: null } })
  })
  await page.route('**/api/avatars/**', (route) => route.fulfill({ status: 404 }))
  await page.goto('/profile')
  await expect(page.getByText('People you chat with see your photo and first name.')).toBeVisible()
  await page.getByRole('button', { name: 'Remove photo' }).click()
  const sheet = page.getByRole('dialog', { name: 'Remove your photo?' })
  await sheet.getByRole('button', { name: 'Keep it' }).click()
  expect(deletes).toBe(0)
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await sheet.getByRole('button', { name: 'Remove photo' }).click()
  await expect(sheet).toBeHidden()
  expect(deletes).toBe(1)
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0)
})

test('deleting the account clears the report draft left in this browser', async ({ page }) => {
  await session(page)
  await page.route('**/api/me', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.fulfill({ json: me })))
  await page.goto('/profile')
  await page.evaluate(() => sessionStorage.setItem('zarqa.draft', JSON.stringify({ mode: 'lost', text: 'My bank card' })))
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Continue' }).click()
  // The final step ignores taps for a moment after it appears (see the double-tap case below).
  await page.waitForTimeout(700)
  await page.getByRole('dialog', { name: 'This can’t be undone' }).getByRole('button', { name: 'Delete for good' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  expect(await page.evaluate(() => sessionStorage.getItem('zarqa.draft'))).toBeNull()
})

test('a double tap on Continue does not also delete the account', async ({ page }) => {
  await session(page)
  let deletes = 0
  await page.route('**/api/me', (route) => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: me })
    deletes++
    return route.fulfill({ status: 204 })
  })
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Continue' }).dblclick()
  const final = page.getByRole('dialog', { name: 'This can’t be undone' })
  await expect(final).toBeVisible()
  // A quick third tap (or a held Enter) is still the same gesture: it restarts the pause instead of deleting.
  await final.getByRole('button', { name: 'Delete for good' }).click()
  await page.waitForTimeout(300)
  await expect(final).toBeVisible()
  expect(deletes).toBe(0)
  await expect(page).toHaveURL(/\/profile$/)
  // A deliberate tap after the pause deletes; the keyboard works too.
  await page.waitForTimeout(700)
  await final.getByRole('button', { name: 'Delete for good' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/signin$/)
  expect(deletes).toBe(1)
})

test('after deleting the account, the next sign-in in this tab starts on Home, not Profile', async ({ page }) => {
  await session(page)
  await page.route('**/api/me', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.fallback()))
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('dialog', { name: 'This can’t be undone' }).getByRole('button', { name: 'Delete for good' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(page.locator('#email')).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('zarqa.returnTo'))).toBeNull()
  // Someone signs in in the same tab (the mocked /api/me now answers with a session): they land on Home.
  await page.reload()
  await expect(page).toHaveURL(/:\d+\/$/)
})

test('a failed account deletion keeps this phone subscribed to alerts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
    const sub = {
      endpoint: 'https://push.invalid/this-phone',
      toJSON: () => ({ endpoint: 'https://push.invalid/this-phone', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe: async () => {
        current = null
        return true
      },
    }
    let current: typeof sub | null = sub
    const pushManager = { getSubscription: async () => current, subscribe: async () => (current = sub) }
    const registration = { pushManager, update: async () => undefined, addEventListener() {}, removeEventListener() {} }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(registration), getRegistration: async () => registration, register: async () => registration, addEventListener() {}, removeEventListener() {}, controller: null },
    })
  })
  await session(page)
  const calls: string[] = []
  await page.route('**/api/push/key', (route) => route.fulfill({ json: { publicKey: 'BAAA' } }))
  await page.route(/\/api\/push\/(un)?subscribe$/, (route) => {
    calls.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 204 })
  })
  await page.route('**/api/me', (route) =>
    route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: { error: 'Please retry deletion.' } }) : route.fallback(),
  )
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Delete my account' }).click()
  await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(700)
  const final = page.getByRole('dialog', { name: 'This can’t be undone' })
  await final.getByRole('button', { name: 'Delete for good' }).click()
  await expect(final.getByRole('alert').filter({ hasText: 'Please retry deletion.' })).toBeVisible()
  // Signing in already registers this phone once (calls before the unsubscribe); what matters is that the
  // unsubscribe made for the deletion is followed by a new subscribe when the deletion fails.
  await expect.poll(() => calls.slice(calls.lastIndexOf('/api/push/unsubscribe'))).toEqual(['/api/push/unsubscribe', '/api/push/subscribe'])
  expect(calls.filter((c) => c === '/api/push/unsubscribe')).toHaveLength(1)
})
