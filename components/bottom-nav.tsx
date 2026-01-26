"use client"

import { Home, Castle, Church, Store, User, BookOpen, Users, Pickaxe } from "lucide-react"

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  showTown?: boolean
}

export function BottomNav({ activeTab, onTabChange, showTown = true }: BottomNavProps) {
  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "town", label: "Town", icon: Castle },
    { id: "temple", label: "Temple", icon: Church },
    { id: "market", label: "Market", icon: Store },
    { id: "mining", label: "Mining", icon: Pickaxe },
    { id: "social", label: "Social", icon: Users },
    { id: "profile", label: "Profile", icon: User },
    { id: "info", label: "Info", icon: BookOpen },
  ]
  const visibleTabs = showTown ? tabs : tabs.filter((tab) => tab.id !== "town")

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border shadow-lg z-40">
      <div className="flex items-center justify-around max-w-2xl mx-auto">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors touch-manipulation min-h-[44px] ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
