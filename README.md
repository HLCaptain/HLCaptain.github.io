# HLCaptain Site

Static Astro portfolio and Markdown/MDX blog, deployed to GitHub Pages with Cloudflare Pages PR previews.

## Commands

```sh
npm install
npm run dev
npm run check
npm run build
npm test
```

## Publishing Content

Add `.md` or `.mdx` files to:

- `src/content/articles/`
- `src/content/projects/`

Each file needs frontmatter matching `src/content.config.ts`. Published entries appear on the site unless `draft: true`; published articles also appear in `/rss.xml`.

Follow the [content authoring guide](docs/content-authoring.md) for copy-ready article and project templates, colocated thumbnails, supported Markdown/MDX features, and the complete custom component list. For portfolio copy, also use the [project summary authoring guide](docs/project-summaries.md).

## GitHub Pages production

The production workflow targets the profile-root repository `HLCaptain/HLCaptain.github.io` and is manual-only for now. Run it from the Actions tab when the site is ready; add a `push` trigger for `main` later if automatic production deploys are wanted.

GitHub Pages must be enabled with **GitHub Actions** as its source. Private repositories require a GitHub Pro, Team, or Enterprise plan for Pages.

## Cloudflare Pages previews

The PR workflow uses the `cloudflare-preview` GitHub environment and a Direct Upload Pages project named `hlcaptain-site`. It does not deploy `main`.

Create the Pages project once, then add this secret to the `cloudflare-preview` environment:

- `CLOUDFLARE_API_TOKEN` with Pages deployment permission

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT` are already configured as environment variables for this repository. Without the API token, validation and local UI tests still run, but the external preview is skipped.

Cloudflare preview URLs are public by default; use a Cloudflare Access policy if these previews must remain private.
When a PR is merged or closed, the cleanup workflow removes older deployments for that exact branch and retains only its newest preview, which Cloudflare does not allow deleting.

For local Wrangler Pages emulation:

```sh
npm run build
npm exec -- wrangler pages dev dist
```

The site is static and does not require a Cloudflare adapter.

The preview workflow uses Wrangler Direct Upload. Do not also connect this project to Cloudflare's Git integration; that is a separate deployment path. If you choose dashboard-managed Git integration instead, use `main` as the production branch, `npm run build` as the build command, and `dist` as the output directory.

Set `SITE_URL=https://your-domain.example` in the relevant deployment environment when a custom production domain is ready.
