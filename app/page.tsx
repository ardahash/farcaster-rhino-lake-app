"use client"

import { useEffect, useState } from "react"
import { BaseAuthProvider, useBaseAuth } from "@/lib/base-auth"
import { MiniAppReady } from "@/lib/miniapp-ready"
import { GameProvider } from "@/lib/game-state"
import { OnboardingModal } from "@/components/onboarding-modal"
import { HomeScreen } from "@/components/home-screen"
import { ArmyScreen } from "@/components/army-screen"
import { TownScreen } from "@/components/town-screen"
import { MarketScreen } from "@/components/market-screen"
import { SocialScreen } from "@/components/social-screen"
import { ProfileScreen } from "@/components/profile-screen"
import { MiningScreen } from "@/components/mining-screen"
import { PlinkoScreen } from "@/components/plinko-screen"
import { InfoScreen } from "@/components/info-screen"
import { DocsScreen } from "@/components/docs-screen"
import { BottomNav } from "@/components/bottom-nav"
import { Toaster } from "@/components/ui/toaster"
import { WalletIslandDock } from "@/components/wallet-island"
import { LoginDialog } from "@/components/login-dialog"
import { useCityId } from "@/hooks/use-city-id"

function RhinoLakeShell() {
  const [activeTab, setActiveTab] = useState("info")
  const { address } = useBaseAuth()
  const { cityId, isLoading: isCityIdLoading } = useCityId(address)
  const hasCity = !isCityIdLoading && cityId > 0n

  useEffect(() => {
    if (isCityIdLoading) return
    if (!hasCity && activeTab === "town") {
      setActiveTab("home")
    }
  }, [activeTab, hasCity, isCityIdLoading])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <OnboardingModal />
      <LoginDialog />

      {/* Main Content Area */}
      <main className="flex-1 pb-20 overflow-y-auto">
        {activeTab === "home" && <HomeScreen onNavigate={setActiveTab} />}
        {activeTab === "town" && hasCity && <TownScreen onNavigate={setActiveTab} />}
        {activeTab === "army" && <ArmyScreen />}
        {activeTab === "market" && <MarketScreen />}
        {activeTab === "plinko" && <PlinkoScreen />}
        {activeTab === "mining" && <MiningScreen />}
        {activeTab === "social" && <SocialScreen />}
        {activeTab === "profile" && <ProfileScreen onNavigate={setActiveTab} />}
        {activeTab === "docs" && <DocsScreen />}
        {activeTab === "info" && <InfoScreen onNavigate={setActiveTab} />}
      </main>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} showTown={hasCity} />

      <WalletIslandDock />
      <Toaster />
    </div>
  )
}

export default function RhinoLakePage() {
  return (
    <BaseAuthProvider>
      <MiniAppReady />
      <GameProvider>
        <RhinoLakeShell />
      </GameProvider>
    </BaseAuthProvider>
  )
}
