# HLCaptain Site

Static Astro portfolio and Markdown blog, optimized for Cloudflare Pages.

## Commands

```sh
npm install
npm run dev
npm run check
npm run build
npm test
```

## Publishing Content

Add Markdown files to:

- `src/content/articles/`
- `src/content/projects/`

Each file needs frontmatter matching `src/content.config.ts`. Published entries appear on the site and in `/rss.xml` unless `draft: true`.

## Cloudflare Pages

Connect the GitHub repository in Cloudflare Pages with:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Optional environment variable: `SITE_URL=https://your-domain.example`

The site is static and does not require a Cloudflare adapter.
