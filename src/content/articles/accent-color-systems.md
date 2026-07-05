---
title: "Accent color as a local preference"
description: "Letting a reader tint a site without turning the design system into a theme editor."
publishedAt: 2026-06-14
tags: ["css", "design-system", "preferences"]
featured: true
readingTime: "5 min"
---

An accent color can be treated as a small preference instead of a complete theme. The page keeps its
layout, contrast, and typography, while the accent only affects selected states, focus rings, and a
few signal elements.

## Browser defaults

Modern CSS exposes user-agent and platform colors in a few places. A site can start with the
platform accent when it is available, then store a custom value only when the reader explicitly picks
one.

That keeps the default path respectful and still gives the interface a personal control surface.
