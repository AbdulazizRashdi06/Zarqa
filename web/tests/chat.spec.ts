import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

// The chat screen against a small in-memory chat server: sending, polling, a failed send with retry,
// handover and return tickets, and the closed state. Polls run every 4s, so some waits are long.

type Msg = {
  id: number
  kind: 'text' | 'system' | 'handover' | 'return'
  mine: boolean
  text: string
  at: string
  handoverAt: string | null
  handoverPlace: string | null
  handoverStatus: 'suggested' | 'confirmed' | 'replaced' | null
  canConfirm: boolean
}

const me = { id: 'me', email: 'maryam@gutech.edu.om', firstName: 'Maryam', isAdmin: false, isRsa: false, matchAlerts: true, showFirstName: true }
const POLL = { timeout: 12_000 }

function tomorrow() {
  const d = new Date(Date.now() + 36 * 3600_000)
  return d.toISOString().slice(0, 10)
}

class FakeChat {
  status: 'Active' | 'Returned' | 'Closed' = 'Active'
  messages: Msg[] = []
  next = 100
  posts = 0
  reads: number[] = []
  /** Set to make the next sends fail (status) or hang (ms). */
  failSends = 0
  sendDelay = 0
  gone = false

  constructor() {
    this.add({ kind: 'system', mine: false, text: 'You two matched. Ask a question only the owner would know.' })
    this.add({ kind: 'text', mine: false, text: 'Hi! I think I found your AirPods case.' })
  }

  add(m: Partial<Msg>): Msg {
    const msg: Msg = { id: this.next++, kind: 'text', mine: false, text: '', at: new Date().toISOString(), handoverAt: null, handoverPlace: null, handoverStatus: null, canConfirm: false, ...m }
    this.messages.push(msg)
    return msg
  }

  thread(after: number | null) {
    const messages = this.messages.filter((m) => after === null || m.id > after || m.kind === 'handover' || m.kind === 'return')
    return { id: 'c1', otherName: 'Omar', otherAvatarUrl: null, itemTitle: 'AirPods Pro case', myRole: 'lost', status: this.status, messages, matchId: 'm1', myReportId: 'r1' }
  }

  async install(page: Page) {
    await page.route('**/api/me', (r) => r.fulfill({ json: me }))
    await page.route('**/api/home', (r) => r.fulfill({ json: { active: 1, matchesWaiting: 0, unreadChats: 0, postsLeft: 3 } }))
    await page.route('**/api/conversations/c1**', (r) => this.conversation(r))
    await page.route('**/api/handovers/*/confirm', (r) => this.ticket(r, 'confirmed'))
    await page.route('**/api/returns/*/confirm', (r) => {
      this.status = 'Returned'
      this.add({ kind: 'system', text: 'Returned. Back where it belongs. Thank you both!' })
      return this.ticket(r, 'confirmed')
    })
    await page.route('**/api/returns/*/decline', (r) => this.ticket(r, 'replaced'))
  }

  private ticket(route: Route, status: 'confirmed' | 'replaced') {
    const id = Number(route.request().url().split('/').at(-2))
    const m = this.messages.find((x) => x.id === id)!
    m.handoverStatus = status
    m.canConfirm = false
    return route.fulfill({ json: m })
  }

  private async conversation(route: Route) {
    if (this.gone) return route.fulfill({ status: 404, json: { error: 'Not found.' } })
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (method === 'GET' && url.pathname === '/api/conversations/c1') {
      const after = url.searchParams.get('after')
      return route.fulfill({ json: this.thread(after === null ? null : Number(after)) })
    }
    if (url.pathname.endsWith('/read')) {
      this.reads.push(route.request().postDataJSON().lastMessageId)
      return route.fulfill({ status: 204 })
    }
    if (url.pathname.endsWith('/messages')) {
      this.posts++
      if (this.sendDelay) await new Promise((r) => setTimeout(r, this.sendDelay))
      if (this.failSends > 0) {
        this.failSends--
        return route.fulfill({ status: 500, json: { error: 'Something went wrong. Try again.' } })
      }
      return route.fulfill({ json: this.add({ mine: true, text: route.request().postDataJSON().text }) })
    }
    if (url.pathname.endsWith('/handover')) {
      const { date, time, place } = route.request().postDataJSON()
      return route.fulfill({ json: this.add({ kind: 'handover', mine: true, handoverAt: `${date}T${time}`, handoverPlace: place, handoverStatus: 'suggested' }) })
    }
    if (url.pathname.endsWith('/returned')) {
      return route.fulfill({ json: this.add({ kind: 'return', mine: true, text: 'I got it back. Can you confirm?', handoverStatus: 'suggested' }) })
    }
    if (url.pathname.endsWith('/not-it')) {
      this.status = 'Closed'
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 404 })
  }
}

