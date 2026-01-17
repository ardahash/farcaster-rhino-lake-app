"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getTownModelForLevel } from "@/lib/game-state"

function TownModel({ src }: { src: string }) {
  const { scene } = useGLTF(src)
  return <primitive object={scene} />
}

function FitBounds({ refreshKey }: { refreshKey: string }) {
  const bounds = useBounds()

  useEffect(() => {
    bounds.refresh().fit()
  }, [bounds, refreshKey])

  return null
}

export function TownViewer({ level }: { level: number }) {
  const [isMounted, setIsMounted] = useState(false)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const model = useMemo(() => getTownModelForLevel(level), [level])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const rotateBy = (delta: number) => {
    const controls = controlsRef.current
    if (!controls) return
    controls.rotateLeft(delta)
    controls.update()
  }

  return (
    <div className="relative w-full aspect-[4/3] rounded-lg border border-border bg-gradient-to-b from-muted/20 to-muted/70 overflow-hidden">
      {!isMounted ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading town...</div>
      ) : (
        <Canvas
          className="touch-none"
          camera={{ position: [0, 1.2, 4], fov: 45 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 6, 4]} intensity={1.1} />
          <directionalLight position={[-4, 3, -2]} intensity={0.5} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.15}>
              <FitBounds refreshKey={model.src} />
              <TownModel src={model.src} />
            </Bounds>
          </Suspense>
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableZoom={false}
            minPolarAngle={0.4}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Canvas>
      )}

      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3">
        <Button
          size="icon"
          variant="secondary"
          aria-label="Rotate town left"
          onClick={() => rotateBy(Math.PI / 8)}
          className="h-9 w-9 rounded-full"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="rounded-full border border-border bg-card/80 px-4 py-1 text-xs font-semibold text-foreground backdrop-blur">
          Town View
        </div>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Rotate town right"
          onClick={() => rotateBy(-Math.PI / 8)}
          className="h-9 w-9 rounded-full"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
