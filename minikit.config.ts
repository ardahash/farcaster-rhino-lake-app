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
    subtitle: "Strategy city builder",
    description:
      "Build your city grow stronger and battle in Rhino Lake on Base",
    imageUrl: `${ROOT_URL}/rhinolakeTown.png`,
    screenshotUrls: [`${ROOT_URL}/rhinolakeTown.png`],
    iconUrl: `${ROOT_URL}/rhinolakeTownManifest.png`,
    buttonTitle: "Open Rhino Lake",
    splashImageUrl: `${ROOT_URL}/rhinolakeTown.png`,
    splashBackgroundColor: "#2e2a25",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["games", "base", "miniapp", "zen", "rhinolake"],
    heroImageUrl: `${ROOT_URL}/rhinolakeTown.png`,
    tagline: "Web3 Strategy game on Base!",
    ogTitle: "Rhino Lake",
    ogDescription: "Build your city grow stronger and battle in Rhino Lake on Base",
    ogImageUrl: `${ROOT_URL}/rhinolakeTown.png`,
    castShareUrl: ROOT_URL,
    noindex: false,
  },
} as const
