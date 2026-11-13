import { expect, test, type Page } from '@playwright/test'

const me = { id: 'owner', email: 'test@gutech.edu.om', firstName: 'Tester', isAdmin: false, matchAlerts: false, showFirstName: true }

async function signedOut(page: Page, sent: string[] = []) {
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/auth/request-code', route => {
    const email = (route.request().postDataJSON() as { email: string }).email
    sent.push(email)
    return route.fulfill({ json: { email } })
  })
}

async function toCodeStep(page: Page) {
  await page.goto('/signin')
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  await expect(page).toHaveURL(/step=code/)
}

test('the code step survives a reload, Back returns to the email form, and "I already have a code" sends nothing', async ({ page }) => {
  const sent: string[] = []
  await signedOut(page, sent)
  await toCodeStep(page)
  await page.reload()
  await expect(page.locator('#code')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#email')).toHaveValue('maryam@student.gutech.edu.om')
  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'I already have a code' }).click()
  await expect(page.locator('#code')).toBeVisible()
  expect(sent).toHaveLength(1)
})

test('a pasted "482 913" or the whole subject line fills all six boxes and signs in', async ({ page }) => {
  await signedOut(page)
  const codes: string[] = []
  await page.route('**/api/auth/verify', route => {
    codes.push((route.request().postDataJSON() as { code: string }).code)
    return route.fulfill({ status: 400, json: { error: 'Wrong code. 4 tries left.' } })
  })
  await toCodeStep(page)
  await page.locator('#code').fill('482 913')
  await expect.poll(() => codes).toEqual(['482913'])
  await page.locator('#code').fill('Your Zarqa code: 104729')
  await expect.poll(() => codes).toEqual(['482913', '104729'])
})

test('the email form keeps the typed address and tick across a trip to Terms', async ({ page }) => {
  await signedOut(page)
  await page.goto('/signin')
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('link', { name: 'Terms', exact: true }).click()
  await expect(page).toHaveURL(/\/terms$/)
  await page.goBack()
  await expect(page.locator('#email')).toHaveValue('maryam@student.gutech.edu.om')
  await expect(page.getByRole('checkbox')).toBeChecked()
})

test('too many codes opens the code boxes for the address instead of a dead end', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/auth/request-code', route => route.fulfill({ status: 429, json: { error: "We've already sent you 3 codes. Type the one in your inbox (check junk too), or wait 15 minutes for another." } }))
  await page.goto('/signin')
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  await expect(page.locator('#code')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Type the one in your inbox')
})

test('the consent sheet is modal: nothing behind it takes focus', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, needsConsent: true } }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
  await page.goto('/profile')
  await expect(page.getByRole('dialog', { name: 'Quick one' })).toBeVisible()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog'))).toBe(true)
  }
})

test('sign out works without a connection and finishes the logout on the next start', async ({ page }) => {
  let online = false
  let logouts = 0
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, needsConsent: true } }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
  await page.route('**/api/auth/logout', route => {
    if (!online) return route.abort()
    logouts++
    return route.fulfill({ status: 204 })
  })
  await page.goto('/profile')
  await page.getByRole('dialog', { name: 'Quick one' }).getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/signin$/)
  online = true
  await page.reload()
  await expect(page.locator('#email')).toBeVisible()
  expect(logouts).toBe(1)
})
