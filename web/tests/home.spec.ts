import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { INVISIBLE_RE, isSensitiveText, NOT_CARD_RE, SENSITIVE_RE } from '../src/lib/rules'

// A real 2×2 PNG, so the browser can decode it like a phone photo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==', 'base64')

const user = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@gutech.edu.om`,
  firstName: id === 'user-a' ? 'Amal' : 'Badr',
  suggestedFirstName: null,
  showFirstName: true,
  matchAlerts: false,
  locale: 'en',
  avatarUrl: null,
  isAdmin: false,
  isRsa: false,
  ...extra,
})

async function home(page: Page, me: () => Record<string, unknown>, posts: string[] = []) {
  await page.route('**/api/me', (route) => route.fulfill({ json: me() }))
  await page.route('**/api/home', (route) => route.fulfill({ json: { active: 0, matchesWaiting: 0, unreadChats: 0, postsLeft: 10 } }))
  await page.route('**/api/locations*', (route) => route.fulfill({ json: [{ name: 'GU1 Library', aliases: ['lib'] }] }))
  await page.route('**/api/reports', (route) => {
    posts.push(route.request().postData() ?? '')
    return route.fulfill({ json: { id: 'r1', kind: 'lost', dropCode: null } })
  })
}

const storedDraft = (page: Page) =>
  page.evaluate(async () => {
    const photos = await new Promise<unknown>((resolve) => {
      const req = indexedDB.open('zarqa-draft', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('photos')
      req.onsuccess = () => {
        const db = req.result
        const get = db.transaction('photos').objectStore('photos').get('list')
        get.onsuccess = () => {
          const v = get.result as { owner?: string; blobs?: Blob[] } | Blob[] | undefined
          db.close()
          resolve(v === undefined ? null : Array.isArray(v) ? { owner: null, count: v.length } : { owner: v.owner, count: v.blobs?.length })
        }
      }
    })
    return { fields: localStorage.getItem('zarqa.draft'), legacy: sessionStorage.getItem('zarqa.draft'), photos }
  })

test('a draft belongs to its account: the next account on this browser gets an empty form and the draft is deleted', async ({ page }) => {
  let me = user('user-a')
  await home(page, () => me)
  await page.goto('/')
  await page.getByRole('button', { name: 'I found something' }).click()
  await page.getByLabel('What did you find?').fill('Black wallet with a GUtech ID card')
  await page.locator('input[type=file]').setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  await expect.poll(async () => (await storedDraft(page)).photos).toEqual({ owner: 'user-a', count: 1 })
  expect(JSON.parse((await storedDraft(page)).fields ?? '{}').owner).toBe('user-a')

  // Same browser, another account signs in.
  me = user('user-b')
  await page.reload()
  await expect(page.getByText('Badr')).toBeVisible()
  await expect(page.getByLabel('What did you lose?')).toHaveValue('')
  await expect(page.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)
  await expect(page.getByText('Picked up where you left off.')).toHaveCount(0)
  await expect.poll(async () => (await storedDraft(page)).photos).toBeNull()
  const after = await storedDraft(page)
  expect(after.fields ?? '').not.toContain('wallet')
  expect(after.fields ?? '').not.toContain('user-a')
})

test('an ownerless draft from an older version is ignored and deleted', async ({ page }) => {
  await home(page, () => user('user-b'))
  await page.goto('/')
  await page.evaluate(async () => {
    sessionStorage.setItem('zarqa.draft', JSON.stringify({ mode: 'found', text: 'Old passport', locQuery: '', placeName: null, knowsWhen: false, date: '', time: '' }))
    localStorage.setItem('zarqa.draft', JSON.stringify({ mode: 'found', text: 'Old passport' }))
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('zarqa-draft', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('photos')
      req.onsuccess = () => {
        const tx = req.result.transaction('photos', 'readwrite')
        tx.objectStore('photos').put([new Blob(['x'], { type: 'image/png' })], 'list')
        tx.oncomplete = () => {
          req.result.close()
          resolve()
        }
      }
    })
  })
  await page.reload()
  await expect(page.getByLabel('What did you lose?')).toHaveValue('')
  await expect.poll(async () => (await storedDraft(page)).photos).toBeNull()
  const after = await storedDraft(page)
  expect(after.legacy).toBeNull()
  expect(after.fields ?? '').not.toContain('passport')
})

test('the same account gets its draft back, RSA choice included, and can start over', async ({ page }) => {
  await home(page, () => user('user-a'))
  await page.goto('/')
  await page.getByRole('button', { name: 'I found something' }).click()
  await page.getByLabel('What did you find?').fill('Blue bottle')
  await page.getByRole('switch', { name: "I'll drop it at the RSA desk" }).click()
  await page.reload()
  await expect(page.getByLabel('What did you find?')).toHaveValue('Blue bottle')
  await expect(page.getByRole('switch', { name: "I'll drop it at the RSA desk" })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByLabel('What did you find?')).toHaveValue('')
  expect((await storedDraft(page)).fields ?? '').not.toContain('Blue bottle')
})

// Seeds a draft for user-a whose text and photos were last saved the given number of hours ago.
// Seeded from a page without the form, so nothing on Home can save over it, then Home is opened.
const seedDraft = async (page: Page, fieldsHoursAgo: number, photosHoursAgo: number) => {
  await page.goto('/help')
  // Once the session has noted who is signed in, it won't clear the draft as another account's.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('zarqa.lastUser'))).toBe('user-a')
  await page.evaluate(
    async ([fieldsAgo, photosAgo, png]) => {
      const hour = 60 * 60 * 1000
      const fields = { mode: 'lost', text: 'Blue bottle', locQuery: '', placeName: null, knowsWhen: false, date: '2020-01-01', time: '', dropAtRsa: false }
      localStorage.setItem('zarqa.draft', JSON.stringify({ owner: 'user-a', savedAt: Date.now() - fieldsAgo * hour, fields }))
      const blob = new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' })
      await new Promise<void>((resolve) => {
        const req = indexedDB.open('zarqa-draft', 1)
        req.onupgradeneeded = () => req.result.createObjectStore('photos')
        req.onsuccess = () => {
          const tx = req.result.transaction('photos', 'readwrite')
          const record = { owner: 'user-a', savedAt: Date.now() - photosAgo * hour, sig: `1#${blob.size}:${blob.type}`, blobs: [blob] }
          tx.objectStore('photos').put(record, 'list')
          tx.oncomplete = () => {
            req.result.close()
            resolve()
          }
        }
      })
    },
    [fieldsHoursAgo, photosHoursAgo, PNG.toString('base64')] as const,
  )
  await page.goto('/')
}

