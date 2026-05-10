import type { Player } from '../data';
import type { PlayerOnPitch } from '../use-tactics';
import { setPlayerDragImage } from './drag-image';

interface FreePitchPlayerProps {
    entry: PlayerOnPitch;
    isDragging: boolean;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, player: Player) => void;
    onAnimationEnd: (playerId: string) => void;
}

const DUTY_COLOR: Record<string, string> = {
    Attack: '#8b5cf6', attack: '#8b5cf6',
    Support: '#27ae60', support: '#27ae60',
    Defend: '#e74c3c', defend: '#e74c3c',
};
const DUTY_ABBR: Record<string, string> = {
    Attack: 'At', attack: 'At',
    Support: 'Su', support: 'Su',
    Defend: 'De', defend: 'De',
};

function PlayerShirt({ number, isGK }: { number: number; isGK: boolean }) {
    const fill    = isGK ? '#1a7a6e' : '#1c1c2e';
    const collar  = isGK ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.25)';
    const numColor = isGK ? '#ffffff' : '#f5a623';
    return (
        <svg width="68" height="68" viewBox="0 0 40 40"
             style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.75))' }}>
            <path d="M8 12 L4 18 L10 20 L10 34 L30 34 L30 20 L36 18 L32 12 L26 10 Q20 14 14 10 Z"
                  fill={fill} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
            {isGK && <path d="M10 20 L10 34 L20 34 L20 20 Z M20 27 L30 27 L30 34 L20 34 Z" fill="rgba(255,255,255,0.06)" />}
            <path d="M14 10 Q20 16 26 10" fill="none" stroke={collar} strokeWidth="1" />
            <path d="M8 12 L4 18 L10 20 L10 16" fill="rgba(255,255,255,0.07)" />
            <path d="M32 12 L36 18 L30 20 L30 16" fill="rgba(255,255,255,0.07)" />
            <text x="20" y="26" textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="bold" fill={numColor} fontFamily="Georgia, serif">
                {number}
            </text>
        </svg>
    );
}

export function FreePitchPlayer({ entry, isDragging, onDragStart, onAnimationEnd }: FreePitchPlayerProps) {
    const { player, x, y, animating } = entry;
    const isGK      = player.position === 'GK';
    const dutyColor = DUTY_COLOR[player.duty] ?? '#888';
    const dutyAbbr  = DUTY_ABBR[player.duty] ?? player.duty.slice(0, 2);
    const shortName = player.name.length > 11 ? player.name.split(' ').pop()! : player.name;

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        setPlayerDragImage(e, player);
        e.dataTransfer.setData('player', JSON.stringify(player));
        e.dataTransfer.setData('source', 'pitch');
        onDragStart(e, player);
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onTransitionEnd={() => { if (animating) onAnimationEnd(player.id); }}
            style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'grab',
                zIndex: isDragging ? 50 : 10,
                opacity: isDragging ? 0.35 : 1,
                // Animate position transitions (formation changes & snaps)
                transition: animating
                    ? 'left 0.45s cubic-bezier(0.34,1.56,0.64,1), top 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s'
                    : 'opacity 0.2s',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}
            className="group"
        >
            {/* Shirt */}
            <div
                className="transition-transform group-hover:scale-110"
                style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.7))' }}
            >
                <PlayerShirt number={player.number} isGK={isGK} />
            </div>

            {/* Name badge */}
            <div
                style={{
                    background: 'rgba(15,15,25,0.92)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6,
                    padding: '3px 7px',
                    marginTop: 0,
                    minWidth: 82,
                    maxWidth: 111,
                    textAlign: 'center',
                    backdropFilter: 'blur(4px)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#d4d4d4', letterSpacing: '0.03em', fontFamily: 'monospace' }}>
                        {player.role}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>–</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: dutyColor, fontFamily: 'monospace' }}>
                        {dutyAbbr}
                    </span>
                </div>
                <div style={{
                    fontSize: 13, color: '#f0f0f0', fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: 'system-ui, sans-serif',
                }}>
                    {shortName}
                </div>
            </div>
        </div>
    );
}