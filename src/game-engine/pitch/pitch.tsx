import type { PitchTheme } from "./types";
import { createPitchLayout } from "./pitch-layout";
import { PitchGrass } from "./pitch-grass";

type PitchProps = {
    layout: ReturnType<typeof createPitchLayout>
    theme: PitchTheme
}

export function Pitch({ layout, theme }: PitchProps) {
    const {
        width,
        height,
        centerCircleRadius,
        penaltyArea,
        penaltyAreaDepth,
        goalArea,
        goalAreaDepth,
        penaltySpotDistance,
        cornerRadius,
        goal
    } = layout
    const { grassColor, lineWidth, lineColor } = theme
    const centerX = width / 2
    const centerY = height / 2

    return (
        <div
            style={{ width: width, height: height, backgroundColor: grassColor}}
            className="relative overflow-hidden shadow-2xl">
            {PitchGrass(theme)}

            {/* BORDER */}
            <div
                className="absolute inset-0"
                style={{
                    border: `${lineWidth}px solid ${lineColor}`,
                }}
            />

            {/* CENTER LINE */}
            <div
                className="absolute top-0 h-full"
                style={{
                    left:centerX - lineWidth / 2,
                    width: lineWidth,
                    background: lineColor,
                }}
            />

            {/* CENTER CIRCLE */}
            <div
                className="absolute rounded-full"
                style={{
                    left: centerX - centerCircleRadius,
                    top: centerY - centerCircleRadius,
                    width: centerCircleRadius * 2,
                    height: centerCircleRadius * 2,
                    border: `${lineWidth}px solid ${lineColor}`,
                }}
            />

            {/* CENTER SPOT */}
            <div
                className="absolute rounded-full"
                style={{
                    left: centerX - 4,
                    top: centerY - 4,
                    width: 8,
                    height: 8,
                    background: lineColor,
                }}
            />

            {/* LEFT PENALTY */}
            <div
                className="absolute"
                style={{
                    left: 0,
                    top: centerY - penaltyArea / 2,
                    width: penaltyAreaDepth,
                    height: penaltyArea,
                    border: `${lineWidth}px solid ${lineColor}`,
                    borderLeft: 0,
                }}
            />

            {/* RIGHT PENALTY */}
            <div
                className="absolute"
                style={{
                    right: 0,
                    top: centerY - penaltyArea / 2,
                    width: penaltyAreaDepth,
                    height: penaltyArea,
                    border: `${lineWidth}px solid ${lineColor}`,
                    borderRight: 0,
                }}
            />

            {/* LEFT GOAL AREA */}
            <div
                className="absolute"
                style={{
                    left: 0,
                    top: centerY - goalArea / 2,
                    width: goalAreaDepth,
                    height: goalArea,
                    border: `${lineWidth}px solid ${lineColor}`,
                    borderLeft: 0,
                }}
            />

            {/* RIGHT GOAL AREA */}
            <div
                className="absolute"
                style={{
                    right: 0,
                    top: centerY - goalArea / 2,
                    width: goalAreaDepth,
                    height: goalArea,
                    border: `${lineWidth}px solid ${lineColor}`,
                    borderRight: 0,
                }}
            />

            {/* LEFT PENALTY SPOT */}
            <div
                className="absolute rounded-full"
                style={{
                    left: penaltySpotDistance - 3,
                    top: centerY - 3,
                    width: 6,
                    height: 6,
                    background: lineColor,
                }}
            />

            {/* RIGHT PENALTY SPOT */}
            <div
                className="absolute rounded-full"
                style={{
                    right: penaltySpotDistance - 3,
                    top: centerY - 3,
                    width: 6,
                    height: 6,
                    background: lineColor,
                }}
            />

            {/* LEFT GOAL */}
            <div
                className="absolute"
                style={{
                    left: 0,
                    top: centerY - goal / 2,
                    width: '2px',
                    height: goal,
                    border: `${lineWidth}px solid ${lineColor}`,
                }}
            />

            {/* RIGHT GOAL */}
            <div
                className="absolute"
                style={{
                    right: 0,
                    top: centerY - goal / 2,
                    width: '2px',
                    height: goal,
                    border: `${lineWidth}px solid ${lineColor}`,
                }}
            />

            {/* CORNERS */}
            {[
                {left: 0, top: 0, borders: 'border-r border-b rounded-br-full'},
                {right: 0, top: 0, borders: 'border-l border-b rounded-bl-full'},
                {left: 0, bottom: 0, borders: 'border-r border-t rounded-tr-full'},
                {right: 0, bottom: 0, borders: 'border-l border-t rounded-tl-full'},
            ].map((corner, i) => (
                <div
                    key={i}
                    className={`absolute ${corner.borders}`}
                    style={{
                        ...corner,
                        width: cornerRadius * 2,
                        height: cornerRadius * 2,
                        borderWidth: lineWidth,
                        borderColor: lineColor,
                    }}
                />
            ))}
        </div>
    )
}