test('a draft has one clock: text edited an hour ago keeps day-old photos with it', async ({ page }) => {
  await home(page, () => user('user-a'))
  await seedDraft(page, 1, 25)
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
  await expect(page.getByText('Picked up where you left off.')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  await expect.poll(async () => (await storedDraft(page)).photos).toEqual({ owner: 'user-a', count: 1 })
})

test('a draft has one clock: adding a photo keeps the text alive too', async ({ page }) => {
  await home(page, () => user('user-a'))
  await seedDraft(page, 23, 23)
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  // Restoring changes nothing, so the text keeps its old time until something is edited.
  const start = Date.now()
  expect(JSON.parse((await storedDraft(page)).fields ?? '{}').savedAt).toBeLessThan(start - 22 * 60 * 60 * 1000)
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible()
  await expect.poll(async () => (await storedDraft(page)).photos).toEqual({ owner: 'user-a', count: 2 })
  await expect.poll(async () => JSON.parse((await storedDraft(page)).fields ?? '{}').savedAt).toBeGreaterThanOrEqual(start - 1000)
  const fields = JSON.parse((await storedDraft(page)).fields ?? '{}')
  expect(fields.owner).toBe('user-a')
  expect(fields.fields.text).toBe('Blue bottle')
})

test('a draft left alone for a day is dropped, text and photos together', async ({ page }) => {
  await home(page, () => user('user-a'))
  await seedDraft(page, 25, 25)
  await expect(page.getByLabel('What did you lose?')).toHaveValue('')
  await expect(page.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)
  await expect.poll(async () => (await storedDraft(page)).photos).toBeNull()
})

test('no report goes out while consent is missing', async ({ page }) => {
  const posts: string[] = []
  await home(page, () => user('user-a', { needsConsent: true }), posts)
  await page.route('**/api/me/consent', (route) => route.fulfill({ status: 204 }))
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  // Submit straight from the form, as if the sheet in front of it weren't there.
  await page.locator('form').first().evaluate((f: HTMLFormElement) => f.requestSubmit())
  await page.waitForTimeout(300)
  expect(posts).toHaveLength(0)
})

test('a 403 for missing consent reloads the session, opens the consent sheet and keeps the form', async ({ page }) => {
  let needsConsent = false
  let meCalls = 0
  await home(page, () => {
    meCalls++
    return user('user-a', { needsConsent })
  })
  await page.route('**/api/reports', (route) => {
    needsConsent = true
    return route.fulfill({ status: 403, json: { error: 'Agree to the Terms and Privacy first.' } })
  })
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  const before = meCalls
  await page.getByRole('button', { name: 'Find my stuff' }).click()
  await expect.poll(() => meCalls).toBeGreaterThan(before)
  await expect(page.getByRole('checkbox').or(page.getByRole('dialog')).first()).toBeVisible()
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
})

test('a 403 for another reason shows the server message and keeps the form', async ({ page }) => {
  await home(page, () => user('user-a'))
  await page.route('**/api/reports', (route) => route.fulfill({ status: 403, json: { error: 'This account is blocked. See Help.' } }))
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  await page.getByRole('button', { name: 'Find my stuff' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'This account is blocked. See Help.' })).toBeVisible()
  await expect(page.getByLabel('What did you lose?')).toHaveValue('Blue bottle')
})

