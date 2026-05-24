import { createPitchLayout } from "@/game-engine/pitch/pitch-layout";

type PitchGridProps = {
    layout: ReturnType<typeof createPitchLayout>
    cellSize: number
}

export function PitchGrid({layout, cellSize}: PitchGridProps) {
    const { metersToPx, cols, rows, width, height } = layout
    const cellPx = metersToPx(cellSize)

    return (
        <div style={{ width: width, height: height}} className="absolute inset-0 pointer-events-none">
            {/* vertical */}

            {Array.from({
                length: cols(cellSize) + 1,
            }).map((_, i) => (
                <div
                    key={i}
                    className="absolute top-0 bottom-0"
                    style={{
                        left: i * cellPx,
                        width: 1,
                        background: 'rgba(255,255,255,0.08)',
                    }}
                />
            ))}

            {/* horizontal */}

            {Array.from({
                length: rows(cellSize) + 1,
            }).map((_, i) => (
                <div
                    key={i}
                    className="absolute left-0 right-0"
                    style={{
                        top: i * cellPx,
                        height: 1,
                        background: 'rgba(255,255,255,0.08)',
                    }}
                />
            ))}
        </div>
    )
}