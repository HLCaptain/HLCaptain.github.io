import { defineConfig } from "astro/config";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL ?? "https://hlcaptain-site.pages.dev";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  integrations: [icon(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-dark-dimmed",
      wrap: true
    }
  }
});
