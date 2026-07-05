import { getCollection, type CollectionEntry } from "astro:content";

const byPublishedDateDesc = (
  a: CollectionEntry<"articles"> | CollectionEntry<"projects">,
  b: CollectionEntry<"articles"> | CollectionEntry<"projects">
) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf();

export async function getPublishedArticles() {
  const entries = await getCollection("articles", ({ data }) => !data.draft);
  return entries.sort(byPublishedDateDesc);
}

export async function getPublishedProjects() {
  const entries = await getCollection("projects", ({ data }) => !data.draft);
  return entries.sort(byPublishedDateDesc);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

export function stripTrailingSlash(path: string) {
  if (path === "/") return path;
  return path.replace(/\/$/, "");
}
