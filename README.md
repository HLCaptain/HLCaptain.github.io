# HLCaptain Site

Static Astro portfolio and Markdown blog, deployed to GitHub Pages with Cloudflare Pages PR previews.

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

## GitHub Pages production

The production workflow targets the profile-root repository `HLCaptain/HLCaptain.github.io` and deploys `main` with GitHub Actions.

GitHub Pages must be enabled with **GitHub Actions** as its source. Private repositories require a GitHub Pro, Team, or Enterprise plan for Pages.

## Cloudflare Pages previews

The PR workflow uses the `cloudflare-preview` GitHub environment and a Direct Upload Pages project named `hlcaptain-site`. It does not deploy `main`.

Create the Pages project once, then add these environment secrets:

- `CLOUDFLARE_API_TOKEN` with Pages deployment permission
- `CLOUDFLARE_ACCOUNT_ID`

Optionally set the `CLOUDFLARE_PAGES_PROJECT` environment variable to override the default project name. Without the secrets, validation and local UI tests still run, but the external preview is skipped.

Cloudflare preview URLs are public by default; use a Cloudflare Access policy if these previews must remain private.

For local Wrangler Pages emulation:

```sh
npm run build
npm exec -- wrangler pages dev dist
```

The site is static and does not require a Cloudflare adapter.

## Cloudflare Pages dashboard settings

Connect the GitHub repository in Cloudflare Pages with:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Optional environment variable: `SITE_URL=https://your-domain.example`
