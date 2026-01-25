import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "@coinbase/onchainkit/styles.css"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

const DEFAULT_ROOT_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://rhinolake.com"

const resolveRootUrl = () => {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)

  const rawUrl = envUrl ?? DEFAULT_ROOT_URL
  return rawUrl.replace(/\/$/, "")
}

const ROOT_URL = resolveRootUrl()

const MINIAPP_EMBED = {
  version: "next",
  imageUrl: `${ROOT_URL}/rhinolakeTown.png`,
  button: {
    title: "Open Rhino Lake",
    action: {
      type: "launch_frame",
      url: ROOT_URL,
      name: "Rhino Lake",
    },
  },
} as const

export const metadata: Metadata = {
  title: "Rhino Lake - Build Your Empire",
  description:
    "Build your city, grow stronger, attack & defend! Rhino Lake is a fun, early alpha testing on mainnet, we iterate very fast so please join our Discord for any suggestions!",
  other: {
    "base:app_id": "6963ea39b8395f034ac224dc",
    "fc:miniapp": JSON.stringify(MINIAPP_EMBED),
  },
  generator: "Rhino Lake",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.png",
        type: "image/png",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3f0" },
    { media: "(prefers-color-scheme: dark)", color: "#2e2a25" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
