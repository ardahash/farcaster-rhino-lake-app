"use client"

import { useEffect, useMemo, useState } from "react"
import { useBaseAuth } from "@/lib/base-auth"

const CONNECTING_GRACE_MS = 4000

const isMobileUserAgent = () => {
  if (typeof navigator === "undefined") return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function ConnectionDebug() {
  const { isConnecting, error, diagnostics } = useBaseAuth()
  const [isMobile, setIsMobile] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    setIsMobile(isMobileUserAgent())
  }, [])

  useEffect(() => {
    if (!isConnecting || !diagnostics.lastAttemptAt) {
      setElapsedMs(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - diagnostics.lastAttemptAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [diagnostics.lastAttemptAt, isConnecting])

  const issues = useMemo(() => {
    if (!isMobile) return []
    const list: string[] = []
    if (!diagnostics.onchainKitApiKeyPresent) {
      list.push("Missing NEXT_PUBLIC_ONCHAINKIT_API_KEY.")
    }
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:" &&
      !window.location.hostname.includes("localhost")
    ) {
      list.push("App must be served over https on mobile.")
    }
    if (!diagnostics.isMiniApp) {
      list.push("Mini App context not detected (try opening from the Mini App list).")
    }
    return list
  }, [diagnostics.isMiniApp, diagnostics.onchainKitApiKeyPresent, isMobile])

  const shouldShow = isMobile && (Boolean(error) || elapsedMs > CONNECTING_GRACE_MS)
  if (!shouldShow) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold">Connection diagnostics</p>
      {error && <p className="mt-1">Error: {error}</p>}
      {diagnostics.lastConnector && (
        <p className="mt-1">
          Connector: {diagnostics.lastConnector.name} ({diagnostics.lastConnector.id})
        </p>
      )}
      <p className="mt-1">
        Mini App context: {diagnostics.isMiniApp ? "detected" : "missing"}
        {diagnostics.miniKitPlatform ? ` (${diagnostics.miniKitPlatform})` : ""}
      </p>
      <p className="mt-1">
        Mini App detection:{" "}
        {diagnostics.miniAppDetected === null
          ? "pending"
          : diagnostics.miniAppDetected
            ? "true"
            : "false"}
      </p>
      <p className="mt-1">Elapsed: {(elapsedMs / 1000).toFixed(0)}s</p>
      {issues.length > 0 && (
        <div className="mt-2 space-y-1">
          {issues.map((issue) => (
            <p key={issue}>- {issue}</p>
          ))}
        </div>
      )}
    </div>
  )
}
