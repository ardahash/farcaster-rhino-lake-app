"use client"

import { useEffect, useMemo, useState } from "react"
import { sdk } from "@farcaster/miniapp-sdk"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useBaseAuth } from "@/lib/base-auth"

const BASE_APP_CLIENT_FID = 309857

const isMobileUserAgent = () => {
  if (typeof navigator === "undefined") return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function LoginDialog() {
  const { isAuthenticated, isConnecting, signIn } = useBaseAuth()
  const [isMobile, setIsMobile] = useState(false)
  const [isBaseMiniApp, setIsBaseMiniApp] = useState(false)
  const [checkedMiniApp, setCheckedMiniApp] = useState(false)

  useEffect(() => {
    setIsMobile(isMobileUserAgent())
  }, [])

  useEffect(() => {
    let cancelled = false

    const checkMiniApp = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp()
        if (!inMiniApp) {
          if (!cancelled) {
            setIsBaseMiniApp(false)
            setCheckedMiniApp(true)
          }
          return
        }

        const context = await sdk.context.catch(() => null)
        const clientFid = context?.client?.clientFid
        if (!cancelled) {
          setIsBaseMiniApp(clientFid === BASE_APP_CLIENT_FID)
          setCheckedMiniApp(true)
        }
      } catch {
        if (!cancelled) {
          setIsBaseMiniApp(false)
          setCheckedMiniApp(true)
        }
      }
    }

    checkMiniApp()

    return () => {
      cancelled = true
    }
  }, [])

  const showBaseOnly = useMemo(() => {
    if (!isMobile) return false
    if (!checkedMiniApp) return true
    return isBaseMiniApp
  }, [checkedMiniApp, isBaseMiniApp, isMobile])

  if (isAuthenticated) return null

  return (
    <Dialog open={!isAuthenticated}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Connect your wallet</DialogTitle>
          <DialogDescription>
            Choose your wallet to continue. Your Base account unlocks onchain sacrifices.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button
            onClick={() => signIn("coinbase")}
            disabled={isConnecting}
            className="w-full"
          >
            Connect Base Wallet
          </Button>
          {!showBaseOnly && (
            <Button
              onClick={() => signIn("injected")}
              disabled={isConnecting}
              className="w-full"
              variant="outline"
            >
              Connect MetaMask
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
