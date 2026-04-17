import { expect, test } from '@playwright/test'

test('loads selected event from query parameter', async ({ page }) => {
  await page.goto('/?event=poland_events.6')
  await expect(page).toHaveURL(/event=poland_events\.6/)
  await expect(page.getByTestId('event-detail').locator('h2')).toBeVisible()
})

test('updates URL when selecting an event', async ({ page }) => {
  await page.goto('/')
  // Wait for the event list to populate before interacting
  const firstButton = page.getByTestId('event-list').getByRole('button').first()
  await expect(firstButton).toBeVisible()
  await firstButton.click()
  await expect(page).toHaveURL(/event=/)
})

test('browser back and forward keep selected event in sync with URL', async ({ page }) => {
  await page.goto('/')

  const buttons = page.getByTestId('event-list').getByRole('button')
  await expect(buttons.nth(1)).toBeVisible()

  const firstTitle = (await buttons.first().locator('strong').innerText()).trim()
  const secondTitle = (await buttons.nth(1).locator('strong').innerText()).trim()

  await buttons.first().click()
  await expect(page).toHaveURL(/event=/)
  await expect(page.getByTestId('event-detail').locator('h2')).toContainText(firstTitle)

  const firstUrl = page.url()
  const firstId = new URL(firstUrl).searchParams.get('event')
  expect(firstId).toBeTruthy()

  await buttons.nth(1).click()
  await expect(page).toHaveURL(/event=/)
  await expect(page.getByTestId('event-detail').locator('h2')).toContainText(secondTitle)

  const secondUrl = page.url()
  const secondId = new URL(secondUrl).searchParams.get('event')
  expect(secondId).toBeTruthy()
  expect(secondId).not.toBe(firstId)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`event=${firstId}`))
  await expect(page.getByTestId('event-detail').locator('h2')).toContainText(firstTitle)

  await page.goForward()
  await expect(page).toHaveURL(new RegExp(`event=${secondId}`))
  await expect(page.getByTestId('event-detail').locator('h2')).toContainText(secondTitle)
})

test('filters list with fuzzy search', async ({ page }) => {
  await page.goto('/')
  // Wait for the event list to populate before searching
  await expect(page.getByTestId('event-list').getByRole('button').first()).toBeVisible()
  await page.getByLabel('Search events and focuses').fill('ace pilot')
  await expect(page.getByTestId('event-list')).toContainText('Ace Pilot')
})
