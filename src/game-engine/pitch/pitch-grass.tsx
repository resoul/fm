import type { PitchTheme } from "./types";

export function PitchGrass({ pattern, grassColor, grassAltColor, stripeCount }: PitchTheme) {
    if (pattern === 'checker') {
        return (
            <div className="absolute inset-0 grid grid-cols-10 grid-rows-6 opacity-10 pointer-events-none">
                {Array.from({
                    length: 60,
                }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            background:
                                i % 2 === 0
                                    ? grassAltColor
                                    : grassColor,
                        }}
                    />
                ))}
            </div>
        )
    }

    if (pattern === 'diagonal') {
        return (
            <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: `
              repeating-linear-gradient(
                45deg,
                ${grassAltColor},
                ${grassAltColor} 40px,
                ${grassColor} 40px,
                ${grassColor} 80px
              )
            `,
                }}
            />
        )
    }

    return (
        <div className="absolute inset-0 flex opacity-20 pointer-events-none">
            {Array.from({
                length: stripeCount,
            }).map((_, i) => (
                <div
                    key={i}
                    className="flex-1"
                    style={{
                        background:
                            i % 2 === 0
                                ? grassAltColor
                                : grassColor,
                    }}
                />
            ))}
        </div>
    )
}