const log = (page: Page) => page.getByRole('log', { name: 'Messages' })

test('sends a message, keeps a reply that raced it, and marks what it showed as read', async ({ page }) => {
  const chat = new FakeChat()
  await chat.install(page)
  await page.goto('/chats/c1')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Omar')
  await expect(log(page).getByText('Hi! I think I found your AirPods case.')).toBeVisible()
  // Each message says who wrote it.
  await expect(log(page).getByRole('group', { name: /^Omar, / })).toHaveCount(1)

  // Omar's reply lands just before my send; it must still show up.
  const box = page.getByRole('textbox', { name: 'Message' })
  await box.fill('Yes! Is there a cat sticker on the back?')
  chat.add({ text: 'I am at the library entrance, blue shirt' })
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  await expect(log(page).getByRole('group', { name: /^You, / })).toContainText('cat sticker')
  await expect(log(page).getByText('I am at the library entrance, blue shirt')).toBeVisible(POLL)
  expect(chat.posts).toBe(1)
  await expect.poll(() => Math.max(...chat.reads), POLL).toBeGreaterThanOrEqual(chat.messages.at(-1)!.id)
  // Each message shows once.
  await expect(log(page).getByText('cat sticker')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/chat-phone.png' })
})

test('a slow send posts once; a failed send says so, keeps the text and can be retried', async ({ page }) => {
  const chat = new FakeChat()
  await chat.install(page)
  await page.goto('/chats/c1')
  const box = page.getByRole('textbox', { name: 'Message' })
  const send = page.getByRole('button', { name: 'Send' })

  chat.sendDelay = 1500
  await box.fill('I am at the library now')
  await send.click()
  await expect(send).toBeDisabled()
  await box.press('Enter')
  await box.press('Enter')
  await expect(log(page).getByText('I am at the library now')).toHaveCount(1)
  expect(chat.posts).toBe(1)

  chat.sendDelay = 0
  chat.failSends = 1
  await box.fill('See you at 2')
  await send.click()
  await expect(page.getByRole('alert')).toContainText('Something went wrong')
  await expect(box).toHaveValue('See you at 2')
  await send.click()
  await expect(log(page).getByText('See you at 2')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(box).toHaveValue('')
})

test('handover tickets update when the other person acts on them', async ({ page }) => {
  const chat = new FakeChat()
  const day = tomorrow()
  const theirs = chat.add({ kind: 'handover', handoverAt: `${day}T14:30`, handoverPlace: 'Library entrance', handoverStatus: 'suggested', canConfirm: true })
  await chat.install(page)
  await page.goto('/chats/c1')

  // Their suggestion: I confirm it once, even with two quick taps.
  const confirm = log(page).getByRole('button', { name: 'Confirm' })
  await confirm.click()
  await expect(log(page).getByText('Confirmed. See you there.')).toBeVisible()
  expect(chat.messages.find((m) => m.id === theirs.id)!.handoverStatus).toBe('confirmed')

  // My own suggestion, confirmed later by Omar: the open chat picks that up from a poll.
  await page.getByRole('button', { name: '+ Suggest a time' }).click()
  await expect(page.getByLabel('Time')).toBeFocused()
  await page.getByLabel('Day').fill(day)
  await page.getByLabel('Time').fill('16:00')
  await page.getByLabel('Where').fill('Cafeteria')
  await page.screenshot({ path: 'test-results/chat-plan.png' })
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log(page).getByText('Waiting for Omar to confirm.')).toBeVisible()
  const mine = chat.messages.at(-1)!
  mine.handoverStatus = 'confirmed'
  theirs.handoverStatus = 'replaced'
  await expect(log(page).getByText('Waiting for Omar to confirm.')).toHaveCount(0, POLL)
  await expect(log(page).getByText('Confirmed. See you there.')).toHaveCount(1)
  await expect(log(page).getByText('Library entrance')).toHaveCount(0)
})

test('a slow poll sent before a confirm does not bring the old buttons back', async ({ page }) => {
  const chat = new FakeChat()
  chat.add({ kind: 'handover', handoverAt: `${tomorrow()}T14:30`, handoverPlace: 'Library entrance', handoverStatus: 'suggested', canConfirm: true })
  await chat.install(page)
  // Hold the next poll: the server answers with what it had when the poll arrived (still "suggested").
  let hold = true
  let caught: () => void = () => {}
  const inFlight = new Promise<void>((r) => (caught = r))
  let release: () => void = () => {}
  const released = new Promise<void>((r) => (release = r))
  await page.route((u) => u.pathname === '/api/conversations/c1' && u.searchParams.has('after'), async (r) => {
    if (!hold) return r.fallback()
    hold = false
    const snapshot = JSON.parse(JSON.stringify(chat.thread(Number(new URL(r.request().url()).searchParams.get('after')))))
    caught()
    await released
    return r.fulfill({ json: snapshot })
  })
  await page.goto('/chats/c1')
  const confirm = log(page).getByRole('button', { name: 'Confirm' })
  await expect(confirm).toBeVisible()
  await inFlight

  await confirm.click()
  await expect(log(page).getByText('Confirmed. See you there.')).toBeVisible()
  release()
  // Sample, not retry: a later poll would hide a stale overwrite again.
  const seen: number[] = []
  for (let i = 0; i < 15; i++) {
    seen.push(await log(page).getByRole('button', { name: 'Confirm' }).count())
    await page.waitForTimeout(50)
  }
  expect(seen.every((n) => n === 0)).toBe(true)
  await expect(log(page).getByText('Confirmed. See you there.')).toBeVisible()
  // Polling carries on with fresh data afterwards.
  chat.add({ text: 'See you tomorrow!' })
  await expect(log(page).getByText('See you tomorrow!')).toBeVisible(POLL)
  await expect(log(page).getByRole('button', { name: 'Confirm' })).toHaveCount(0)
})

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('the return and not-it actions come back after the handover form replaced a focused message box', async ({ page }) => {
    const chat = new FakeChat()
    await chat.install(page)
    await page.goto('/chats/c1')
    const ask = page.getByRole('button', { name: 'I got it back' })
    const notIt = page.getByRole('button', { name: 'Not the same item after all?' })
    await expect(ask).toBeVisible()

    // The keyboard is up: the rows above the box make room.
    await page.getByRole('textbox', { name: 'Message' }).tap()
    await expect(ask).toHaveCount(0)
    await expect(notIt).toHaveCount(0)
    // The chip keeps focus in the box, so the box is still focused when the form replaces it.
    await page.getByRole('button', { name: '+ Suggest a time' }).tap()
    await page.getByRole('button', { name: 'Cancel' }).tap()
    await expect(ask).toBeVisible()
    await expect(notIt).toBeVisible()
  })
})

