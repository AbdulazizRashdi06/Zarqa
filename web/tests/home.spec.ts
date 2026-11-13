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
