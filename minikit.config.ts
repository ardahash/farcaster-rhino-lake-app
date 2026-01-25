const DEFAULT_ROOT_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://rhinolake.com"

const resolveRootUrl = () => {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

  const rawUrl = envUrl ?? DEFAULT_ROOT_URL
  return rawUrl.replace(/\/$/, "")
}

const ROOT_URL = resolveRootUrl()

export const minikitConfig = {
  accountAssociation: {
    header:
      "eyJmaWQiOjE4Mzc3MjksInR5cGUiOiJhdXRoIiwia2V5IjoiMHgzOTlGNGFlRDZEMTVlMmNFNjlhMjA3Zjg3ZjcwRjVGRUIyOTY0ODdiIn0",
    payload: "eyJkb21haW4iOiJyaGlub2xha2UuY29tIn0",
    signature:
      "249f3Z2DKuiE+hRgQCk9w7dT3DJhCf9ys6QFMod4SC4cMsLFzw1dsj3P/Dm7/IV17QwqomEUwlBpqFBANaA9ihw=",
  },
  miniapp: {
    version: "1",
    name: "Rhino Lake",
    devname: "rhinolake",
    subtitle: "Sacrifice ZEN to grow empire",
    description: "Sacrifice ZEN to grow your ancient empire on Base.",
    screenshotUrls: [`${ROOT_URL}/image.png`],
    iconUrl: `${ROOT_URL}/rhinolakeTownManifest.png`,
    splashImageUrl: `${ROOT_URL}/logo.png`,
    splashBackgroundColor: "#2e2a25",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["games", "base", "miniapp", "zen", "rhinolake"],
    heroImageUrl: `${ROOT_URL}/image.png`,
    tagline: "Grow your empire with ZEN",
    ogTitle: "Rhino Lake",
    ogDescription: "Sacrifice ZEN to grow your ancient empire on Base.",
    ogImageUrl: `${ROOT_URL}/manifestOgImageUrl.png`,
    noindex: false,
  },
} as const
