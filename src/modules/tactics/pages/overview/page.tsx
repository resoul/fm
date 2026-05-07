import { useState } from 'react';
import { SQUAD_PLAYERS, type Player } from './data';
import { Pitch } from './components/pitch';
import { PlayerList } from './components/player-list';
import { Helmet } from 'react-helmet-async';
import { useTactics } from './use-tactics';
import { FORMATIONS } from './formations';
import { GHOST_SLOTS, SNAP_RADIUS } from './ghost-grid';
import { ChevronDown, RefreshCcw, Wand2, Trash2 } from 'lucide-react';
import { setPlayerDragImage } from './components/drag-image';
import { ScrollArea } from "@/components/scroll-area";

export function OverviewPage() {
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
    } = useTactics(SQUAD_PLAYERS);

    const [draggingPlayer, setDraggingPlayer] = useState<Player | null>(null);
    const [formationMenuOpen, setFormationMenuOpen] = useState(false);

    // ── Drag handlers ──────────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, player: Player) => {
        e.dataTransfer.setData('player', JSON.stringify(player));
        setDraggingPlayer(player);
    };

    const handleDragEnd = (playerId: string, dropX: number, dropY: number) => {
        setDraggingPlayer(null);
        snapOrReturn(playerId, dropX, dropY, SNAP_RADIUS);
    };

    // Drop from squad list onto pitch — snap to nearest ghost slot
    const handleDropFromList = (e: React.DragEvent<HTMLDivElement>, x: number, y: number) => {
        setDraggingPlayer(null);
        try {
            const player = JSON.parse(e.dataTransfer.getData('player')) as Player;

            // Find nearest ghost slot and its distance
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
            // Only place if dropped reasonably close to a ghost slot (within 15%)
            if (nearestDist <= 15) {
                movePlayer(player, nearest.id);
            }
        } catch { /* ignore */ }
    };

    // Drop onto squad list = remove from pitch
    const handleListDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDraggingPlayer(null);
        try {
            const player = JSON.parse(e.dataTransfer.getData('player')) as Player;
            removePlayer(player.id);
        } catch { /* ignore */ }
    };

    const assignedCount = onPitch.length;

    return (
        <>
            <Helmet>
                <title>Tactics | Football Manager</title>
            </Helmet>
            <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
                <ScrollArea className="h-full">
                    <div className="pr-2 p-4 space-y-4" onDragEnd={() => setDraggingPlayer(null)}>
                        <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-3 pb-2 relative z-30 bg-[#0f1115] border-b border-white/5">
                            <p className="text-[10px] font-bold tracking-[0.18em] text-gray-500 uppercase">Formation</p>

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
                        <div className="flex-1 overflow-hidden px-4 pb-4 pt-3 relative z-10">
                            <div className="grid grid-cols-12 gap-4 h-full max-w-[1920px] mx-auto">

                                {/* Pitch */}
                                <div className="col-span-8 flex items-center justify-center relative">
                                    <Pitch
                                        onPitch={onPitch}
                                        draggingPlayer={draggingPlayer}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                        onClearAnimating={clearAnimating}
                                        onDropFromList={handleDropFromList}
                                    />

                                    {/* Team Fluidity */}
                                    <div className="absolute bottom-2 left-2 bg-black/55 backdrop-blur px-2.5 py-1.5 rounded-lg text-xs">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-green-400">Team Fluidity</div>
                                        <div className="flex items-center gap-1 text-white text-[11px] mt-0.5">
                                            <RefreshCcw size={10} className="text-green-400" /> Fluid
                                        </div>
                                    </div>

                                    {/* Player count */}
                                    <div className="absolute bottom-2 right-2 bg-black/55 backdrop-blur px-2 py-1 rounded-lg text-[11px] text-gray-400">
                                        <span className={assignedCount === 11 ? 'text-green-400 font-bold' : ''}>{assignedCount}</span>
                                        <span className="text-gray-600"> / 11</span>
                                    </div>
                                </div>

                                {/* Squad list */}
                                <div className="col-span-4 h-full overflow-hidden">
                                    <PlayerList
                                        players={SQUAD_PLAYERS}
                                        assignments={assignments}
                                        positions={formation.positions}
                                        onDragStart={(e, player) => { setPlayerDragImage(e, player); handleDragStart(e, player); }}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={handleListDrop}
                                        onAssign={(player, slotId) => movePlayer(player, slotId)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}