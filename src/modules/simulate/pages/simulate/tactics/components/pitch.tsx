import { useRef } from 'react';
import type { Player } from '../data';
import type { PlayerOnPitch } from '../use-tactics';
import { GhostGrid } from './ghost-grid';
import { FreePitchPlayer } from './free-pitch-player';

interface PitchProps {
    onPitch: PlayerOnPitch[];
    draggingPlayer: Player | null;
    onDragStart: (e: React.DragEvent<HTMLDivElement>, player: Player) => void;
    onDragEnd: (playerId: string, dropX: number, dropY: number) => void;
    onClearAnimating: (playerId: string) => void;
    // Legacy: for dropping from squad list
    onDropFromList: (e: React.DragEvent<HTMLDivElement>, x: number, y: number) => void;
}

// ── Pitch SVG markings ────────────────────────────────────────────────────────
function PitchMarkings() {
    const s = 'rgba(255,255,255,0.22)';
    const f = 'rgba(255,255,255,0.14)';
    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 420" preserveAspectRatio="none">
            <rect x="8" y="8" width="284" height="404" fill="none" stroke={s} strokeWidth="1.5" rx="2"/>
            <line x1="8" y1="210" x2="292" y2="210" stroke={s} strokeWidth="1.5"/>
            <circle cx="150" cy="210" r="38" fill="none" stroke={f} strokeWidth="1.5"/>
            <circle cx="150" cy="210" r="2.5" fill={s}/>
            <rect x="75" y="8" width="150" height="72" fill="none" stroke={f} strokeWidth="1.2"/>
            <rect x="112" y="8" width="76" height="30" fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1"/>
            <circle cx="150" cy="62" r="2" fill={f}/>
            <path d="M110 80 A38 38 0 0 0 190 80" fill="none" stroke={f} strokeWidth="1.2"/>
            <rect x="124" y="2" width="52" height="10" fill="rgba(255,255,255,0.06)" stroke={f} strokeWidth="1"/>
            <rect x="75" y="340" width="150" height="72" fill="none" stroke={f} strokeWidth="1.2"/>
            <rect x="112" y="382" width="76" height="30" fill="none" stroke="rgba(255,255,255,0.11)" strokeWidth="1"/>
            <circle cx="150" cy="358" r="2" fill={f}/>
            <path d="M110 340 A38 38 0 0 1 190 340" fill="none" stroke={f} strokeWidth="1.2"/>
            <rect x="124" y="410" width="52" height="10" fill="rgba(255,255,255,0.06)" stroke={f} strokeWidth="1"/>
            <path d="M8 20 A10 10 0 0 1 20 8"       fill="none" stroke={f} strokeWidth="1"/>
            <path d="M280 8 A10 10 0 0 1 292 20"    fill="none" stroke={f} strokeWidth="1"/>
            <path d="M8 400 A10 10 0 0 0 20 412"    fill="none" stroke={f} strokeWidth="1"/>
            <path d="M280 412 A10 10 0 0 0 292 400" fill="none" stroke={f} strokeWidth="1"/>
        </svg>
    );
}

function GrassStripes() {
    return (
        <>
            {Array.from({ length: 8 }).map((_, i) => (
                <div
                    key={i}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                        top: `${(i / 8) * 100}%`,
                        height: `${100 / 8}%`,
                        background: i % 2 === 0 ? 'rgba(0,0,0,0.055)' : 'transparent',
                    }}
                />
            ))}
        </>
    );
}

export function Pitch({ onPitch, draggingPlayer, onDragStart, onDragEnd, onClearAnimating, onDropFromList }: PitchProps) {
    const pitchRef = useRef<HTMLDivElement>(null);

    const toPercent = (e: React.DragEvent<HTMLDivElement>): { x: number; y: number } => {
        const rect = pitchRef.current!.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width)  * 100;
        const y = ((e.clientY - rect.top)  / rect.height) * 100;
        return {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
        };
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const { x, y } = toPercent(e);

        const raw = e.dataTransfer.getData('player');
        if (!raw) return;

        try {
            const player = JSON.parse(raw) as Player;
            const source = e.dataTransfer.getData('source');
            if (source === 'pitch') {
                // Player dragged from pitch → snap/return
                onDragEnd(player.id, x, y);
            } else {
                // Player dragged from squad list → find nearest slot and assign
                onDropFromList(e, x, y);
            }
        } catch { /* ignore */ }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    return (
        <div
            ref={pitchRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="relative select-none"
            style={{
                width: '100%',
                aspectRatio: '3 / 4',
                maxWidth: 500,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 24px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05)',
            }}
        >
            {/* Grass */}
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(175deg, #1b5230 0%, #1e5e34 30%, #1a5230 60%, #1e5e34 100%)' }}
            />
            <GrassStripes />
            <PitchMarkings />

            {/* Layer 1: Ghost grid */}
            <GhostGrid visible={!!draggingPlayer} draggingPlayer={draggingPlayer} />

            {/* Layer 2: Active players */}
            <div className="absolute inset-0" style={{ zIndex: 10 }}>
                {onPitch.map(entry => (
                    <FreePitchPlayer
                        key={entry.player.id}
                        entry={entry}
                        isDragging={draggingPlayer?.id === entry.player.id}
                        onDragStart={onDragStart}
                        onAnimationEnd={onClearAnimating}
                    />
                ))}
            </div>
        </div>
    );
}