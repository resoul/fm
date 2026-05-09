import { useState, useCallback, useMemo } from 'react';
import { Pitch } from '../tactics/components/pitch';
import { PlayerList } from '../tactics/components/player-list';
import { useTactics } from '../tactics/use-tactics';
import { FORMATIONS } from '../tactics/formations';
import { GHOST_SLOTS, SNAP_RADIUS } from '../tactics/ghost-grid';
import { ChevronDown, RefreshCcw, Wand2, Trash2 } from 'lucide-react';
import { setPlayerDragImage } from '../tactics/components/drag-image';
import { ScrollArea } from "@/components/scroll-area";
import type { Club, MatchLineup, PlayerProfile } from '../engine/types';
import { profileToPlayer, type Player } from '../tactics/data';

interface TacticsSelectorProps {
    club: Club;
    onConfirm: (lineup: MatchLineup) => void;
    label: string;
}

export function TacticsSelector({ club, onConfirm, label }: TacticsSelectorProps) {
    // Convert club squad to tactics players
    const tacticsPlayers = useMemo(() => club.squad.map(profileToPlayer), [club.squad]);

    const {
        formation,
        formationKey,
        assignments,
        onPitch,
        handleFormationChange,
        movePlayer,
        snapOrReturn,
        removePlayer,
        clearAnimating,
        autoPick,
        clearPitch,
    } = useTactics(tacticsPlayers);

    const [draggingPlayer, setDraggingPlayer] = useState<Player | null>(null);
    const [formationMenuOpen, setFormationMenuOpen] = useState(false);

    // ── Drag handlers ──────────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, player: Player) => {
        e.dataTransfer.setData('player', JSON.stringify(player));
        e.dataTransfer.setData('source', 'pitch');
        setDraggingPlayer(player);
    };

    const handleDragEnd = (playerId: string, dropX: number, dropY: number) => {
        setDraggingPlayer(null);
        snapOrReturn(playerId, dropX, dropY, SNAP_RADIUS);
    };

    const handleDropFromList = (e: React.DragEvent<HTMLDivElement>, x: number, y: number) => {
        setDraggingPlayer(null);
        try {
            const player = JSON.parse(e.dataTransfer.getData('player')) as Player;
            let nearest = GHOST_SLOTS[0];
            let nearestDist = Infinity;
            for (const slot of GHOST_SLOTS) {
                const dx = slot.x - x;
                const dy = slot.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = slot;
                }
            }
            if (nearestDist <= 15) {
                movePlayer(player, nearest.id);
            }
        } catch { /* ignore */ }
    };

    const handleListDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDraggingPlayer(null);
        try {
            const player = JSON.parse(e.dataTransfer.getData('player')) as Player;
            removePlayer(player.id);
        } catch { /* ignore */ }
    };

    const handleConfirmSelection = () => {
        if (onPitch.length !== 11) return;

        // Map onPitch back to MatchLineup
        // The simulation expects startingXI to be in formation slot order.
        // We need to find which player is at which formation slot.
        const startingXI: string[] = formation.positions.map(slot => {
            // Find ghost slot nearest to this formation slot
            let bestGhost = GHOST_SLOTS[0];
            let bestDist = Infinity;
            for (const g of GHOST_SLOTS) {
                const d = Math.sqrt((g.x - slot.x) ** 2 + (g.y - slot.y) ** 2);
                if (d < bestDist) { bestDist = d; bestGhost = g; }
            }
            
            // Find player at this ghost slot
            const entry = onPitch.find(p => p.slotId === bestGhost.id);
            return entry?.player.id || '';
        });

        if (startingXI.every(id => id !== '')) {
            onConfirm({
                clubId: club.id,
                formation: formationKey,
                startingXI,
            });
        }
    };

    const assignedCount = onPitch.length;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-1 pt-3 pb-2 relative z-30 bg-[#0f1115]/50 rounded-xl border border-white/5">
                <p className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">{label} - Formation</p>
                <div className="relative">
                    <button
                        onClick={() => setFormationMenuOpen(v => !v)}
                        className="flex items-center gap-2 text-[22px] font-extrabold text-white hover:text-green-300 transition-colors tracking-wide"
                    >
                        {formation.displayName}
                        <ChevronDown size={18} className={`opacity-60 transition-transform ${formationMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {formationMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setFormationMenuOpen(false)} />
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-[#1b1e2b] border border-zinc-700 rounded-xl shadow-2xl overflow-hidden min-w-[220px]">
                                {Object.entries(FORMATIONS).map(([key, f]) => (
                                    <button
                                        key={key}
                                        onClick={() => { handleFormationChange(key); setFormationMenuOpen(false); }}
                                        className={`w-full px-5 py-3 text-left text-sm font-bold transition-colors border-b border-zinc-800 last:border-0
                                ${formationKey === key ? 'bg-green-600/15 text-green-400' : 'text-white hover:bg-white/5'}`}
                                    >
                                        {f.displayName}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                    <button onClick={autoPick} className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold text-amber-400 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors">
                        <Wand2 size={11} /> Auto Pick
                    </button>
                    <button onClick={clearPitch} className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold text-red-400 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors">
                        <Trash2 size={11} /> Clear
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
                {/* Pitch */}
                <div className="col-span-8 flex flex-col items-center justify-center relative">
                    <Pitch
                        onPitch={onPitch}
                        draggingPlayer={draggingPlayer}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClearAnimating={clearAnimating}
                        onDropFromList={handleDropFromList}
                    />
                    
                    <div className="absolute bottom-4 left-4 bg-black/55 backdrop-blur px-2.5 py-1.5 rounded-lg text-xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-green-400">Team OVR</div>
                        <div className="flex items-center gap-1 text-white text-[11px] mt-0.5">
                            <RefreshCcw size={10} className="text-green-400" /> Calculating...
                        </div>
                    </div>

                    <div className="absolute bottom-4 right-4 bg-black/55 backdrop-blur px-2 py-1 rounded-lg text-[11px] text-gray-400">
                        <span className={assignedCount === 11 ? 'text-green-400 font-bold' : ''}>{assignedCount}</span>
                        <span className="text-gray-600"> / 11</span>
                    </div>
                </div>

                {/* Squad list */}
                <div className="col-span-4 h-[500px]">
                    <PlayerList
                        players={tacticsPlayers}
                        assignments={assignments}
                        positions={formation.positions}
                        onDragStart={(e, player) => { setPlayerDragImage(e, player); handleDragStart(e, player); }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleListDrop}
                        onAssign={(player, slotId) => movePlayer(player, slotId)}
                    />
                </div>
            </div>

            <button
                onClick={handleConfirmSelection}
                disabled={assignedCount !== 11}
                className={`mt-4 w-full py-4 rounded-xl font-bold text-lg transition-all
                    ${assignedCount === 11 
                        ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20' 
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'}`}
            >
                {assignedCount === 11 ? 'Confirm Lineup' : `Select ${11 - assignedCount} more players`}
            </button>
        </div>
    );
}
