"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useBaseAuth } from "@/lib/base-auth"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { BURNER_ABI, CONTRACTS, ERC20_ABI, GAME_ABI } from "@/lib/contracts"
import { useCityId } from "@/hooks/use-city-id"
import { useErc20Balance } from "@/lib/use-erc20-balance"
import { Loader2, Church, Coins, TrendingUp } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { usePublicClient, useReadContract, useSendTransaction, useSwitchChain } from "wagmi"
import { encodeFunctionData, formatUnits, parseUnits } from "viem"
import { ConnectionDebug } from "@/components/connection-debug"

// Dev layout: press "E" or click "Edit Layout", then copy JSON and paste it here.
const DEFAULT_TEMPLE_LAYOUT = {
  actionPanel: { x: 0.5, y: 0.68 },
} as const

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)

export function TempleScreen() {
  const { address, chainId, isAuthenticated, isConnecting, signIn, error: authError } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending: isTxPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const { cityId, isLoading: isCityIdLoading, refetch: refetchCityId } = useCityId(address)

  const [burnAmount, setBurnAmount] = useState("")
  const [isBurning, setIsBurning] = useState(false)
  const [isMinting, setIsMinting] = useState(false)
  const [layout, setLayout] = useState(() => DEFAULT_TEMPLE_LAYOUT)
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const isDev = process.env.NODE_ENV === "development"

  const zenBalance = useErc20Balance({
    token: CONTRACTS.ZEN,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const rhinoBalance = useErc20Balance({
    token: CONTRACTS.RHINO,
    address,
    chainId: BASE_MAINNET_CHAIN_ID,
    enabled: Boolean(address),
  })

  const { data: currentRate } = useReadContract({
    address: CONTRACTS.BURNER,
    abi: BURNER_ABI,
    functionName: "currentRate",
    chainId: BASE_MAINNET_CHAIN_ID,
    query: {
      enabled: Boolean(isAuthenticated),
      refetchInterval: 20000,
    },
  })

  const rateDisplay = useMemo(() => {
    if (!currentRate) return "--"
    try {
      return formatUnits(currentRate as bigint, 18)
    } catch {
      return "--"
    }
  }, [currentRate])

  const formatTokenValue = (raw: bigint, decimals: number) => {
    try {
      const value = Number(formatUnits(raw, decimals))
      if (!Number.isFinite(value)) return "--"
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    } catch {
      return "--"
    }
  }

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureAllowance = useCallback(
    async (amount: bigint) => {
      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }

      const allowance = (await publicClient.readContract({
        address: CONTRACTS.ZEN,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, CONTRACTS.BURNER],
      })) as bigint

      if (allowance >= amount) {
        return
      }

      const approvalTx = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.ZEN,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.BURNER, amount],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: approvalTx })
    },
    [address, publicClient, sendTransactionAsync],
  )

  const handleConnect = async () => {
    try {
      await signIn("coinbase")
    } catch {
      // Auth error surfaced via authError.
    }
  }

  const handleMintCity = async () => {
    setIsMinting(true)
    try {
      if (!isAuthenticated || !address) {
        await handleConnect()
        return
      }

      if (cityId > 0n) {
        throw new Error("City already minted.")
      }

      await ensureBaseNetwork()

      const txHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.GAME,
        data: encodeFunctionData({
          abi: GAME_ABI,
          functionName: "createCity",
        }),
      })
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash })
      }
      toast({
        title: "City Minted",
        description: "Your city has been created on Base.",
      })
      refetchCityId()
    } catch (error) {
      toast({
        title: "Mint Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsMinting(false)
    }
  }

  const handleBurn = async () => {
    const amountValue = Number.parseFloat(burnAmount)
    if (!amountValue || amountValue <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid ZEN amount.",
        variant: "destructive",
      })
      return
    }

    setIsBurning(true)
    try {
      if (!address || !isAuthenticated) {
        await handleConnect()
        return
      }

      const decimals = zenBalance.decimals ?? 18
      const amountRaw = parseUnits(burnAmount, decimals)

      if (zenBalance.isLoading) {
        throw new Error("ZEN balance is still loading.")
      }

      if (zenBalance.raw < amountRaw) {
        throw new Error("You need ZEN to burn. Swap first.")
      }

      await ensureBaseNetwork()
      await ensureAllowance(amountRaw)

      const burnTx = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: CONTRACTS.BURNER,
        data: encodeFunctionData({
          abi: BURNER_ABI,
          functionName: "burnZen",
          args: [amountRaw],
        }),
      })

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: burnTx })
      }

      setBurnAmount("")
      zenBalance.refetch()
      rhinoBalance.refetch()
      toast({
        title: "Burn Complete!",
        description: "RHINO minted to your wallet.",
      })
    } catch (caughtError) {
      toast({
        title: "Burn Failed",
        description: caughtError instanceof Error ? caughtError.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsBurning(false)
    }
  }

  const isPrimaryLoading = isBurning || isMinting || isTxPending || isConnecting || isSwitching
  const isOnBase = !chainId || chainId === BASE_MAINNET_CHAIN_ID
  const isCityReady = !isCityIdLoading
  const hasCity = isCityReady && cityId > 0n
  const activeLayout = isDev ? layout : DEFAULT_TEMPLE_LAYOUT
  const layoutStyle = {
    left: `${activeLayout.actionPanel.x * 100}%`,
    top: `${activeLayout.actionPanel.y * 100}%`,
  }

  useEffect(() => {
    if (!isDev) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "e") {
        setIsEditing((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isDev])

  const handleCopyLayout = async () => {
    const payload = JSON.stringify({ temple: activeLayout }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      toast({
        title: "Layout copied",
        description: "Paste the JSON into DEFAULT_TEMPLE_LAYOUT.",
      })
    } catch {
      toast({
        title: "Copy failed",
        description: payload,
      })
    }
  }

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDev || !isEditing) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const currentX = rect.left + activeLayout.actionPanel.x * rect.width
    const currentY = rect.top + activeLayout.actionPanel.y * rect.height
    dragOffsetRef.current = {
      x: event.clientX - currentX,
      y: event.clientY - currentY,
    }
    isDraggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDev || !isEditing || !isDraggingRef.current) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clamp01((event.clientX - rect.left - dragOffsetRef.current.x) / rect.width)
    const y = clamp01((event.clientY - rect.top - dragOffsetRef.current.y) / rect.height)
    setLayout((prev) => ({ ...prev, actionPanel: { x, y } }))
  }

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDev || !isEditing) return
    isDraggingRef.current = false
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore release errors.
    }
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url(/ZenTemple.png)" }}
      />
      <div className="absolute inset-0 bg-black/35" />

      <div ref={containerRef} className="relative z-10 mx-auto w-full max-w-2xl px-4 py-10 min-h-[560px]">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Church className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-primary gold-glow">The Temple</h1>
          <p className="text-muted-foreground">Burn ZEN to mint RHINO on Base mainnet</p>
        </div>

        {isDev && (
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button
              size="sm"
              variant={isEditing ? "secondary" : "outline"}
              onClick={() => setIsEditing((prev) => !prev)}
              className="h-8 px-3 text-xs"
            >
              {isEditing ? "Editing" : "Edit Layout"}
            </Button>
            {isEditing && (
              <Button size="sm" variant="secondary" onClick={handleCopyLayout} className="h-8 px-3 text-xs">
                Copy JSON
              </Button>
            )}
          </div>
        )}

        {isDev && isEditing && (
          <div className="absolute left-4 top-4 rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs backdrop-blur">
            <p className="font-semibold text-foreground">Layout</p>
            <p className="text-muted-foreground">
              actionPanel: {activeLayout.actionPanel.x.toFixed(3)}, {activeLayout.actionPanel.y.toFixed(3)}
            </p>
            <p className="text-muted-foreground">Press "E" to toggle edit.</p>
          </div>
        )}

        {hasCity && (
          <Card className="game-card mt-6 p-4 space-y-3 bg-card/70 backdrop-blur border-border/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Current Burn Rate</p>
                <p className="text-xl font-bold text-primary">{rateDisplay} RHINO / ZEN</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">RHINO Balance</p>
                <p className="text-xl font-bold text-foreground">
                  {rhinoBalance.isLoading ? "..." : formatTokenValue(rhinoBalance.raw, rhinoBalance.decimals ?? 18)}
                </p>
              </div>
            </div>
          </Card>
        )}

        <div
          className={`absolute -translate-x-1/2 -translate-y-1/2 ${isEditing ? "cursor-grab" : ""}`}
          style={layoutStyle}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <Card className="game-card w-[min(90vw,360px)] p-4 space-y-3 bg-card/70 backdrop-blur border-border/60">
            {!isCityReady ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading city...
              </div>
            ) : hasCity ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">Burn ZEN Amount</label>
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      placeholder="Enter amount..."
                      value={burnAmount}
                      onChange={(e) => setBurnAmount(e.target.value)}
                      className="h-9 text-sm bg-background/70 w-full max-w-[200px]"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ZEN Balance: {formatTokenValue(zenBalance.raw, zenBalance.decimals ?? 18)}
                  </p>
                </div>

                {!isOnBase && isAuthenticated && (
                  <p className="text-xs text-amber-300 text-center">Switch to Base mainnet to burn.</p>
                )}

                <Button
                  onClick={isAuthenticated ? handleBurn : handleConnect}
                  disabled={isPrimaryLoading || !burnAmount || !isOnBase}
                  className="w-full h-10 text-sm font-semibold bg-card/80 hover:bg-card text-foreground"
                  variant="secondary"
                >
                  {isBurning || isTxPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Burning...
                    </>
                  ) : isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : isAuthenticated ? (
                    <>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Burn ZEN
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Connect Base Account
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2 text-center">
                  <p className="text-sm font-semibold text-foreground">You need a City to use Temple features.</p>
                  <p className="text-xs text-muted-foreground">Mint a City NFT to unlock Temple actions.</p>
                </div>
                <Button
                  onClick={handleMintCity}
                  disabled={isPrimaryLoading || !isOnBase}
                  className="w-full h-10 text-sm font-semibold bg-card/80 hover:bg-card text-foreground"
                  variant="secondary"
                >
                  {isMinting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Minting...
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4 mr-2" />
                      Mint City
                    </>
                  )}
                </Button>
                {!isOnBase && isAuthenticated && (
                  <p className="text-xs text-amber-300 text-center">Switch to Base mainnet to mint.</p>
                )}
              </>
            )}
            {authError && !isAuthenticated && <p className="text-xs text-muted-foreground text-center">{authError}</p>}
          </Card>
        </div>

        <div className="mt-[520px]">
          <ConnectionDebug />
        </div>
      </div>
    </div>
  )
}
