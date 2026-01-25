"use client"

import { useEffect, useRef } from "react"
import { sdk } from "@farcaster/miniapp-sdk"
import { useMiniKit } from "@coinbase/onchainkit/minikit"

const BASE_APP_CLIENT_FID = 309857

export function MiniAppReady() {
  const { context } = useMiniKit()
  const didCallReady = useRef(false)
  const debugEnabled = process.env.NEXT_PUBLIC_MINIAPP_DEBUG === "1"

  useEffect(() => {
    if (didCallReady.current) return
    let cancelled = false

    const run = async () => {
      const clientFid = context?.client?.clientFid
      const isBaseApp = clientFid === BASE_APP_CLIENT_FID
      const hasContext = Boolean(context?.client)

      let inMiniApp = false
      try {
        inMiniApp = await sdk.isInMiniApp()
      } catch (error) {
        if (debugEnabled) {
          console.info("[miniapp] isInMiniApp check failed", error)
        }
      }

      if (!inMiniApp && !hasContext) {
        if (debugEnabled) {
          console.info("[miniapp] not in mini app environment")
        }
        return
      }

      if (clientFid && !isBaseApp && debugEnabled) {
        console.info("[miniapp] non-Base host detected", { clientFid })
      }

      didCallReady.current = true
      try {
        await sdk.actions.ready()
        if (!cancelled && debugEnabled) {
          console.info("[miniapp] sdk.actions.ready called", { isBaseApp })
        }
      } catch (error) {
        if (!cancelled && debugEnabled) {
          console.info("[miniapp] sdk.actions.ready failed", error)
        }
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [context, debugEnabled])

  return null
}
