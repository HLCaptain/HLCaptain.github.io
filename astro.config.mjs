import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";

const site = process.env.SITE_URL ?? "https://hlcaptain.github.io";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  integrations: [mdx(), icon(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "github-dark-dimmed",
      wrap: true
    }
  }
});
