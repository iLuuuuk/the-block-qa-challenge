const { test, expect } = require('@playwright/test');
const { createAppServer } = require('../server/index.js');

// ─── Server lifecycle ─────────────────────────────────────────────────────────
let server;
let BASE_URL;

test.beforeAll(async () => {
  server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  BASE_URL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ─── Inventory ───────────────────────────────────────────────────────────────

test('inventory page loads and shows vehicles', async ({ page }) => {
  await page.goto(BASE_URL);

  // main title is visible
  await expect(page.locator('h1')).toContainText('OPENLANE');

  // exactly 3 vehicles listed
  const items = page.locator('ul#list li');
  await expect(items).toHaveCount(3);

  // each card has title, price and link to detail
  await expect(items.first().locator('h3')).toBeVisible();
  await expect(items.first().locator('a')).toBeVisible();
});

test('bodyStyle filter SUV shows only SUVs', async ({ page }) => {
  await page.goto(BASE_URL);

  // select SUV in the dropdown
  await page.selectOption('#bodyStyle', 'SUV');

  // only 1 vehicle should appear (the RAV4)
  const items = page.locator('ul#list li');
  await expect(items).toHaveCount(1);
  await expect(items.first().locator('h3')).toContainText('RAV4');
});

test('bug: lowercase search returns no results', async ({ page }) => {
  await page.goto(BASE_URL);

  // type in lowercase
  await page.fill('#search', 'toyota');

  // UI shows "No vehicles found" — documents the case-sensitive bug
  await expect(page.locator('#status')).toContainText('No vehicles found');
});

// ─── Detail and Bid ──────────────────────────────────────────────────────────

test('vehicle detail page shows vehicle info', async ({ page }) => {
  await page.goto(`${BASE_URL}/vehicle.html?id=v1`);

  // title loads with the vehicle name
  await expect(page.locator('#title')).toContainText('Toyota RAV4');

  // shows current price
  await expect(page.locator('#price')).toContainText('Current bid');

  // bid form is visible
  await expect(page.locator('#bidder')).toBeVisible();
  await expect(page.locator('#amount')).toBeVisible();
  await expect(page.locator('#placeBid')).toBeVisible();
});

test('valid bid from UI updates the price', async ({ page }) => {
  await page.goto(`${BASE_URL}/vehicle.html?id=v2`);

  // wait for current price to load
  await expect(page.locator('#price')).toContainText('Current bid');

  // fill the form with a high bid
  await page.fill('#bidder', 'Lucas E2E');
  await page.fill('#amount', '99000');

  // retry up to 5 times because of the random 503
  let success = false;
  for (let i = 0; i < 5; i++) {
    await page.click('#placeBid');
    const status = page.locator('#status');

    // wait for status to change to something (success or error)
    await expect(status).not.toHaveText('Submitting bid...', { timeout: 3000 }).catch(() => {});

    const text = await status.textContent();
    if (text?.includes('Bid accepted')) {
      success = true;
      break;
    }
    // if it was 503 or another error, retry
  }

  expect(success).toBe(true);

  // price updated in the UI
  await expect(page.locator('#price')).toContainText('99,000');
});

test('bid with amount lower than current shows error in UI', async ({ page }) => {
  await page.goto(`${BASE_URL}/vehicle.html?id=v3`);

  await expect(page.locator('#price')).toContainText('Current bid');

  await page.fill('#bidder', 'Lucas E2E');
  await page.fill('#amount', '1');

  // retry if 503 hits — the endpoint fails randomly 15% of the time
  let gotExpectedError = false;
  for (let i = 0; i < 8; i++) {
    await page.click('#placeBid');
    await expect(page.locator('#status')).not.toContainText('Submitting bid...', { timeout: 3000 }).catch(() => {});

    const text = await page.locator('#status').textContent();
    if (text?.includes('greater than current bid')) {
      gotExpectedError = true;
      break;
    }
    // if it was 503, retry
  }

  expect(gotExpectedError).toBe(true);
});
