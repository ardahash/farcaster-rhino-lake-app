"use client"

import { useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { encodeFunctionData, maxUint256 } from "viem"
import { usePublicClient, useSendTransaction, useSwitchChain } from "wagmi"
import { BASE_MAINNET_CHAIN_ID } from "@/lib/base-config"
import { useBaseAuth } from "@/lib/base-auth"
import { PROFILE_PIC_NFT_ABI, ERC20_ABI } from "@/lib/contracts"
import { PROFILE_PIC_NFT_ADDRESS, USDC_ADDRESS } from "@/lib/pfp-config"
import { PFP_ITEMS } from "@/lib/pfp-catalog"
import { useOwnedPfps } from "@/hooks/use-owned-pfps"
import { useActivePfp } from "@/hooks/use-active-pfp"
import { useUsdcAllowance } from "@/hooks/use-usdc-allowance"
import { useToast } from "@/hooks/use-toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const rarityStyles: Record<string, string> = {
  Regular: "bg-muted text-foreground",
  Epic: "bg-blue-500/20 text-blue-200",
  Legendary: "bg-amber-500/20 text-amber-200",
}

type PfpAvatarProps = {
  displayName: string
  fallback: string
  className?: string
  fallbackClassName?: string
}

export function PfpAvatar({ displayName, fallback, className, fallbackClassName }: PfpAvatarProps) {
  const { address, chainId, isAuthenticated, signIn } = useBaseAuth()
  const { toast } = useToast()
  const publicClient = usePublicClient({ chainId: BASE_MAINNET_CHAIN_ID })
  const { sendTransactionAsync, isPending } = useSendTransaction()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()

  const { balances, refetch: refetchOwned } = useOwnedPfps(address)
  const { activeId, refetch: refetchActive } = useActivePfp(address)
  const { allowance, refetch: refetchAllowance } = useUsdcAllowance(
    address as Address | null,
    PROFILE_PIC_NFT_ADDRESS as Address | null,
    Boolean(address),
  )

  const [open, setOpen] = useState(false)
  const [pendingTokenId, setPendingTokenId] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<"buy" | "set-active" | null>(null)

  useEffect(() => {
    setOpen(false)
    setPendingTokenId(null)
    setPendingAction(null)
    if (address && PROFILE_PIC_NFT_ADDRESS && USDC_ADDRESS) {
      refetchOwned()
      refetchActive()
      refetchAllowance()
    }
  }, [address, chainId, refetchActive, refetchAllowance, refetchOwned])

  const ownedById = useMemo(() => {
    const map = new Map<number, boolean>()
    PFP_ITEMS.forEach((item, index) => {
      map.set(item.id, (balances[index] ?? 0n) > 0n)
    })
    return map
  }, [balances])

  const activeItem = useMemo(() => {
    const activeIdNumber = Number(activeId)
    if (activeIdNumber > 0 && ownedById.get(activeIdNumber)) {
      return PFP_ITEMS.find((item) => item.id === activeIdNumber) ?? PFP_ITEMS[0]
    }
    return PFP_ITEMS[0]
  }, [activeId, ownedById])

  const isConfigured = Boolean(PROFILE_PIC_NFT_ADDRESS && USDC_ADDRESS)
  const isBusy = isPending || isSwitching || Boolean(pendingAction)

  const ensureBaseNetwork = async () => {
    const activeChainId = chainId ?? BASE_MAINNET_CHAIN_ID
    if (activeChainId !== BASE_MAINNET_CHAIN_ID) {
      await switchChainAsync({ chainId: BASE_MAINNET_CHAIN_ID })
      throw new Error("Switching to Base mainnet. Please try again.")
    }
    return BASE_MAINNET_CHAIN_ID
  }

  const ensureAuthenticated = async () => {
    if (!isAuthenticated || !address) {
      await signIn("coinbase")
      return false
    }
    return true
  }

  const handleBuy = async (tokenId: number) => {
    if (!PROFILE_PIC_NFT_ADDRESS || !USDC_ADDRESS) {
      toast({
        title: "Shop not configured",
        description: "Missing contract configuration.",
        variant: "destructive",
      })
      return
    }

    const item = PFP_ITEMS.find((entry) => entry.id === tokenId)
    if (!item) return

    setPendingTokenId(tokenId)
    setPendingAction("buy")
    try {
      const authed = await ensureAuthenticated()
      if (!authed) {
        return
      }
      await ensureBaseNetwork()

      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }

      const currentAllowance = allowance ?? 0n
      if (currentAllowance < item.priceRaw) {
        const approvalHash = await sendTransactionAsync({
          chainId: BASE_MAINNET_CHAIN_ID,
          account: address,
          to: USDC_ADDRESS,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "approve",
            args: [PROFILE_PIC_NFT_ADDRESS, maxUint256],
          }),
        })
        await publicClient.waitForTransactionReceipt({ hash: approvalHash })
      }

      const buyHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: PROFILE_PIC_NFT_ADDRESS,
        data: encodeFunctionData({
          abi: PROFILE_PIC_NFT_ABI,
          functionName: "buy",
          args: [BigInt(tokenId)],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: buyHash })

      toast({
        title: "Purchase complete",
        description: "Profile picture unlocked.",
      })
      refetchOwned()
      refetchActive()
      refetchAllowance()
    } catch (error) {
      toast({
        title: "Purchase failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setPendingTokenId(null)
      setPendingAction(null)
    }
  }

  const handleSetActive = async (tokenId: number) => {
    if (!PROFILE_PIC_NFT_ADDRESS) {
      toast({
        title: "Shop not configured",
        description: "Missing contract configuration.",
        variant: "destructive",
      })
      return
    }

    setPendingTokenId(tokenId)
    setPendingAction("set-active")
    try {
      const authed = await ensureAuthenticated()
      if (!authed) {
        return
      }
      await ensureBaseNetwork()

      if (!publicClient || !address) {
        throw new Error("RPC not ready.")
      }

      const setHash = await sendTransactionAsync({
        chainId: BASE_MAINNET_CHAIN_ID,
        account: address,
        to: PROFILE_PIC_NFT_ADDRESS,
        data: encodeFunctionData({
          abi: PROFILE_PIC_NFT_ABI,
          functionName: "setActive",
          args: [BigInt(tokenId)],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: setHash })

      toast({
        title: "Profile updated",
        description: "Active PFP set.",
      })
      refetchActive()
      refetchOwned()
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setPendingTokenId(null)
      setPendingAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label="Open profile shop" className="rounded-full">
          <Avatar className={className}>
            <AvatarImage src={activeItem.src} alt={displayName} />
            <AvatarFallback className={fallbackClassName}>{fallback}</AvatarFallback>
          </Avatar>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Profile Picture Shop</DialogTitle>
          <DialogDescription>Buy with USDC and set your active avatar.</DialogDescription>
        </DialogHeader>

        {!isConfigured && (
          <p className="text-sm text-amber-500">Profile shop is not configured yet.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PFP_ITEMS.map((item) => {
            const isOwned = ownedById.get(item.id) ?? false
            const isActive = isOwned && Number(activeId) === item.id
            const rarityClass = rarityStyles[item.rarity] ?? "bg-muted text-foreground"
            const isPendingItem = pendingTokenId === item.id

            return (
              <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-black/20">
                  <img src={item.src} alt={`PFP ${item.id}`} className="h-full w-full object-cover" />
                  {isActive && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <Badge className={rarityClass}>{item.rarity}</Badge>
                  {isOwned ? (
                    <span className="text-emerald-300">Owned</span>
                  ) : (
                    <span className="text-muted-foreground">{item.priceUsdc} USDC</span>
                  )}
                </div>
                {isOwned ? (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleSetActive(item.id)}
                    disabled={isBusy || isActive || isPendingItem}
                    variant={isActive ? "secondary" : "default"}
                  >
                    {isActive ? "Active" : isPendingItem && pendingAction === "set-active" ? "Setting..." : "Set Active"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleBuy(item.id)}
                    disabled={isBusy || isPendingItem || !isConfigured}
                  >
                    {isPendingItem && pendingAction === "buy" ? "Buying..." : `Buy ${item.priceUsdc} USDC`}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {!isAuthenticated && (
          <p className="text-xs text-muted-foreground text-center">Connect your Base account to buy or set active.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
