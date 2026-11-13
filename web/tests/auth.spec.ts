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

test('the consent sheet is modal: nothing behind it takes focus, a click or a post, and Esc does not skip it', async ({ page }) => {
  const posts: string[] = []
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, needsConsent: true } }))
  await page.route('**/api/home', route => route.fulfill({ json: {} }))
  await page.route('**/api/reports**', route => {
    if (route.request().method() === 'POST') posts.push(route.request().url())
    return route.fulfill({ json: [] })
  })
  await page.goto('/')
  const sheet = page.getByRole('dialog', { name: 'Quick one' })
  await expect(sheet).toBeVisible()
  const inSheet = () => page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog'))

  // Tab and Shift+Tab stay in the sheet.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(key)
      expect(await inSheet()).toBe(true)
    }
  }
  // The form behind can't be focused, even from script, and a tap on its submit button never reaches it.
  const submit = page.locator('main form button[type="submit"]').first()
  expect(await submit.evaluate(b => { (b as HTMLButtonElement).focus(); return document.activeElement === b })).toBe(false)
  const box = await submit.boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press('Enter')
  // Esc, twice (Chrome closes a dialog on the second Esc unless it is reopened), leaves the sheet up.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  expect(await submit.evaluate(b => { (b as HTMLButtonElement).focus(); return document.activeElement === b })).toBe(false)
  expect(posts).toEqual([])
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

test('an unfinished report never reaches the next account on this browser', async ({ page }) => {
  let who = 'owner'
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, id: who, email: `${who}@gutech.edu.om` } }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
  await page.route('**/api/home', route => route.fulfill({ json: {} }))
  await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }))
  const typed = 'Blue wallet with a library book inside'

  // Another account signs in on the same browser: the draft is gone before Home opens.
  await page.goto('/')
  await page.locator('#item-text').fill(typed)
  await page.waitForTimeout(300)
  await page.reload()
  await expect(page.locator('#item-text')).toHaveValue(typed)
  who = 'someone-else'
  await page.reload()
  await expect(page.locator('#item-text')).toHaveValue('')

  // Signing out clears it too, even when the same account comes back.
  await page.locator('#item-text').fill(typed)
  await page.waitForTimeout(300)
  await page.goto('/profile')
  await page.getByRole('button', { name: /^sign out$/i }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await page.goto('/')
  await expect(page.locator('#item-text')).toHaveValue('')
})
