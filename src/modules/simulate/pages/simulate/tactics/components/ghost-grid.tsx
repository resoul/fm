import type { Player } from '../data';
import { GHOST_SLOTS, getSlotRating, ratingToColor } from '../ghost-grid';

interface GhostGridProps {
    visible: boolean;
    draggingPlayer: Player | null;
}

function GhostShirt({
                        isGK,
                        color,
                        isDragging,
                    }: {
    isGK: boolean;
    color: string | null;
    isDragging: boolean;
}) {
    const baseFill   = isGK ? 'rgba(150,60,40,0.18)' : 'rgba(255,255,255,0.07)';
    const baseStroke = isGK ? 'rgba(200,100,70,0.45)' : 'rgba(255,255,255,0.28)';

    const fill   = isDragging && color ? `${color}28` : baseFill;
    const stroke = isDragging && color ? color         : baseStroke;
    const strokeW = isDragging && color ? '1.6'        : '1';

    return (
        <svg
            width="52"
            height="52"
            viewBox="0 0 40 40"
            style={{
                filter: isDragging && color
                    ? `drop-shadow(0 0 5px ${color}88)`
                    : undefined,
                transition: 'filter 0.2s ease',
            }}
        >
            <path
                d="M8 12 L4 18 L10 20 L10 34 L30 34 L30 20 L36 18 L32 12 L26 10 Q20 14 14 10 Z"
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeW}
                style={{ transition: 'fill 0.2s ease, stroke 0.2s ease' }}
            />
            <path d="M14 10 Q20 16 26 10" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            <path d="M8 12 L4 18 L10 20 L10 16" fill="rgba(255,255,255,0.03)" />
            <path d="M32 12 L36 18 L30 20 L30 16" fill="rgba(255,255,255,0.03)" />
        </svg>
    );
}

export function GhostGrid({ visible, draggingPlayer }: GhostGridProps) {
    const isDragging = !!draggingPlayer;

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.25s ease',
                zIndex: 5,
            }}
        >
            {GHOST_SLOTS.map(slot => {
                const rating = draggingPlayer
                    ? getSlotRating(draggingPlayer.positionRatings, slot.posLabel)
                    : null;
                const color = rating !== null ? ratingToColor(rating) : null;

                return (
                    <div
                        key={slot.id}
                        style={{
                            position: 'absolute',
                            left: `${slot.x}%`,
                            top: `${slot.y}%`,
                            transform: 'translate(-50%, -50%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                        }}
                    >
                        <GhostShirt
                            isGK={slot.isGK}
                            color={color}
                            isDragging={isDragging}
                        />
                    </div>
                );
            })}
        </div>
    );
}