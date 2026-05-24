import type { BallState } from './types'
import type { createPitchLayout } from '../pitch/pitch-layout'
import { BALL_RADIUS_M } from './physics'

type BallProps = {
    ball: BallState
    layout: ReturnType<typeof createPitchLayout>
}

const Z_SCREEN_RATIO = 1.8

export function Ball({ ball, layout }: BallProps) {
    const { metersToPx } = layout

    // Ground projection (shadow anchor)
    const gx = metersToPx(ball.x)
    const gy = metersToPx(ball.y)

    // Lifted projection (actual ball position on screen)
    const lift = ball.z * metersToPx(1) * Z_SCREEN_RATIO
    const bx = gx
    const by = gy - lift

    // Ball radius in pixels — grows slightly with height (cheap perspective)
    const baseR = Math.max(5, metersToPx(BALL_RADIUS_M) * 5.5)
    const r = baseR * (1 + ball.z * 0.018)

    // Shadow: shrinks and fades as ball goes up
    const shadowScale = 1 / (1 + ball.z * 0.18)
    const shadowAlpha = 0.38 * shadowScale
    const shadowRx = r * shadowScale * 1.1
    const shadowRy = shadowRx * 0.35

    // Trail opacity
    const trailLen = ball.trail.length

    return (
        <g>
            {/* ── Trail ── */}
            {ball.trail.length > 1 && ball.trail.map((pt, i) => {
                if (i === 0) return null
                const prev = ball.trail[i - 1]
                const t = i / trailLen
                const liftA = prev.z * metersToPx(1) * Z_SCREEN_RATIO
                const liftB = pt.z * metersToPx(1) * Z_SCREEN_RATIO
                return (
                    <line
                        key={i}
                        x1={metersToPx(prev.x)}
                        y1={metersToPx(prev.y) - liftA}
                        x2={metersToPx(pt.x)}
                        y2={metersToPx(pt.y) - liftB}
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth={t * 2.5}
                        strokeOpacity={t * 0.45}
                        strokeLinecap="round"
                    />
                )
            })}

            {/* ── Height indicator line (only when airborne) ── */}
            {ball.z > 0.3 && (
                <line
                    x1={gx} y1={gy}
                    x2={bx} y2={by}
                    stroke="rgba(0,0,0,0.25)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                />
            )}

            {/* ── Shadow ── */}
            <ellipse
                cx={gx}
                cy={gy}
                rx={shadowRx}
                ry={shadowRy}
                fill={`rgba(0,0,0,${shadowAlpha})`}
            />

            {/* ── Ball body ── */}
            <defs>
                <radialGradient
                    id="ballGrad"
                    cx="38%" cy="35%"
                    r="60%"
                    fx="35%" fy="32%"
                >
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="30%" stopColor="#eeeeee" />
                    <stop offset="100%" stopColor="#777777" />
                </radialGradient>
            </defs>

            <circle
                cx={bx} cy={by} r={r}
                fill="url(#ballGrad)"
                stroke="rgba(0,0,0,0.3)"
                strokeWidth={0.8}
            />

            {/* ── Pentagon patches (rotated with spin) ── */}
            <g transform={`rotate(${(ball.spin * 180) / Math.PI} ${bx} ${by})`}>
                {[
                    [0, 0],
                    [0.42,  0.28],
                    [-0.42,  0.28],
                    [0.26, -0.38],
                    [-0.26, -0.38],
                ].map(([dx, dy], idx) => {
                    const px = bx + dx * r
                    const py = by + dy * r
                    const pr = r * 0.27
                    const pts = Array.from({ length: 5 }, (_, i) => {
                        const a = (i / 5) * Math.PI * 2 - Math.PI / 2
                        return `${px + pr * Math.cos(a)},${py + pr * Math.sin(a)}`
                    }).join(' ')
                    return (
                        <polygon
                            key={idx}
                            points={pts}
                            fill={idx === 0 ? 'rgba(0,0,0,0.38)' : 'rgba(0,0,0,0.18)'}
                            stroke="rgba(0,0,0,0.3)"
                            strokeWidth={0.6}
                        />
                    )
                })}
            </g>

            {/* ── Height label (only when notably airborne) ── */}
            {ball.z > 1 && (
                <g>
                    <rect
                        x={bx - 18} y={by - r - 18}
                        width={36} height={14}
                        rx={3}
                        fill="rgba(0,0,0,0.55)"
                    />
                    <text
                        x={bx} y={by - r - 8}
                        fill="#fff"
                        fontSize={9}
                        fontFamily="monospace"
                        textAnchor="middle"
                        style={{ userSelect: 'none' }}
                    >
                        {ball.z.toFixed(1)}m
                    </text>
                </g>
            )}
        </g>
    )
}