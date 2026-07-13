import { defineConfig, devices } from "@playwright/test";

const remoteBaseURL = process.env.PLAYWRIGHT_TEST_BASE_URL?.replace(/\/$/, "") || undefined;
const localBaseURL = "http://127.0.0.1:4321";

export default defineConfig({
  testDir: "./tests",
  webServer: remoteBaseURL
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1",
        url: localBaseURL,
        reuseExistingServer: true
      },
  use: {
    baseURL: remoteBaseURL ?? localBaseURL,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] }
    },
    {
      name: "tablet",
      use: { viewport: { width: 768, height: 1024 } }
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 960 } }
    }
  ]
});
