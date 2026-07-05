export const siteConfig = {
  name: "HLCaptain",
  title: "HLCaptain - Portfolio and Field Notes",
  description:
    "A compact portfolio and writing archive for interface work, systems thinking, and upcoming technical articles.",
  url: import.meta.env.SITE_URL ?? "https://hlcaptain-site.pages.dev",
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
      glyph: "home",
      open: true,
      items: [
        { label: "Overview", href: "/", glyph: "home" },
        { label: "About", href: "/about/", glyph: "person" }
      ]
    },
    {
      label: "Archive",
      glyph: "archive",
      open: true,
      items: [
        { label: "Articles", href: "/articles/", glyph: "writing" },
        { label: "RSS", href: "/rss.xml", glyph: "feed" }
      ]
    },
    {
      label: "Work",
      glyph: "work",
      open: true,
      items: [{ label: "Projects", href: "/work/", glyph: "work" }]
    },
    {
      label: "Network",
      glyph: "link",
      open: true,
      items: [
        { label: "GitHub", href: "https://github.com/HLCaptain", glyph: "link", external: true },
        { label: "Email", href: "mailto:pkblazsak@gmail.com", glyph: "mail", external: true }
      ]
    }
  ]
} as const;

export type NavGroup = (typeof siteConfig.navigation)[number];
export type NavItem = NavGroup["items"][number];
