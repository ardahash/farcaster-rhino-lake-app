"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"

type ManifestCheck = {
  status: number | null
  ok: boolean
  contentType: string | null
  parseError: string | null
  fetchError: string | null
  miniappPresent: boolean | null
  accountAssociationPresent: boolean | null
  accountAssociationDomain: string | null
  checkedAt: string | null
}

const emptyState: ManifestCheck = {
  status: null,
  ok: false,
  contentType: null,
  parseError: null,
  fetchError: null,
  miniappPresent: null,
  accountAssociationPresent: null,
  accountAssociationDomain: null,
  checkedAt: null,
}

const decodePayloadDomain = (payload: string) => {
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const paddingNeeded = (4 - (normalized.length % 4)) % 4
    const padded = `${normalized}${"=".repeat(paddingNeeded)}`
    const json = atob(padded)
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === "object" && "domain" in parsed && typeof parsed.domain === "string") {
      return parsed.domain
    }
  } catch {
    return null
  }
  return null
}

export function ManifestStatusPanel() {
  const debugEnabled = process.env.NEXT_PUBLIC_MINIAPP_DEBUG === "1"
  const [state, setState] = useState<ManifestCheck>(emptyState)
  const [isLoading, setIsLoading] = useState(false)

  const manifestUrl = useMemo(() => {
    if (typeof window === "undefined") return "/.well-known/farcaster.json"
    return new URL("/.well-known/farcaster.json", window.location.origin).toString()
  }, [])

  const fetchManifest = useCallback(async () => {
    setIsLoading(true)
    setState((prev) => ({ ...prev, fetchError: null, parseError: null }))

    try {
      const response = await fetch(manifestUrl, { cache: "no-store" })
      const contentType = response.headers.get("content-type")
      const body = await response.text()
      let parsed: unknown | null = null
      let parseError: string | null = null

      try {
        parsed = JSON.parse(body)
      } catch (error) {
        parseError = error instanceof Error ? error.message : "Invalid JSON"
      }

      const accountAssociationDomain =
        parsed &&
        typeof parsed === "object" &&
        "accountAssociation" in parsed &&
        typeof parsed.accountAssociation === "object" &&
        parsed.accountAssociation !== null &&
        "payload" in parsed.accountAssociation &&
        typeof parsed.accountAssociation.payload === "string"
          ? decodePayloadDomain(parsed.accountAssociation.payload)
          : null

      setState({
        status: response.status,
        ok: response.ok,
        contentType,
        parseError,
        fetchError: null,
        miniappPresent: typeof parsed === "object" && parsed !== null && "miniapp" in parsed,
        accountAssociationPresent:
          typeof parsed === "object" && parsed !== null && "accountAssociation" in parsed,
        accountAssociationDomain,
        checkedAt: new Date().toISOString(),
      })
    } catch (error) {
      setState({
        ...emptyState,
        fetchError: error instanceof Error ? error.message : "Failed to fetch manifest",
        checkedAt: new Date().toISOString(),
      })
    } finally {
      setIsLoading(false)
    }
  }, [manifestUrl])

  useEffect(() => {
    if (!debugEnabled) return
    fetchManifest()
  }, [debugEnabled, fetchManifest])

  if (!debugEnabled) return null

  const host = typeof window === "undefined" ? null : window.location.host
  const domainMismatch =
    host && state.accountAssociationDomain ? host !== state.accountAssociationDomain : null

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground">Manifest status</p>
        <Button type="button" size="sm" variant="outline" onClick={fetchManifest} disabled={isLoading}>
          {isLoading ? "Checking..." : "Refresh"}
        </Button>
      </div>
      <p className="mt-2 break-all">URL: {manifestUrl}</p>
      {state.fetchError && <p className="mt-1 text-amber-600">Fetch error: {state.fetchError}</p>}
      <p className="mt-1">Status: {state.status ?? "--"} {state.ok ? "OK" : ""}</p>
      <p className="mt-1">Content-Type: {state.contentType ?? "--"}</p>
      <p className="mt-1">JSON parse: {state.parseError ? state.parseError : "ok"}</p>
      <p className="mt-1">
        Fields: miniapp {state.miniappPresent === null ? "--" : state.miniappPresent ? "present" : "missing"},{" "}
        accountAssociation{" "}
        {state.accountAssociationPresent === null
          ? "--"
          : state.accountAssociationPresent
            ? "present"
            : "missing"}
      </p>
      <p className="mt-1">
        Account domain: {state.accountAssociationDomain ?? "--"}
        {domainMismatch === null ? "" : domainMismatch ? " (mismatch)" : " (match)"}
      </p>
      {state.checkedAt && <p className="mt-1">Checked: {new Date(state.checkedAt).toLocaleTimeString()}</p>}
    </div>
  )
}
