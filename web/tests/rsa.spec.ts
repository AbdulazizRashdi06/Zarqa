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
  // Desk actions are confirmed in the app's own sheet, which names the item and its code.
  await page.getByRole('button', { name: 'Mark as received' }).click()
  await expect(page.getByRole('dialog')).toContainText('K7P-4QM')
  await page.getByRole('dialog').getByRole('button', { name: 'Mark as received' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'On the shelf' })).toContainText('Blue metal bottle')
  expect(received).toBe(1)

  await page.getByLabel('Drop or pickup code').fill('HMX-3PT')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('Has a sticker of a cat')).toBeVisible()
  await expect(page.getByText('Maryam')).toBeVisible()
  await page.getByRole('button', { name: 'Hand it over' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hand it over' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Handed to Maryam' })).toContainText('returned')
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
  // The list stays behind (hidden) so Back returns to the same place in it.
  await expect(page.getByRole('list').getByText("What's the strap colour?")).toBeVisible()
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

test('the other desk tabs and a read-only chat have no serious accessibility violations', async ({ page }) => {
  await session(page)
  await page.route('**/api/rsa/found', route => route.fulfill({ json: [{ ...item, state: 'held', receivedAt: '2026-10-26T08:30:00Z', suggestedTo: ['maryam@gutech.edu.om'] }] }))
  await page.route('**/api/rsa/team', route => route.fulfill({ json: [{ email: 'rsa@gutech.edu.om', addedAt: '2026-10-26T08:00:00Z' }, { email: 'salim@gutech.edu.om', addedAt: '2026-10-26T08:00:00Z' }] }))
  await page.route('**/api/rsa/conversations', route => route.fulfill({ json: [{ id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Active', lastMessage: 'Hi', lastAt: '2026-10-26T10:00:00Z', messages: 3 }] }))
  await page.route('**/api/rsa/conversations/chat', route => route.fulfill({ json: { id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Active', messages: [
    { id: 1, kind: 'system', from: null, text: 'You two matched.', at: '2026-10-26T09:00:00Z', handoverAt: null, handoverPlace: null, handoverStatus: null },
    { id: 2, kind: 'text', from: 'lost', text: 'Is it black?', at: '2026-10-26T09:30:00Z', handoverAt: null, handoverPlace: null, handoverStatus: null },
    { id: 3, kind: 'text', from: 'found', text: 'Yes', at: '2026-10-26T10:00:00Z', handoverAt: null, handoverPlace: null, handoverStatus: null },
  ] } }))
  const check = async () => {
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  for (const tab of ['found', 'team', 'chats']) {
    await page.goto(`/rsa?tab=${tab}`)
    await check()
  }
  await page.goto('/rsa?tab=chats&chat=chat')
  await expect(page.getByText('Is it black?')).toBeVisible()
  await check()
})

test('the Found tab lists every found report with where it is', async ({ page }) => {
  await session(page)
  await page.route('**/api/rsa/found', route => route.fulfill({ json: [
    { ...item, id: 'kept', code: null, title: 'Silver ring', state: 'finder' },
    { ...item, id: 'chat', code: null, title: 'Casio watch', state: 'chatting' },
    item,
  ] }))
  await page.goto('/rsa')
  await page.getByRole('tab', { name: 'Found' }).click()
  // "Can be matched" is the default view; "All" shows the one already in a chat too.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByText('With the finder')).toBeVisible()
  await expect(page.getByText('Owner and finder chatting')).toBeVisible()
  await expect(page.getByText(/K7P-4QM · On its way/)).toBeVisible()
  // Open items can be matched to someone at the desk; one already in a chat can't.
  await expect(page.getByRole('button', { name: 'Match to someone' })).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // All five tabs stay on one row at 390px.
  const tops = await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => tab.getBoundingClientRect().top))
  expect(new Set(tops).size).toBe(1)
})

test('staff match someone at the desk to a found item', async ({ page }) => {
  await session(page)
  page.on('dialog', d => d.accept())
  const held = { ...item, id: 'held', title: 'Black umbrella', state: 'held', receivedAt: '2026-10-26T08:30:00Z' }
  let sent: unknown = null
  await page.route('**/api/rsa/found', route => route.fulfill({ json: [{ ...item, id: 'kept', code: null, title: 'Silver ring', state: 'finder' }, held] }))
  await page.route('**/api/rsa/person*', route => route.fulfill({ json: { email: 'maryam@student.gutech.edu.om', hasAccount: true, name: 'Maryam' } }))
  await page.route('**/api/rsa/found/*/match', route => { sent = { url: route.request().url(), ...route.request().postDataJSON() }; return route.fulfill({ json: { handedOver: true, title: 'Black umbrella' } }) })
  await page.goto('/rsa')
  await page.getByRole('tab', { name: 'Found' }).click()
  await page.getByRole('button', { name: 'Match to someone' }).nth(1).click()
  // On the shelf: "hand it over now" starts ticked.
  await expect(page.getByRole('checkbox', { name: /hand it over now/ })).toBeChecked()
  await page.getByLabel('Their GUtech email').fill('maryam@student.gutech.edu.om')
  // The email is all staff type.
  await expect(page.getByRole('textbox')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/rsa-manual-match-phone.png', fullPage: true })
  await page.getByRole('button', { name: 'Hand it over' }).click()
  // The sheet says what Zarqa knows about the address before anything is sent.
  await expect(page.getByRole('dialog')).toContainText('is on Zarqa as Maryam')
  await page.getByRole('dialog').getByRole('button', { name: 'Hand it over' }).click()
  await expect(page.getByText('Handed over to maryam@student.gutech.edu.om. Marked returned.')).toBeVisible()
  expect(sent).toEqual({ url: expect.stringContaining('/api/rsa/found/held/match'), email: 'maryam@student.gutech.edu.om', handOver: true })
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

test('a covered card photo opens full size, still only the covered copy', async ({ page }) => {
  await session(page)
  const card = { ...item, title: 'Blue student card', isSensitive: true, photoIds: ['covered-photo'] }
  const photos: string[] = []
  await page.route('**/api/rsa/desk/*', route => route.fulfill({ json: { type: 'drop', item: card, claim: null } }))
  await page.route('**/api/photos/**', route => { photos.push(route.request().url()); return route.fulfill({ status: 404 }) })
  await page.goto('/rsa')
  await page.getByLabel('Drop or pickup code').fill('K7P-4QM')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await page.getByRole('button', { name: 'Open photo 1 of Blue student card' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close photo' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(photos.length).toBeGreaterThan(0)
  expect(photos.every(u => u.endsWith('/api/photos/covered-photo'))).toBe(true)
})

test('the code box cleans what is typed and explains a wrong code without asking the server', async ({ page }) => {
  await session(page)
  let lookups = 0
  await page.route('**/api/rsa/desk/*', route => { lookups++; return route.fulfill({ json: { type: 'drop', item, claim: null } }) })
  await page.goto('/rsa')
  const box = page.getByLabel('Drop or pickup code')
  await box.fill(' k7p 4qm ')
  await expect(box).toHaveValue('K7P-4QM')
  await box.fill('K7P-4Q0')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByRole('alert')).toContainText('never use 0, O')
  await box.fill('K7P')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByRole('alert')).toContainText('6 characters')
  expect(lookups).toBe(0)
  await box.fill('K7P4QM')
  await page.getByRole('button', { name: 'Look it up' }).click()
  // The result is announced by moving focus to its heading.
  await expect(page.getByRole('heading', { name: 'Someone is handing this in' })).toBeFocused()
  expect(lookups).toBe(1)
})

test('a drop code says where the item really is', async ({ page }) => {
  await session(page)
  const states: Record<string, object> = {
    'ACD-EFG': { ...item, state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
    'ACD-EFH': { ...item, state: 'collected', receivedAt: '2026-10-26T08:30:00Z', updatedAt: '2026-10-28T08:30:00Z' },
    'ACD-EFJ': { ...item, state: 'closed', receivedAt: '2026-10-26T08:30:00Z', updatedAt: '2026-10-28T08:30:00Z' },
  }
  await page.route('**/api/rsa/desk/*', route => {
    const code = decodeURIComponent(route.request().url().split('/').pop()!)
    return route.fulfill({ json: { type: 'drop', item: states[code], claim: null } })
  })
  await page.goto('/rsa')
  const look = async (code: string) => {
    await page.getByLabel('Drop or pickup code').fill(code)
    await page.getByRole('button', { name: 'Look it up' }).click()
  }
  await look('ACD-EFG')
  await expect(page.getByRole('heading', { name: 'Already on the shelf' })).toBeVisible()
  await expect(page.getByText(/On the shelf \d+ days/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark as received' })).toHaveCount(0)
  await look('ACD-EFH')
  await expect(page.getByRole('heading', { name: 'Already collected' })).toBeVisible()
  await expect(page.getByText(/^Collected 28 Oct/)).toBeVisible()
  await look('ACD-EFJ')
  await expect(page.getByRole('heading', { name: 'This report was closed' })).toBeVisible()
})

test('a pickup for an item never handed in offers no handover, and "not theirs" is confirmed once', async ({ page }) => {
  await session(page)
  const dialogs: string[] = []
  page.on('dialog', d => { dialogs.push(d.message()); return d.dismiss() })
  let rejects = 0
  await page.route('**/api/rsa/desk/*', route => {
    const code = decodeURIComponent(route.request().url().split('/').pop()!)
    const received = code === 'HMX-3PT'
    return route.fulfill({ json: { type: 'pickup', item: { ...item, state: 'claimed', receivedAt: received ? '2026-10-26T08:30:00Z' : null }, claim: { ...claim, code, ownerEmail: 'maryam@student.gutech.edu.om', description: received ? claim.description : '' } } })
  })
  await page.route('**/api/rsa/pickup/*/reject', async route => { rejects++; await new Promise(r => setTimeout(r, 300)); return route.fulfill({ status: 204 }) })
  await page.goto('/rsa')
  await page.getByLabel('Drop or pickup code').fill('HMX-3PQ')
  await page.getByRole('button', { name: 'Look it up' }).click()
  await expect(page.getByText('NOT HANDED IN YET', { exact: true })).toBeVisible()
  await expect(page.getByText('They gave no details')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hand it over' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: "It's not theirs" })).toHaveCount(0)

  await page.getByLabel('Drop or pickup code').fill('HMX-3PT')
  await page.getByRole('button', { name: 'Look it up' }).click()
  // Staff compare the student ID with the owner's GUtech address.
  await expect(page.getByText('maryam@student.gutech.edu.om')).toBeVisible()
  await page.getByRole('button', { name: "It's not theirs" }).click()
  await expect(page.getByRole('dialog')).toContainText("can't be undone")
  await page.getByRole('dialog').getByRole('button', { name: "It's not theirs" }).dblclick()
  await expect(page.getByRole('status').filter({ hasText: 'Not theirs' })).toContainText('HMX-3PT')
  expect(rejects).toBe(1)
  expect(dialogs).toEqual([])
  // Focus is back in the code box for the next person.
  await expect(page.getByLabel('Drop or pickup code')).toBeFocused()
})

test('the Found tab searches, filters and shows a sent match on its card', async ({ page }) => {
  await session(page)
  let posts = 0
  const items = [
    { ...item, id: 'kept', code: null, title: 'Silver ring', state: 'finder', suggestedTo: [] as string[] },
    { ...item, id: 'gone', code: null, title: 'Red scarf', state: 'returned' },
    { ...item, id: 'shelf', code: 'ACD-EFG', title: 'Black umbrella', state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
  ]
  await page.route('**/api/rsa/found', route => route.fulfill({ json: items }))
  await page.route('**/api/rsa/person*', route => route.fulfill({ json: { email: 'nobody.yet@gutech.edu.om', hasAccount: false, name: null } }))
  await page.route('**/api/rsa/found/kept/match', route => {
    posts++
    items[0] = { ...items[0], suggestedTo: ['nobody.yet@gutech.edu.om'] }
    return route.fulfill({ json: { handedOver: false, title: 'Silver ring' } })
  })
  await page.goto('/rsa?tab=found')
  await expect(page.getByRole('tab', { name: 'Found' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('2 items')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Red scarf' })).toHaveCount(0)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Red scarf' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search' }).fill('efg')
  await expect(page.getByText('1 item', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Black umbrella' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search' }).fill('')

  await page.getByRole('button', { name: 'Match to someone: Silver ring' }).click()
  await page.getByLabel('Their GUtech email').fill('nobody.yet@gutech.edu.om')
  await page.getByRole('button', { name: 'Send them the match' }).click()
  await expect(page.getByRole('dialog')).toContainText('No Zarqa account yet')
  await page.getByRole('dialog').getByRole('button', { name: 'Send them the match' }).click()
  // The result is on the card that was acted on, and the card says who it went to.
  await expect(page.getByRole('status').filter({ hasText: 'Sent to nobody.yet@gutech.edu.om' })).toBeVisible()
  await expect(page.getByText('Already sent to: nobody.yet@gutech.edu.om')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Match to someone: Silver ring' })).toHaveText('Match to someone else')
  expect(posts).toBe(1)
})

test('the shelf shows age, closes only what it holds and sends an owner without a code to the pickup', async ({ page }) => {
  await session(page)
  const old = new Date(Date.now() - 70 * 86_400_000).toISOString()
  let closes = 0
  const shelf = [
    { ...item, id: 'held', title: 'Lab coat', state: 'held', receivedAt: old },
    { ...item, id: 'way', code: 'ACD-EFG', title: 'Grey hoodie', state: 'expected' },
    { ...item, id: 'claimed', code: 'QRT-6WA', title: 'Blue metal bottle', state: 'claimed', receivedAt: '2026-10-26T08:30:00Z' },
  ]
  await page.route('**/api/rsa/items', route => route.fulfill({ json: shelf.filter(i => closes === 0 || i.id !== 'held') }))
  await page.route('**/api/rsa/items/held/close', route => { closes++; return route.fulfill({ status: 204 }) })
  await page.route('**/api/rsa/desk/*', route => {
    const code = decodeURIComponent(route.request().url().split('/').pop()!)
    if (code === 'QRT-6WA') return route.fulfill({ json: { type: 'drop', item: shelf[2], claim } })
    return route.fulfill({ json: { type: 'pickup', item: shelf[2], claim } })
  })
  await page.goto('/rsa?tab=shelf')
  await expect(page.getByRole('heading', { name: 'On the shelf (1)' })).toBeVisible()
  await expect(page.getByText(/On the shelf 70 days/)).toBeVisible()
  await expect(page.getByText('Not handed in yet. It expires by itself')).toBeVisible()
  await expect(page.getByRole('button', { name: /Give away or close/ })).toHaveCount(1)
  await page.getByRole('button', { name: 'Only 60+ days' }).click()
  await expect(page.getByRole('heading', { name: 'Grey hoodie' })).toHaveCount(0)
  await page.getByRole('button', { name: 'All', exact: true }).click()

  await page.getByRole('button', { name: 'Give away or close: Lab coat' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Give away / close' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Closed' })).toContainText('Lab coat')
  await expect(page.getByRole('heading', { name: 'Lab coat' })).toHaveCount(0)
  expect(closes).toBe(1)

  await page.getByRole('button', { name: 'Owner is here: Blue metal bottle' }).click()
  await expect(page.getByRole('tab', { name: 'Desk' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Someone is collecting this' })).toBeVisible()
  await expect(page.getByLabel('Drop or pickup code')).toHaveValue('HMX-3PT')
})

test('chats keep their place: the open chat is in the URL and Back returns to the list', async ({ page }) => {
  await session(page)
  await page.route('**/api/rsa/conversations', route => route.fulfill({ json: [{ id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Closed', lastMessage: null, lastAt: '2026-10-26T10:00:00Z', messages: 1 }] }))
  await page.route('**/api/rsa/conversations/chat', route => route.fulfill({ json: { id: 'chat', itemTitle: 'Casio watch', lostName: 'Maryam', foundName: 'Omar', status: 'Closed', messages: [
    { id: 1, kind: 'handover', from: 'lost', text: '', at: '2026-10-26T09:05:00Z', handoverAt: '2026-10-27T14:30', handoverPlace: 'Library entrance', handoverStatus: 'replaced' },
  ] } }))
  await page.goto('/rsa')
  await page.getByRole('tab', { name: 'Chats' }).click()
  await expect(page.getByText('1 message', { exact: true })).toBeVisible()
  await expect(page.getByText(/Ended/)).toBeVisible()
  await page.getByRole('button', { name: /Casio watch/ }).click()
  await expect(page).toHaveURL(/tab=chats&chat=chat/)
  await expect(page.getByText(/Handover: .*2:30 PM · Library entrance \(replaced by a newer time\)/)).toBeVisible()
  await expect(page.getByText(/1:05 PM/)).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/rsa\?tab=chats$/)
  await expect(page.getByRole('button', { name: /Casio watch/ })).toBeVisible()
})

test('team changes are confirmed and reported', async ({ page }) => {
  await session(page)
  let team = [{ email: 'rsa@gutech.edu.om', addedAt: '2026-10-26T08:00:00Z' }, { email: 'a.very.long.colleague.address.indeed@gutech.edu.om', addedAt: '2026-10-26T08:00:00Z' }]
  const posted: string[] = []
  await page.route('**/api/rsa/team', route => {
    if (route.request().method() === 'POST') {
      const email = route.request().postDataJSON().email
      posted.push(email)
      team = [...team, { email, addedAt: '2026-10-27T08:00:00Z' }]
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ json: team })
  })
  await page.goto('/rsa?tab=team')
  const remove = page.getByRole('button', { name: 'Remove a.very.long.colleague.address.indeed@gutech.edu.om' })
  await expect(remove).toBeVisible()
  // "Remove" stays on one line next to a long address.
  expect((await remove.boundingBox())!.height).toBeLessThan(50)
  await page.getByLabel('Colleague’s email').fill('RSA@gutech.edu.om')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already on the team')
  await page.getByLabel('Colleague’s email').fill('salim@gutech.edu.om')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('read every chat')
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toContainText('salim@gutech.edu.om')
  expect(posted).toEqual(['salim@gutech.edu.om'])
})

test('at a desk PC the pickup puts the owner and the item side by side, with the buttons in view', async ({ page }) => {
  await session(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.route('**/api/rsa/desk/*', route => route.fulfill({ json: { type: 'pickup', item: { ...item, state: 'claimed', receivedAt: '2026-10-26T08:30:00Z', title: 'Averyveryveryveryveryveryveryveryverylongwordwithoutanybreaksatall' }, claim } }))
  await page.goto('/rsa')
  await expect(page.getByLabel('Drop or pickup code')).toBeFocused()
  await page.getByLabel('Drop or pickup code').fill('HMX-3PT')
  await page.keyboard.press('Enter')
  const owner = await page.getByText('OWNER', { exact: true }).boundingBox()
  const shelf = await page.getByText(/ON THE SHELF SINCE/).boundingBox()
  expect(shelf!.x).toBeGreaterThan(owner!.x + 300)
  const button = await page.getByRole('button', { name: 'Hand it over' }).boundingBox()
  await page.screenshot({ path: 'test-results/rsa-pickup-desk.png' })
  expect(button!.y + button!.height).toBeLessThan(800)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  // Arrow keys move between tabs.
  await page.getByRole('tab', { name: 'Desk' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Shelf' })).toBeFocused()
  await expect(page.getByRole('tab', { name: 'Shelf' })).toHaveAttribute('aria-selected', 'true')
})

const focusIsOnBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null)

test('after a Found-tab match or hand-over the keyboard stays on the list, not the page body', async ({ page }) => {
  await session(page)
  const items = [
    { ...item, id: 'kept', code: null, title: 'Silver ring', state: 'finder', suggestedTo: [] as string[] },
    { ...item, id: 'shelf', code: 'ACD-EFG', title: 'Black umbrella', state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
  ]
  await page.route('**/api/rsa/found', route => route.fulfill({ json: items }))
  await page.route('**/api/rsa/person*', route => route.fulfill({ json: { email: 'maryam@gutech.edu.om', hasAccount: true, name: 'Maryam' } }))
  await page.route('**/api/rsa/found/kept/match', route => {
    items[0] = { ...items[0], suggestedTo: ['maryam@gutech.edu.om'] }
    return route.fulfill({ json: { handedOver: false, title: 'Silver ring' } })
  })
  await page.route('**/api/rsa/found/shelf/match', route => {
    // Handed over: it leaves the "Open" list when the list reloads.
    items[1] = { ...items[1], state: 'collected' }
    return route.fulfill({ json: { handedOver: true, title: 'Black umbrella' } })
  })
  await page.goto('/rsa?tab=found')

  // A plain send: the card stays, so focus is back on its button.
  const ring = page.getByRole('button', { name: 'Match to someone: Silver ring' })
  await ring.focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('Their GUtech email').fill('maryam@gutech.edu.om')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Send them the match' }).press('Enter')
  await expect(page.getByText('Already sent to: maryam@gutech.edu.om')).toBeVisible()
  await expect(ring).toBeFocused()
  await expect(ring).toHaveText('Match to someone else')

  // A hand-over: the card leaves the list, so focus goes to the count line above it.
  await page.getByRole('button', { name: 'Match to someone: Black umbrella' }).press('Enter')
  await page.getByLabel('Their GUtech email').fill('maryam@gutech.edu.om')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Hand it over' }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Black umbrella' })).toHaveCount(0)
  await expect(page.getByText('1 item', { exact: true })).toBeFocused()
  expect(await focusIsOnBody(page)).toBe(false)
  // Tab carries on from the list, not from the top of the page.
  await page.keyboard.press('Tab')
  await expect(ring).toBeFocused()
})

test.describe('on a touch tablet', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('opening another match form right after a send is not pulled back to the first card', async ({ page }) => {
    await session(page)
    const items = [
      { ...item, id: 'kept', code: null, title: 'Silver ring', state: 'finder', suggestedTo: [] as string[] },
      { ...item, id: 'shelf', code: 'ACD-EFG', title: 'Black umbrella', state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
    ]
    await page.route('**/api/rsa/found', route => route.fulfill({ json: items }))
    await page.route('**/api/rsa/person*', route => route.fulfill({ json: { email: 'maryam@gutech.edu.om', hasAccount: true, name: 'Maryam' } }))
    await page.route('**/api/rsa/found/kept/match', route => {
      items[0] = { ...items[0], suggestedTo: ['maryam@gutech.edu.om'] }
      return route.fulfill({ json: { handedOver: false, title: 'Silver ring' } })
    })
    await page.goto('/rsa?tab=found')
    const ring = page.getByRole('button', { name: 'Match to someone: Silver ring' })
    await ring.tap()
    await page.getByLabel('Their GUtech email').fill('maryam@gutech.edu.om')
    await page.getByLabel('Their GUtech email').press('Enter')
    await page.getByRole('dialog').getByRole('button', { name: 'Send them the match' }).tap()
    await expect(page.getByText('Already sent to: maryam@gutech.edu.om')).toBeVisible()

    // Straight on to the next card: its button is replaced by the form, and focus must not jump back to the ring.
    await page.getByRole('button', { name: 'Match to someone: Black umbrella' }).tap()
    await expect(page.getByLabel('Their GUtech email')).toBeVisible()
    await page.waitForTimeout(400)
    await expect(ring).not.toBeFocused()
    await expect(page.getByText('2 items', { exact: true })).not.toBeFocused()
  })
})

test('after closing a shelf item the keyboard lands on the line that says what was closed', async ({ page }) => {
  await session(page)
  let closes = 0
  const shelf = [
    { ...item, id: 'held', title: 'Lab coat', state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
    { ...item, id: 'other', title: 'Grey hoodie', state: 'held', receivedAt: '2026-10-26T08:30:00Z' },
  ]
  await page.route('**/api/rsa/items', route => route.fulfill({ json: shelf.filter(i => closes === 0 || i.id !== 'held') }))
  await page.route('**/api/rsa/items/held/close', route => { closes++; return route.fulfill({ status: 204 }) })
  await page.goto('/rsa?tab=shelf')
  await page.getByRole('button', { name: 'Give away or close: Lab coat' }).press('Enter')
  await page.getByRole('dialog').getByRole('button', { name: 'Give away / close' }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Lab coat' })).toHaveCount(0)
  const done = page.getByRole('status').filter({ hasText: 'Closed' })
  await expect(done).toContainText('Lab coat')
  await expect.poll(() => done.evaluate(el => el.parentElement!.contains(document.activeElement))).toBe(true)
  expect(await focusIsOnBody(page)).toBe(false)
})

test('closing a photo puts focus back on the photo that opened it', async ({ page }) => {
  await session(page)
  const card = { ...item, title: 'Blue student card', isSensitive: true, photoIds: ['covered-photo'] }
  await page.route('**/api/rsa/desk/*', route => route.fulfill({ json: { type: 'drop', item: card, claim: null } }))
  await page.route('**/api/photos/**', route => route.fulfill({ status: 404 }))
  await page.goto('/rsa')
  await page.getByLabel('Drop or pickup code').fill('K7P-4QM')
  await page.keyboard.press('Enter')
  const open = page.getByRole('button', { name: 'Open photo 1 of Blue student card' })

  await open.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(open).toBeFocused()

  await open.press('Enter')
  await page.getByRole('button', { name: 'Close photo' }).press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(open).toBeFocused()
})
