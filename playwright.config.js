const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 45000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
});
