import { useRef, useCallback, useEffect, useState } from 'react'
import { createBallState, kickBall, stepBall } from './physics'
import type { BallState, BallPhysicsConfig, KickParams } from './types'

type UsePhysicsOptions = {
    initialX?: number
    initialY?: number
    config?: BallPhysicsConfig
    onBounce?: (ball: BallState) => void
    onStop?: (ball: BallState) => void
}

export function usePhysics({
                                   initialX = 52.5,
                                   initialY = 34,
                                   config,
                                   onBounce,
                                   onStop,
                               }: UsePhysicsOptions = {}) {
    // Use ref for the physics state — avoids stale closure issues in rAF
    const ballRef = useRef<BallState>(createBallState(initialX, initialY))
    const prevBouncesRef = useRef(0)
    const rafRef = useRef<number | null>(null)
    const lastTimeRef = useRef<number | null>(null)
    const wasMovingRef = useRef(false)

    // Exposed React state — updated every frame for rendering
    const [ball, setBall] = useState<BallState>(ballRef.current)

    const tick = useCallback((ts: number) => {
        if (lastTimeRef.current === null) lastTimeRef.current = ts
        const dt = (ts - lastTimeRef.current) / 1000
        lastTimeRef.current = ts

        const prev = ballRef.current
        const next = stepBall(prev, dt, config)
        ballRef.current = next

        // Bounce callback
        if (next.bounces > prevBouncesRef.current) {
            prevBouncesRef.current = next.bounces
            onBounce?.(next)
        }

        // Stop callback — fires once when ball transitions to stopped
        if (!next.isMoving && wasMovingRef.current) {
            wasMovingRef.current = false
            onStop?.(next)
        } else if (next.isMoving) {
            wasMovingRef.current = true
        }

        setBall(next)
        rafRef.current = requestAnimationFrame(tick)
    }, [config, onBounce, onStop])

    // Start loop on mount, clean up on unmount
    useEffect(() => {
        rafRef.current = requestAnimationFrame(tick)
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        }
    }, [tick])

    const kick = useCallback((params: KickParams) => {
        ballRef.current = kickBall(ballRef.current, params)
        prevBouncesRef.current = 0
        lastTimeRef.current = null
    }, [])

    const teleport = useCallback((x: number, y: number, z = 0) => {
        ballRef.current = createBallState(x, y, z)
        prevBouncesRef.current = 0
        setBall(ballRef.current)
    }, [])

    const reset = useCallback(() => {
        teleport(initialX, initialY)
    }, [teleport, initialX, initialY])

    return { ball, kick, teleport, reset }
}