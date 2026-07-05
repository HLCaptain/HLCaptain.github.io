import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  webServer: {
    command: "npm run preview -- --host localhost",
    url: "http://localhost:4321",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://localhost:4321",
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
