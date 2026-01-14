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
  checkedAt: null,
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

      setState({
        status: response.status,
        ok: response.ok,
        contentType,
        parseError,
        fetchError: null,
        miniappPresent: typeof parsed === "object" && parsed !== null && "miniapp" in parsed,
        accountAssociationPresent:
          typeof parsed === "object" && parsed !== null && "accountAssociation" in parsed,
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
      {state.checkedAt && <p className="mt-1">Checked: {new Date(state.checkedAt).toLocaleTimeString()}</p>}
    </div>
  )
}
