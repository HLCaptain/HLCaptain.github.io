# Project summary authoring guide

Project pages should explain why the work matters and how it was built without reading like a
feature inventory. Aim for 350–700 words, four to six meaningful sections, and only claims that can
be verified from the project or its documentation.

## Recommended structure

1. **Frontmatter:** A concrete title, one-sentence description, publication date, focused tags,
   project status, and public links.
2. **Facts:** Role, status or release, core stack, and one project-specific fact.
3. **Overview:** What the project does, for whom, and the outcome it creates.
4. **Problem or product flow:** The friction being removed or the shortest useful walkthrough.
5. **Engineering decisions:** Two or three choices that shaped reliability, speed, privacy, or
   maintainability.
6. **Hard problem or tradeoff:** What required judgment, what could fail, and how the design limits
   that failure.
7. **Current state:** Clearly separate what is shipped from active work or future ideas.

Delete sections that do not add evidence. A short, specific page is stronger than a complete-looking
page padded with generic text.

## Topic suggestions

- **Product:** target user, workflow before and after, key interaction, trust boundary
- **Architecture:** client/server split, data flow, offline behavior, storage, deployment
- **Reliability:** validation, fallbacks, reconciliation, error recovery, tests
- **Platform:** Android/iOS/web constraints, editor integration, lifecycle, accessibility
- **Performance:** latency target, rendering hot path, caching, memory or build-size tradeoffs
- **Security and privacy:** secret ownership, uploaded data, permissions, retained state
- **Ownership:** your role, decisions you drove, maintenance or open-source responsibilities
- **Evidence:** release, public repository, screenshots, metrics, user feedback, demo

## Editorial rules

- Describe prototypes as prototypes and shipped releases as shipped releases.
- Do not turn roadmap items into implemented features.
- Link only to destinations a portfolio visitor can open. Omit private repositories.
- Prefer exact nouns and mechanisms over claims such as “seamless,” “powerful,” or “innovative.”
- Explain one important tradeoff instead of listing every library in the stack.
- Keep provider keys, internal URLs, customer data, and private screenshots out of the page.

Use [project-summary-template.mdx](./project-summary-template.mdx) as the starting point for a new
entry.
