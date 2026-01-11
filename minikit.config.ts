const DEFAULT_ROOT_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://farcaster-rhino-lake-app.vercel.app"

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
    subtitle: "Sacrifice ZEN, grow your empire",
    description: "Sacrifice ZEN to grow your ancient empire on Base.",
    screenshotUrls: [`${ROOT_URL}/placeholder.jpg`],
    iconUrl: `${ROOT_URL}/icon.svg`,
    splashImageUrl: `${ROOT_URL}/placeholder.jpg`,
    splashBackgroundColor: "#2e2a25",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["games", "base", "miniapp", "zen", "rhino-lake"],
    heroImageUrl: `${ROOT_URL}/placeholder.jpg`,
    tagline: "Build your empire by sacrificing ZEN.",
    ogTitle: "Rhino Lake",
    ogDescription: "Sacrifice ZEN to grow your ancient empire on Base.",
    ogImageUrl: `${ROOT_URL}/placeholder.jpg`,
  },
} as const