test('"Post it again" fills the form from the report once, over a stored draft', async ({ page }) => {
  await home(page, () => user('user-a'))
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Old draft text')
  // ReportDetail navigates to / with state.repost: arrive on Home from another page with the history entry the router would push.
  await page.goto('/tips')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => {
    history.pushState({ usr: { repost: { mode: 'found', text: 'Blue bottle with stickers', locQuery: 'GU1 Library', placeName: 'GU1 Library' } }, key: 'rp', idx: 1 }, '', '/')
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
  })
  await expect(page.getByLabel('What did you find?')).toHaveValue('Blue bottle with stickers')
  await expect(page.getByRole('combobox')).toHaveValue('GU1 Library')
  await expect(page.getByText('Picked up where you left off.')).toHaveCount(0)
  // One-shot: the state is cleared, so a reload shows the (now saved) form, not a second repost.
  await expect.poll(() => page.evaluate(() => (history.state as { usr?: unknown } | null)?.usr ?? null)).toBeNull()
})

test('Enter in the place field never posts the report', async ({ page }) => {
  const posts: string[] = []
  await home(page, () => user('user-a'), posts)
  await page.goto('/')
  await page.getByLabel('What did you lose?').fill('Blue bottle')
  const place = page.getByRole('combobox')
  await place.fill('lib')
  await place.press('Enter')
  await expect(place).toHaveValue('GU1 Library')
  await place.press('Enter')
  await page.waitForTimeout(300)
  expect(posts).toHaveLength(0)
})

test('a file that is not a photo is refused when picked, not after posting', async ({ page }) => {
  await home(page, () => user('user-a'))
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'notes.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not a picture') })
  await expect(page.getByText("I couldn't read that photo. Try another one.")).toBeVisible()
  await expect(page.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)
  await expect(page.getByText('0/4')).toBeVisible()
})

