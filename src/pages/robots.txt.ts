import { siteConfig } from "../site.config";

export function GET() {
  const sitemap = new URL("sitemap-index.xml", siteConfig.url).toString();

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