test('a return ask confirmed here celebrates once, then the chat is read-only', async ({ page }) => {
  const chat = new FakeChat()
  chat.add({ kind: 'return', text: 'I handed it over. Did you get it back?', handoverStatus: 'suggested', canConfirm: true })
  await chat.install(page)
  await page.goto('/chats/c1')

  await log(page).getByRole('button', { name: "Yes, it's back" }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'RETURNED.' })).toBeFocused()
  await dialog.getByRole('button', { name: 'See the chat' }).click()
  await expect(dialog).toHaveCount(0)
  // A later poll sees Returned too, and must not bring the celebration back.
  await page.waitForTimeout(5000)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByText('Returned. This chat is closed.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'My reports' })).toBeVisible()
})

test('the other side sees the celebration when their ask is confirmed', async ({ page }) => {
  const chat = new FakeChat()
  await chat.install(page)
  await page.goto('/chats/c1')
  await page.getByRole('button', { name: 'I got it back' }).click()
  await expect(log(page).getByText('Waiting for Omar to confirm.')).toBeVisible()

  const ask = chat.messages.at(-1)!
  ask.handoverStatus = 'confirmed'
  chat.status = 'Returned'
  chat.add({ kind: 'system', text: 'Returned. Back where it belongs. Thank you both!' })
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'RETURNED.' })).toBeVisible(POLL)
  await expect(log(page).getByText("Both confirmed. It's back.")).toBeAttached()
  // On a short screen Zarqa's head stays on screen.
  await page.setViewportSize({ width: 320, height: 568 })
  await page.waitForTimeout(700)
  const top = await page.getByRole('dialog').getByRole('img').boundingBox()
  expect(top!.y).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: 'test-results/chat-returned-320.png' })
})

