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
  await page.route('**/api/auth/request-code', route => route.fulfill({ status: 429, json: { error: "We've already sent you 3 codes. Type the one in your inbox (check junk too), or wait 15 minutes for another.", reason: 'codes_sent' } }))
  await page.goto('/signin')
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  await expect(page.locator('#code')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Type the one in your inbox')
})

test('a busy-network 429 (no code was sent) stays on the email form with its message', async ({ page }) => {
  await page.route('**/api/me', route => route.fulfill({ status: 401, json: {} }))
  await page.route('**/api/auth/request-code', route => route.fulfill({ status: 429, json: { error: 'Slow down a little and try again in a few minutes.' } }))
  await page.goto('/signin')
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Slow down a little')
  await expect(page.locator('#email')).toBeVisible()
  await expect(page.locator('#code')).toHaveCount(0)
  await expect(page).not.toHaveURL(/step=code/)
  await expect(page.getByRole('button', { name: 'I already have a code' })).toHaveCount(0)
})

/** Signed out until /auth/verify succeeds; records each verify body. */
async function signInMocks(page: Page, bodies: Record<string, unknown>[]) {
  let signedIn = false
  await page.route('**/api/me', route => (signedIn ? route.fulfill({ json: me }) : route.fulfill({ status: 401, json: {} })))
  await page.route('**/api/home', route => route.fulfill({ json: {} }))
  await page.route('**/api/auth/request-code', route => route.fulfill({ json: { email: (route.request().postDataJSON() as { email: string }).email } }))
  await page.route('**/api/auth/verify', route => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>)
    signedIn = true
    return route.fulfill({ json: { isNew: false } })
  })
}

test('consent is sent with the code only while the box is ticked', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await signInMocks(page, bodies)

  // Ticked, sent, then unticked on the email form before "I already have a code".
  await toCodeStep(page)
  await page.getByRole('button', { name: 'Use another email' }).click()
  await page.getByRole('checkbox').uncheck()
  await page.getByRole('button', { name: 'I already have a code' }).click()
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).not.toHaveProperty('consentVersion')
})

test('a reload after unticking resumes the code step without recording consent', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await signInMocks(page, bodies)
  await toCodeStep(page)
  await page.getByRole('button', { name: 'Use another email' }).click()
  await page.getByRole('checkbox').uncheck()
  await page.reload()
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).not.toHaveProperty('consentVersion')
})

test('a ticked sign-in records consent with the code', async ({ page }) => {
  const bodies: Record<string, unknown>[] = []
  await signInMocks(page, bodies)
  await toCodeStep(page)
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
  expect(bodies[0].consentVersion).toEqual(expect.any(String))
})

test('an abandoned sign-in form expires, and "Use another email" on a resumed code step starts unticked', async ({ page }) => {
  await signedOut(page)
  const seed = (draft: object) =>
    page.evaluate(d => {
      sessionStorage.setItem('zarqa.signin', JSON.stringify(d))
      sessionStorage.setItem('zarqa.consentTick', '1')
    }, draft)
  await page.goto('/help')

  // Someone typed their address and ticked the box 11 minutes ago, then walked away.
  const old = Date.now() - 11 * 60_000
  await seed({ email: 'a.x@gutech.edu.om', ticked: true, sentTo: 'a.x@gutech.edu.om', sentAt: old, savedAt: old })
  await page.goto('/signin')
  await expect(page.locator('#email')).toHaveValue('')
  await expect(page.getByRole('checkbox')).not.toBeChecked()

  // Their code is still live: the code step comes back, but the next person must tick for themselves.
  const now = Date.now()
  await seed({ email: 'a.x@gutech.edu.om', ticked: true, sentTo: 'a.x@gutech.edu.om', sentAt: now, savedAt: now })
  await page.goto('/signin')
  await expect(page.locator('#code')).toBeVisible()
  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await page.reload()
  await expect(page.locator('#code')).toBeVisible()
  await page.getByRole('button', { name: 'Use another email' }).click()
  await expect(page.getByRole('checkbox')).not.toBeChecked()
})