test('Home has no sideways scroll on narrow phones, in either mode', async ({ page }) => {
  await home(page, () => user('user-a'))
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    for (const mode of ['I found something', 'I lost something']) {
      await page.getByRole('button', { name: mode }).click()
      await page.waitForTimeout(250)
      // html clips sideways overflow as a safety net, so measure the page itself: nothing may reach past the screen edge.
      const widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('main *')].map((e) => e.getBoundingClientRect().right)))
      expect(widest, `${width}px ${mode}`).toBeLessThanOrEqual(width)
    }
  }
})

test('the card notice shows for real cards, also next to things that are not cards', async ({ page }) => {
  await home(page, () => user('user-a'))
  await page.goto('/')
  const box = page.getByLabel('What did you lose?')
  for (const text of ['power bank and my bank card', 'SIM card holder with my ID', 'بطاقة بنك', 'بطـاقة']) {
    await box.fill(text)
    await expect(page.getByText('LOST A CARD OR ID?')).toBeVisible()
  }
  await box.fill('Anker power bank')
  await expect(page.getByText('LOST A CARD OR ID?')).toHaveCount(0)
})

// The client check must be the server's (Categories.cs) word for word: same lists, same clean-up.
test('the card check mirrors the server', () => {
  const server = readFileSync(fileURLToPath(new URL('../../server/Zarqa.Api/Reports/Categories.cs', import.meta.url)), 'utf8')
  const patterns = [...server.matchAll(/GeneratedRegex\(@"((?:[^"]|"")*)"/g)].map((m) => m[1].replaceAll('""', '"'))
  expect(patterns).toContain(SENSITIVE_RE.source)
  expect(patterns).toContain(NOT_CARD_RE.source)
  expect(patterns).toContain(INVISIBLE_RE.source)
  // Case-insensitive, and ECMAScript so \b means what it means in the browser (ASCII letters only).
  for (const re of [SENSITIVE_RE, NOT_CARD_RE]) {
    const line = server.split('\n').find((l) => l.includes(`@"${re.source}"`))
    expect(line).toContain('RegexOptions.IgnoreCase | RegexOptions.ECMAScript')
    expect(re.flags).toContain('i')
  }

  const cards = [
    'bank card', 'ATM card', 'Mastercard', 'my mulkiya', 'I.D. holder', 'Omani resident I.D.', 'debit mastercard', 'iqama',
    'SIM card holder with my ID', 'power bank and my bank card', 'memory card + ID card', 'SD card, visa', 'flash cards and my debit card',
    'Bank Muscat power bank', 'SIM-card wallet', 'Power bank and my student ID', 'SIM card holder with a bank card',
    'وجدت بطاقة بنكية', 'البطاقة الشخصية', 'هويتي', 'جواز سفر', 'بطاقة بنك', 'بطاقة ذاكرة', 'power bank مع بطاقة', 'هويه', 'رخصه القياده',
    'ملكيه السياره', 'لقيت كرت بنك', 'الكرت حقي', 'كارت صراف', 'فيزا', 'باسبور', 'بِطَاقَة', 'بطـــاقة', 'هـوية', 'الID حقي', 'لقيت ATM',
    'I​D card', 'pass­port', 'ＩＤ',
  ]
  const notCards = [
    'power bank, white Anker', 'Powerbank 10000mAh', 'SanDisk SD card 64GB', 'micro SD card in a case', 'Ooredoo SIM card', 'memory card',
    'Arabic flash cards', 'deck of playing cards', 'Idea notebook', 'محفظة سوداء', 'مذكرتي الزرقاء', 'ذكرت لونها أسود',
  ]
  for (const t of cards) expect(isSensitiveText(t), t).toBe(true)
  for (const t of notCards) expect(isSensitiveText(t), t).toBe(false)
})
