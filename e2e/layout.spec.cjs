const { test, expect } = require('@playwright/test');
test('modern dark pages fit desktop and mobile viewports', async ({ page }, info) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.screenshot({ path: info.outputPath('login-desktop.png') });
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('browser-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const id = await page.evaluate(async () => {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('nib_token')}` };
    const response = await fetch('/api/cases', { method: 'POST', headers, body: JSON.stringify({ title: 'Suspicious activity on the mail gateway', severity: 'High', attack_type: 'Information Leak', origin_country: 'Unknown', summary: 'Review unusual traffic and document the investigation.' }) });
    const incident = await response.json();
    if (!response.ok) throw new Error('Fixture creation failed');
    await fetch(`/api/cases/${incident.id}`, { method: 'PATCH', headers, body: JSON.stringify({ due_at: new Date(Date.now() + 3600000).toISOString() }) });
    return incident.id;
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of ['/', '/cases', `/cases/${id}`, '/incidents/new', '/playbooks', '/sla', '/users', '/profile', '/iocs', '/archive', '/chat']) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main').getByRole('status')).toHaveCount(0);
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
      if (route === `/cases/${id}` && width === 390) {
        const title = page.getByRole('heading', { name: 'Suspicious activity on the mail gateway', exact: true });
        expect((await title.boundingBox()).width).toBeGreaterThan(250);
      }
      await expect.poll(() => page.locator('main').evaluate(el => el.scrollWidth - el.clientWidth), { message: `Horizontal overflow: ${route} at ${width}px` }).toBeLessThanOrEqual(1);
      if (['/', `/cases/${id}`].includes(route)) await page.screenshot({ path: info.outputPath(`${route === '/' ? 'dashboard' : 'case'}-${width}.png`) });
    }
  }
  expect(errors).toEqual([]);
});
