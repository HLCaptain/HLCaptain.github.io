import rss from "@astrojs/rss";
import { getPublishedArticles } from "@lib/content";
import { siteConfig } from "../site.config";

export async function GET(context: { site?: URL }) {
  const articles = await getPublishedArticles();

  return rss({
    title: siteConfig.title,
    description: siteConfig.description,
    site: context.site ?? siteConfig.url,
    items: articles.map((article) => ({
      title: article.data.title,
      description: article.data.description,
      pubDate: article.data.publishedAt,
      link: `/articles/${article.id}/`,
      categories: article.data.tags
    })),
    customData: "<language>en-us</language>"
  });
}
