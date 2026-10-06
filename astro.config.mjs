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
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed"
      },
      wrap: false,
      transformers: [{
        pre(node) {
          const title = this.options.meta?.__raw?.match(/\btitle="([^"]+)"/)?.[1];
          if (title) node.properties["data-title"] = title;
        }
      }]
    }
  }
});
