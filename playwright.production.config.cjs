const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: '**/production.spec.cjs', workers: 1,
  use: { baseURL: 'http://127.0.0.1:4015', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node e2e/server.cjs', env: { NIB_E2E_PRODUCTION: 'true' }, url: 'http://127.0.0.1:4015/api/ready', reuseExistingServer: false },
});
