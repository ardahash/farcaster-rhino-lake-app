"use client"

import { useEffect, useState } from "react"
import { BaseAuthProvider, useBaseAuth } from "@/lib/base-auth"
import { GameProvider } from "@/lib/game-state"
import { OnboardingModal } from "@/components/onboarding-modal"
import { HomeScreen } from "@/components/home-screen"
import { TempleScreen } from "@/components/temple-screen"
import { TownScreen } from "@/components/town-screen"
import { SocialScreen } from "@/components/social-screen"
import { ProfileScreen } from "@/components/profile-screen"
import { InfoScreen } from "@/components/info-screen"
import { BottomNav } from "@/components/bottom-nav"
import { Toaster } from "@/components/ui/toaster"
import { WalletIslandDock } from "@/components/wallet-island"
import { LoginDialog } from "@/components/login-dialog"
import { useCityId } from "@/hooks/use-city-id"

function RhinoLakeShell() {
  const [activeTab, setActiveTab] = useState("home")
  const { address } = useBaseAuth()
  const { cityId, isLoading: isCityIdLoading } = useCityId(address)
  const hasCity = !isCityIdLoading && cityId > 0n

  useEffect(() => {
    if (isCityIdLoading) return
    if (!hasCity && (activeTab === "town" || activeTab === "temple")) {
      setActiveTab("home")
    }
  }, [activeTab, hasCity, isCityIdLoading])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <OnboardingModal />
      <LoginDialog />

      {/* Main Content Area */}
      <main className="flex-1 pb-20 overflow-y-auto">
        {activeTab === "home" && <HomeScreen />}
        {activeTab === "town" && hasCity && <TownScreen onEnterTemple={() => setActiveTab("temple")} />}
        {activeTab === "temple" && <TempleScreen />}
        {activeTab === "social" && <SocialScreen />}
        {activeTab === "profile" && <ProfileScreen />}
        {activeTab === "info" && <InfoScreen />}
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
      <GameProvider>
        <RhinoLakeShell />
      </GameProvider>
    </BaseAuthProvider>
  )
}
