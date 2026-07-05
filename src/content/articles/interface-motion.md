---
title: "Interface motion that preserves orientation"
description: "A short note on using animation for navigation state instead of spectacle."
publishedAt: 2026-06-28
tags: ["ui", "motion", "accessibility"]
featured: true
readingTime: "3 min"
---

Useful motion answers a question: what changed, and where did it go? A selected navigation item can
slide a small indicator into place. A page transition can fade and lift the new content just enough to
confirm that navigation happened.

## Practical rules

Keep animated properties cheap. Opacity and transform are usually enough for hover states, sidebar
expansion, and route transitions. Reserve layout animation for places where it communicates structure,
such as an expanding group root.

Motion should also be optional. If a visitor has reduced-motion enabled, the site should remove
non-essential transitions while preserving every state change.
