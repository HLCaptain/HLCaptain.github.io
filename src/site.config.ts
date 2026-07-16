export const siteConfig = {
  name: "HLCaptain",
  title: "HLCaptain - Portfolio and Field Notes",
  description:
    "A compact portfolio for interface work, systems thinking, and software projects.",
  url: import.meta.env.SITE_URL ?? "https://hlcaptain.github.io",
  locale: "en_US",
  author: {
    name: "HLCaptain",
    role: "Software engineer",
    location: "Europe/Budapest",
    email: "pkblazsak@gmail.com"
  },
  accentPresets: [
    { label: "Amber", value: "#b9843b" },
    { label: "Cyan", value: "#2f8f9d" },
    { label: "Red", value: "#b4514f" },
    { label: "Violet", value: "#7867b8" },
    { label: "Green", value: "#6f8f4e" }
  ],
  navigation: [
    {
      label: "Index",
      glyph: "index",
      open: true,
      items: [
        { label: "Overview", href: "/", glyph: "home" },
        { label: "About", href: "/about/", glyph: "person" }
      ]
    },
    {
      label: "Articles",
      glyph: "writing",
      open: true,
      items: [
        { label: "All articles", href: "/articles/", glyph: "archive" },
        { label: "RSS", href: "/rss.xml", glyph: "feed" }
      ]
    },
    {
      label: "Projects",
      glyph: "work",
      open: true,
      items: [{ label: "All projects", href: "/work/", glyph: "archive" }]
    },
    {
      label: "Network",
      glyph: "network",
      open: true,
      items: [
        { label: "GitHub", href: "https://github.com/HLCaptain", glyph: "github", external: true },
        { label: "Email", href: "mailto:pkblazsak@gmail.com", glyph: "mail", external: true }
      ]
    }
  ]
} as const;
