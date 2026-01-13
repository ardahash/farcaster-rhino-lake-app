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
    header: "",
    payload: "",
    signature: "",
  },
  miniapp: {
    version: "1",
    name: "Rhino Lake",
    subtitle: "Sacrifice ZEN to grow empire",
    description: "Sacrifice ZEN to grow your ancient empire on Base.",
    screenshotUrls: [`${ROOT_URL}/image.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/logo.png`,
    splashBackgroundColor: "#2e2a25",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["games", "base", "miniapp", "zen", "rhino-lake"],
    heroImageUrl: `${ROOT_URL}/image.png`,
    tagline: "Grow your empire with ZEN",
    ogTitle: "Rhino Lake",
    ogDescription: "Sacrifice ZEN to grow your ancient empire on Base.",
    ogImageUrl: `${ROOT_URL}/image.png`,
    noindex: false,
  },
} as const
