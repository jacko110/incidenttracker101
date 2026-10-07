const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', testMatch: '**/*.spec.cjs', testIgnore: '**/production.spec.cjs', workers: 1, retries: 0,
  timeout: 30000,
  use: { timezoneId: 'UTC', baseURL: 'http://127.0.0.1:5175', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node e2e/server.cjs', url: 'http://127.0.0.1:4015/api/health', reuseExistingServer: false },
    { command: 'npm --prefix frontend run dev -- --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', env: { API_PROXY_TARGET: 'http://127.0.0.1:4015' }, reuseExistingServer: false },
  ],
});
