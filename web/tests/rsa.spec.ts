import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const me = { id: 'staff', email: 'rsa@gutech.edu.om', firstName: 'Huda', isAdmin: false, isRsa: true, matchAlerts: false, showFirstName: true }
const item = { id: 'item', code: 'K7P-4QM', title: 'Blue metal bottle', description: 'Dent near the lid', locationText: 'GU1 Library', eventDate: null, isSensitive: false, photoIds: [], state: 'expected', finderName: 'Omar', createdAt: '2026-10-26T08:00:00Z', receivedAt: null }
const claim = { code: 'HMX-3PT', ownerName: 'Maryam', title: 'Blue Hydro Flask', description: 'Has a sticker of a cat', locationText: 'GU1 Library', eventDate: null, claimedAt: '2026-10-26T09:00:00Z' }

async function session(page: Page, isRsa = true) {
  await page.route('**/api/me', route => route.fulfill({ json: { ...me, isRsa } }))
  await page.route('**/api/me/stats', route => route.fulfill({ json: { posts: 0, gotBack: 0, helpedReturn: 0 } }))
}

test('non-staff cannot open the RSA desk', async ({ page }) => {
  await session(page, false)
  let calls = 0
  await page.route('**/api/rsa/**', route => { calls++; return route.fulfill({ status: 403 }) })
  await page.goto('/rsa')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('link', { name: 'RSA desk' })).toHaveCount(0)
  expect(calls).toBe(0)
})

test('staff receive a drop-off and hand over a pickup at 390px', async ({ page }) => {
  await session(page)
  page.on('dialog', d => d.accept())
  let received = 0, handed = 0
  await page.route('**/api/rsa/desk/*', route => {
    const code = decodeURIComponent(route.request().url().split('/').pop()!)
    if (code === 'K7P-4QM') return route.fulfill({ json: { type: 'drop', item, claim: null } })
    if (code === 'HMX-3PT') return route.fulfill({ json: { type: 'pickup', item: { ...item, state: 'claimed', receivedAt: '2026-10-26T08:30:00Z' }, claim } })
    return route.fulfill({ status: 404, json: { error: 'No item with that code. Check it with them again.' } })
  })
  await page.route('**/api/rsa/drop/K7P-4QM/receive', route => { received++; return route.fulfill({ json: { ...item, state: 'held' } }) })
  await page.route('**/api/rsa/pickup/HMX-3PT/handover', route => { handed++; return route.fulfill({ status: 204 }) })

  await page.goto('/profile')
  await page.getByRole('link', { name: 'RSA desk' }).click()
  await expect(page).toHaveURL(/\/rsa$/)
  await page.getByLabel('Drop or pickup code').fill('k7p-4qm')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByRole('heading', { name: 'Blue metal bottle' })).toBeVisible()
  await page.getByRole('button', { name: 'Received', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('on the shelf')
  expect(received).toBe(1)

  await page.getByLabel('Drop or pickup code').fill('HMX-3PT')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('Has a sticker of a cat')).toBeVisible()
  await expect(page.getByText('Maryam')).toBeVisible()
  await page.getByRole('button', { name: 'Handed over' }).click()
  await expect(page.getByRole('status')).toContainText('returned')
  expect(handed).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/rsa-desk-phone.png', fullPage: true })
})

test('chats are read-only for staff', async ({ page }) => {
  await session(page)
  await page.route('**/api/rsa/conversations', route => route.fulfill({ json: [{ id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Active', lastMessage: "What's the strap colour?", lastAt: '2026-10-26T10:00:00Z', messages: 2 }] }))
  await page.route('**/api/rsa/conversations/chat', route => route.fulfill({ json: { id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Active', messages: [
    { id: 1, kind: 'system', from: null, text: 'You two matched.', at: '2026-10-26T09:00:00Z', handoverAt: null, handoverPlace: null, handoverStatus: null },
    { id: 2, kind: 'text', from: 'found', text: "What's the strap colour?", at: '2026-10-26T10:00:00Z', handoverAt: null, handoverPlace: null, handoverStatus: null },
  ] } }))
  let writes = 0
  await page.route('**/api/conversations/**', route => { writes++; return route.fulfill({ status: 404 }) })
  await page.goto('/rsa')
  await page.getByRole('tab', { name: 'Chats' }).click()
  await page.getByRole('button', { name: /Casio watch/ }).click()
  await expect(page.getByText("What's the strap colour?")).toBeVisible()
  await expect(page.getByText(/Omar · Finder/)).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  expect(writes).toBe(0)
})

test('the RSA desk has no serious accessibility violations', async ({ page }) => {
  await session(page)
  await page.route('**/api/rsa/items', route => route.fulfill({ json: [{ ...item, state: 'held', receivedAt: '2026-10-26T08:30:00Z' }] }))
  await page.goto('/rsa')
  for (const tab of ['Desk', 'Shelf']) {
    await page.getByRole('tab', { name: tab }).click()
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
})

test('a found report can go to the RSA and shows its drop code', async ({ page }) => {
  await session(page, false)
  const posted = { id: 'found', kind: 'found', title: 'Blue metal bottle', category: '', categoryKey: 'bottle', description: 'Dent near the lid', locationName: null, locationText: 'GU1 Library', eventDate: null, eventTime: null, status: 'Open', pill: 'Bring to RSA', isSensitive: false, photoIds: [], matchId: null, conversationId: null, createdAt: '2026-10-26T08:00:00Z', dropAtRsa: true, dropCode: 'K7P-4QM', rsaReceived: false, pickupMatchId: null }
  let sentDrop = ''
  await page.route('**/api/home', route => route.fulfill({ json: { active: 0, matchesWaiting: 0, unreadChats: 0, postsLeft: 10 } }))
  await page.route('**/api/locations*', route => route.fulfill({ json: [] }))
  await page.route('**/api/reports', route => { sentDrop = route.request().postData()?.includes('name="dropAtRsa"') ? 'yes' : 'no'; return route.fulfill({ json: posted }) })
  await page.route('**/api/reports/found', route => route.fulfill({ json: posted }))
  await page.goto('/')
  await page.getByRole('button', { name: /found/i }).first().click()
  await page.getByRole('switch', { name: "I'll drop it at the RSA desk" }).click()
  await page.getByRole('textbox').first().fill('Blue metal bottle with a dent near the lid')
  await page.getByRole('button', { name: /post/i }).last().click()
  await expect(page).toHaveURL(/\/reports\/found$/)
  expect(sentDrop).toBe('yes')
  await expect(page.getByText('K7P-4QM')).toBeVisible()
  await expect(page.getByText(/Take it to the RSA desk/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/rsa-drop-code-phone.png', fullPage: true })
})

test('a card handed in shows only its covered copy, with a note', async ({ page }) => {
  await session(page)
  const card = { ...item, title: 'Blue student card', isSensitive: true, photoIds: ['covered-photo'] }
  const photos: string[] = []
  await page.route('**/api/rsa/desk/*', route => route.fulfill({ json: { type: 'drop', item: card, claim: null } }))
  await page.route('**/api/photos/**', route => { photos.push(route.request().url()); return route.fulfill({ status: 404 }) })
  await page.goto('/rsa')
  await page.getByLabel('Drop or pickup code').fill('K7P-4QM')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('numbers and barcodes covered')).toBeVisible()
  await expect(page.getByRole('img', { name: /Blue student card/ })).toHaveCount(1)
  expect(photos.every(u => u.endsWith('/api/photos/covered-photo'))).toBe(true)
})