test('a sign-out left pending offline does not end the next sign-in when /me hiccups after the code', async ({ page }) => {
  let phase: 'first' | 'out' | 'verified' = 'first'
  let meCalls = 0
  const logouts: string[] = []
  await page.route('**/api/me', route => {
    if (phase === 'first') return route.fulfill({ json: me })
    if (phase === 'out') return route.fulfill({ status: 401, json: {} })
    // Right after the code was accepted: one failure, then the account.
    return ++meCalls === 1 ? route.fulfill({ status: 503, json: { error: 'Busy' } }) : route.fulfill({ json: me })
  })
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
  await page.route('**/api/home', route => route.fulfill({ json: {} }))
  await page.route('**/api/auth/request-code', route => route.fulfill({ json: { email: 'maryam@student.gutech.edu.om' } }))
  await page.route('**/api/auth/verify', route => {
    phase = 'verified'
    return route.fulfill({ json: { isNew: false } })
  })
  await page.route('**/api/auth/logout', route => {
    logouts.push(phase)
    return phase === 'first' ? route.abort() : route.fulfill({ status: 204 })
  })

  // Signed out with no connection: the logout is left pending.
  await page.goto('/profile')
  await page.getByRole('button', { name: /^sign out$/i }).click()
  await expect(page).toHaveURL(/\/signin$/)
  phase = 'out'
  expect(await page.evaluate(() => localStorage.getItem('zarqa.logoutPending'))).toBe('1')

  // Signing in again in the same tab: the session takes over instead of being logged out.
  await page.locator('#email').fill('maryam@student.gutech.edu.om')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Send me a code', exact: true }).click()
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
  expect(logouts.filter(p => p !== 'first')).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('zarqa.logoutPending'))).toBeNull()
})

test('signing in registers this phone for alerts again when it was allowed before', async ({ page }) => {
  const subscribed: unknown[] = []
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
    const subscription = { endpoint: 'https://push.example.invalid/1', toJSON: () => ({ endpoint: 'https://push.example.invalid/1', keys: { p256dh: 'k', auth: 'a' } }) }
    const registration = { pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription } }
    Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { get: () => Promise.resolve(registration) })
  })
  await signInMocks(page, [])
  await page.route('**/api/push/key', route => route.fulfill({ json: { publicKey: 'AAAA' } }))
  await page.route('**/api/push/subscribe', route => {
    subscribed.push(route.request().postDataJSON())
    return route.fulfill({ status: 204 })
  })
  await toCodeStep(page)
  expect(subscribed).toEqual([])
  // Match alerts are off (no Home nudge): signing in alone brings the subscription back.
  await page.locator('#code').fill('123456')
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => subscribed.length).toBe(1)
})

test('a slow photo upload is not cut off after a minute, and a dead one still ends', async ({ page }) => {
  await signedOut(page)
  await page.clock.install()
  let release: (() => void) | null = null
  await page.route('**/api/upload-check', route => {
    if (route.request().headers()['x-dead']) return // never answered
    return new Promise<void>(done => {
      release = () => {
        void route.fulfill({ json: { ok: true } }).then(done)
      }
    })
  })
  await page.goto('/signin')
  const start = (dead: boolean) =>
    page.evaluate(async d => {
      const path = '/src/lib/api.ts'
      const { apiForm } = (await import(/* @vite-ignore */ path)) as { apiForm: (p: string, f: FormData) => Promise<unknown> }
      const w = window as unknown as { result?: string }
      w.result = undefined
      // The dead request is told apart by a header the mock checks: patch fetch for this call only.
      const realFetch = window.fetch
      if (d) window.fetch = (input, init) => realFetch(input, { ...init, headers: { 'x-dead': '1' } })
      apiForm('/upload-check', new FormData()).then(
        () => (w.result = 'ok'),
        (e: { status?: number }) => (w.result = `error ${e.status}`),
      )
      window.fetch = realFetch
    }, dead)
  const result = () => page.evaluate(() => (window as unknown as { result?: string }).result)

  await start(false)
  await expect.poll(() => release !== null).toBe(true)
  await page.clock.runFor(61_000)
  expect(await result()).toBeUndefined()
  release!()
  await expect.poll(result).toBe('ok')

  await start(true)
  await page.clock.runFor(4 * 60_000)
  expect(await result()).toBeUndefined()
  await page.clock.runFor(61_000)
  await expect.poll(result).toBe('error 0')
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
