import { expect, test } from '@playwright/test'

test('loads selected event from query parameter', async ({ page }) => {
  await page.goto('/?event=poland_events.6')
  await expect(page.getByTestId('event-detail')).toContainText('poland_events.6')
})

test('updates URL when selecting an event', async ({ page }) => {
  await page.goto('/')
  // Wait for the event list to populate before interacting
  const firstButton = page.getByTestId('event-list').getByRole('button').first()
  await expect(firstButton).toBeVisible()
  await firstButton.click()
  await expect(page).toHaveURL(/event=/)
})

test('filters list with fuzzy search', async ({ page }) => {
  await page.goto('/')
  // Wait for the event list to populate before searching
  await expect(page.getByTestId('event-list').getByRole('button').first()).toBeVisible()
  await page.getByLabel('Search events').fill('ace pilot')
  await expect(page.getByTestId('event-list')).toContainText('Ace Pilot')
})
