"use client"

import { useState } from "react"
import { GameProvider } from "@/lib/game-state"
import { OnboardingModal } from "@/components/onboarding-modal"
import { HomeScreen } from "@/components/home-screen"
import { TempleScreen } from "@/components/temple-screen"
import { ProfileScreen } from "@/components/profile-screen"
import { InfoScreen } from "@/components/info-screen"
import { BottomNav } from "@/components/bottom-nav"
import { Toaster } from "@/components/ui/toaster"

export default function RhinoLakePage() {
  const [activeTab, setActiveTab] = useState("home")

  return (
    <GameProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <OnboardingModal />

        {/* Main Content Area */}
        <main className="flex-1 pb-20 overflow-y-auto">
          {activeTab === "home" && <HomeScreen />}
          {activeTab === "temple" && <TempleScreen />}
          {activeTab === "profile" && <ProfileScreen />}
          {activeTab === "info" && <InfoScreen />}
        </main>

        {/* Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

        <Toaster />
      </div>
    </GameProvider>
  )
}
