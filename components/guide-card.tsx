"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei"
import { Card } from "@/components/ui/card"

function GuideModel({ src }: { src: string }) {
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

export function GuideCard({
  title,
  description,
  modelSrc,
}: {
  title: string
  description: string
  modelSrc: string
}) {
  const [isMounted, setIsMounted] = useState(false)
  const modelKey = useMemo(() => modelSrc, [modelSrc])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <Card className="game-card w-full max-w-md p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="relative w-full aspect-[4/3] rounded-lg border border-border bg-gradient-to-b from-muted/20 to-muted/70 overflow-hidden">
        {!isMounted ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading guide...
          </div>
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
              <Bounds fit clip observe margin={1.2}>
                <FitBounds refreshKey={modelKey} />
                <GuideModel src={modelSrc} />
              </Bounds>
            </Suspense>
            <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.4} maxPolarAngle={Math.PI / 2} />
          </Canvas>
        )}
      </div>
    </Card>
  )
}
