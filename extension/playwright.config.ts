import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Extensions need serial execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for extension tests
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Load the extension
        launchOptions: {
          args: [
            '--disable-extensions-except=./dist',
            '--load-extension=./dist'
          ]
        }
      }
    }
  ],
  // Build extension before running tests
  webServer: {
    command: 'npm run build',
    reuseExistingServer: !process.env.CI
  }
})