test('closing as not the same item asks first, then leaves the chat', async ({ page }) => {
  const chat = new FakeChat()
  await chat.install(page)
  await page.route('**/api/conversations', (r) => r.fulfill({ json: [] }))
  await page.goto('/chats/c1')
  await page.getByRole('button', { name: 'Not the same item after all?' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText("It can't be reopened")
  await sheet.getByRole('button', { name: 'Keep chatting' }).click()
  expect(chat.status).toBe('Active')
  await page.getByRole('button', { name: 'Not the same item after all?' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Close the chat' }).click()
  await expect(page).toHaveURL(/\/chats$/)
  expect(chat.status).toBe('Closed')
})

test('a closed chat is read-only and a missing one explains itself', async ({ page }) => {
  const chat = new FakeChat()
  chat.status = 'Closed'
  await chat.install(page)
  await page.goto('/chats/c1')
  await expect(page.getByText('Not the same item. This chat is closed.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'I got it back' })).toHaveCount(0)

  chat.gone = true
  await page.reload()
  await expect(page.getByText('This chat is gone.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'My reports' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

test('a failed load offers Try again', async ({ page }) => {
  const chat = new FakeChat()
  await chat.install(page)
  let fail = true
  await page.route('**/api/conversations/c1', (r) => (fail ? r.fulfill({ status: 500, json: { error: 'Something went wrong. Try again.' } }) : r.fallback()))
  await page.goto('/chats/c1')
  await page.getByRole('button', { name: 'Try again' }).click({ trial: true })
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(log(page).getByText('Hi! I think I found your AirPods case.')).toBeVisible()
})

test('the chat and the chats list have no serious accessibility violations', async ({ page }) => {
  const chat = new FakeChat()
  chat.add({ kind: 'handover', handoverAt: `${tomorrow()}T14:30`, handoverPlace: 'Library entrance', handoverStatus: 'suggested', canConfirm: true })
  await chat.install(page)
  await page.route('**/api/conversations', (r) =>
    r.fulfill({
      json: [
        { id: 'c1', otherName: 'Omar', otherAvatarUrl: null, itemTitle: 'AirPods Pro case', myRole: 'lost', status: 'Active', lastMessage: 'Hi!', lastAt: new Date().toISOString(), unread: 1 },
        { id: 'c2', otherName: 'Noor', otherAvatarUrl: null, itemTitle: 'Blue bottle', myRole: 'found', status: 'Closed', lastMessage: 'Not the same item after all.', lastAt: '2026-10-20T10:00:00Z', unread: 0 },
      ],
    }),
  )
  for (const path of ['/chats/c1', '/chats']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
})

test('the chats list says unread in words and shows a load error instead of "no chats"', async ({ page }) => {
  await page.route('**/api/me', (r) => r.fulfill({ json: me }))
  let fail = true
  await page.route('**/api/conversations', (r) =>
    fail
      ? r.fulfill({ status: 500, json: { error: 'Something went wrong. Try again.' } })
      : r.fulfill({
          json: [
            { id: 'c1', otherName: 'Omar', otherAvatarUrl: null, itemTitle: 'A very long item title that keeps going and going', myRole: 'lost', status: 'Active', lastMessage: 'Is there a sticker?', lastAt: new Date().toISOString(), unread: 2 },
          ],
        }),
  )
  await page.goto('/chats')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByText('No chats yet', { exact: false })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Try again' }).click()
  const row = page.getByRole('link', { name: /Omar/ })
  await expect(row).toContainText('2 unread')
  await expect(row.getByText('· YOU LOST')).toBeVisible()
})
