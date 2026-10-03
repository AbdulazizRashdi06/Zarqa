import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// WCAG 2.1 AA scan of the screens anyone can open. Signed-in screens were scanned in the QA run (2026-10-03).
for (const path of ['/signin', '/terms', '/privacy', '/help', '/tips']) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.route('**/api/me', (route) => route.fulfill({ status: 401, json: {} }))
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
