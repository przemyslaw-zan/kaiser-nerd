import { expect, test } from '@playwright/test'

test('loads selected event from query parameter', async ({ page }) => {
  await page.goto('/?event=poland_events.6')
  await expect(page.getByTestId('event-detail')).toContainText('poland_events.6')
})

test('updates URL when selecting an event', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /The Emergency Session/ }).click()
  await expect(page).toHaveURL(/event=poland_events\.5/)
})

test('filters list with fuzzy search', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Search events').fill('aftermath')
  await expect(page.getByTestId('event-list')).toContainText('Aftermath')
})
