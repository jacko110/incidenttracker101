const { test, expect } = require('@playwright/test');
async function login(page, username = 'analyst') {
  await page.goto('/login');
  await page.locator('form input').nth(0).fill(username);
  await page.locator('input[type=password]').fill('browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5175/');
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}
async function newCase(page, title) {
  return page.evaluate(async title => {
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('nib_token')}` }, body: JSON.stringify({ title }) });
    if (!response.ok) throw new Error('Fixture creation failed');
    return response.json();
  }, title);
}
test('Nib sign-in persists through refresh, protects admin pages and logs out', async ({ page }) => {
  await login(page);
  await expect(page).toHaveTitle('Nib Incident Tracking System');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.goto('/users');
  await expect(page).toHaveURL('http://127.0.0.1:5175/');
  await expect(page.getByRole('link', { name: 'User management' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test('incident wizard validates, uploads evidence, creates a case and preserves search on refresh', async ({ page }) => {
  await login(page);
  await page.goto('/incidents/new');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Please fill in all required fields.')).toBeVisible();
  await page.getByPlaceholder('Enter alert name here').fill('Browser evidence incident');
  for (const [placeholder, value] of [['Enter source IP addresses', '192.0.2.1'], ['Enter destination IP addresses', '192.0.2.2']]) {
    await page.getByPlaceholder(placeholder).fill(value);
    await page.getByPlaceholder(placeholder).press('Enter');
  }
  await page.locator('input[type=datetime-local]').fill('2026-09-28T12:00');
  for (const [index, value] of ['Mail Server', 'Unknown', 'Information Leak', 'High', 'Morning'].entries()) await page.locator('main select').nth(index).selectOption(value);
  await page.getByRole('button', { name: '403', exact: true }).click();
  await page.getByPlaceholder('Enter a brief summary of the incident here').fill('Browser workflow summary');
  await page.getByPlaceholder('Describe the impact of the incident here').fill('Test impact');
  await page.getByPlaceholder('Enter initial recommendations here').fill('Investigate');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('main select').nth(0).selectOption('Domain');
  await page.locator('main select').nth(1).selectOption('Internal Threat Feed');
  await page.getByPlaceholder('Enter IOC description here').fill('browser-evidence.invalid');
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('Nib browser evidence') });
  await expect(page.getByText('evidence.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add IOC', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Incident' }).click();
  await expect(page).toHaveURL(/\/cases\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Browser evidence incident' })).toBeVisible();
  const attachment = page.getByRole('link', { name: 'evidence.txt' });
  await expect(attachment).toBeVisible();
  const download = await page.request.get(await attachment.getAttribute('href'));
  expect(await download.text()).toBe('Nib browser evidence');
  await page.getByPlaceholder('Add a note...').fill('Browser investigation note');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Browser investigation note', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'In Progress', exact: true }).click();
  await expect(page.getByText('Status changed from "Attempt" to "In Progress"')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive case' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search cases', exact: true }).fill('Browser evidence');
  await page.getByRole('textbox', { name: 'Search cases', exact: true }).press('Enter');
  await expect(page).toHaveURL(/q=Browser%20evidence/);
  await page.reload();
  await expect(page.getByText('Browser evidence incident', { exact: true })).toBeVisible();
});
test('admin assigns a case and saves a deadline visible in due-soon workload', async ({ page }) => {
  await login(page, 'admin');
  const incident = await newCase(page, 'Browser deadline case');
  await page.goto(`/cases/${incident.id}`);
  await page.locator('main select').first().selectOption({ label: 'analyst (SOC_ANALYST)' });
  await expect(page.locator('main select').first()).toBeEnabled();
  await page.reload();
  await expect(page.locator('main select').first()).toHaveValue('1');
  const date = new Date(Date.now() + 12 * 3600000);
  // Browser context uses UTC in this suite.
  await page.getByLabel('Response deadline').fill(date.toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Save deadline' }).click();
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Due soon', exact: true }).click();
  await expect(page.getByText('Browser deadline case', { exact: true })).toBeVisible();
});
test('mobile navigation closes after selection and pages fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.locator('form input').nth(0).fill('analyst');
  await page.locator('input[type=password]').fill('browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5175/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'My cases', exact: true }).click();
  await expect(page).toHaveURL(/mine=1/);
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0);
  for (const route of ['/cases?mine=1', '/incidents/new']) {
    await page.goto(route);
    await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});
