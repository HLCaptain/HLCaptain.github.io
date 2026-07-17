# Content authoring

Articles and projects are local Markdown files. Keep each entry and its images in one folder so the
text and thumbnail can be edited or replaced together:

```text
src/content/articles/my-article/
├── index.md
└── thumbnail.webp

src/content/projects/my-project/
├── index.mdx
└── thumbnail.webp
```

The folder name becomes the URL: the examples above build to `/articles/my-article/` and
`/work/my-project/`. Use `.md` for standard Markdown and `.mdx` only when the body imports a
component. A thumbnail is optional. Without one, cards use their semantic icon.
Prefer a 16:9 WebP, JPEG, PNG, AVIF, GIF, TIFF, or SVG because card thumbnails are cropped to 16:9.

## Article template

Create `src/content/articles/<slug>/index.md`, put `thumbnail.webp` beside it, and start with:

```md
---
title: "Article title"
description: "One sentence describing what the reader will learn."
publishedAt: YYYY-MM-DD
tags: ["topic", "technology"]
draft: true
featured: false
thumbnail: "./thumbnail.webp"
readingTime: "5 min"
---

## Overview

Write the article here.

## Key decision

Continue with normal Markdown.
```

Remove `thumbnail` if the article has no preview image. Set `draft: false` when it is ready to
publish.

## Project template

Copy [project-summary-template.mdx](./project-summary-template.mdx) to
`src/content/projects/<slug>/index.mdx`, put `thumbnail.webp` beside it, and replace the placeholder
content. Set `draft: false` when it is ready to publish. The
[project summary guide](./project-summaries.md) covers structure and editorial rules.

## Images in the body

Markdown and MDX can use other colocated images without an import:

```md
![Describe what the image shows.](./diagram.webp)
```

Thumbnail images are decorative in cards because the same link already contains the entry title and
description. Body images must have useful alt text; use `![](...)` only when an image is purely
decorative.

## Frontmatter fields

| Field | Applies to | Required | Notes |
| --- | --- | --- | --- |
| `title` | both | yes | Display title. |
| `description` | both | yes | Used in cards, detail headers, and article RSS entries. |
| `publishedAt` | both | yes | `YYYY-MM-DD`; controls newest-first ordering. |
| `updatedAt` | both | no | `YYYY-MM-DD`; shown on the detail page. |
| `tags` | both | no | String list; defaults to `[]`. |
| `draft` | both | no | Defaults to `false`; drafts are excluded from pages and RSS. |
| `featured` | both | no | Defaults to `false`; featured entries can appear on the home page. |
| `thumbnail` | both | no | Relative path to an image beside the entry. |
| `readingTime` | articles | no | Display text such as `"5 min"`. |
| `status` | projects | no | `active`, `shipped`, or `exploratory`; defaults to `active`. |
| `links` | projects | no | List of `{ label, href }` links; defaults to `[]`. |
| `accent` | both | no | Reserved by the schema but not currently rendered. |

## Custom content components

Plain `.md` files cannot import components. In `.mdx`, the complete supported site component list is:

### `ProjectFacts`

A responsive project-facts grid. Import it immediately after the frontmatter:

```mdx
import ProjectFacts from "@components/content/ProjectFacts.astro";

<ProjectFacts
  items={[
    { label: "Role", value: "Creator and maintainer" },
    { label: "Status", value: "Shipped" },
    { label: "Stack", value: "Astro · TypeScript" }
  ]}
/>
```

There are no custom Markdown directives or other supported content components. Standard headings
automatically receive copy-link controls, fenced code blocks receive syntax highlighting, and native
`<video>` elements receive the site prose styling.

## Check before publishing

```sh
npm run check
npm run build
```
