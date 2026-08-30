import { useRef, useState, useEffect } from 'react';
import type { Player } from '../data';
import { MoreHorizontal } from 'lucide-react';
import type { GridPosition } from '../formations';

interface PlayerListProps {
    players: Player[];
    assignments: Record<string, Player>;    // slotId -> Player
    positions: GridPosition[];
    onDragStart: (e: React.DragEvent<HTMLDivElement>, player: Player) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onAssign: (player: Player, slotId: string) => void;
}

export function PlayerList({
                               players, assignments, positions,
                               onDragStart, onDrop, onDragOver, onAssign,
                           }: PlayerListProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node))
                setOpenMenuId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const assignedIds = new Set(Object.values(assignments).map(p => p.id));

    const sorted = [...players].sort((a, b) => {
        const aOn = assignedIds.has(a.id);
        const bOn = assignedIds.has(b.id);
        return aOn === bOn ? 0 : aOn ? -1 : 1;
    });

    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            className="bg-[#1b1e2b] text-gray-300 rounded-lg shadow-lg border border-zinc-800 h-full flex flex-col text-xs font-medium relative"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-2 border-b border-zinc-800 bg-[#252836]">
                <div className="font-bold text-white uppercase tracking-wider text-xs">Squad</div>
                <div className="flex items-center gap-2">
                    <button className="px-2 py-0.5 bg-[#374151] rounded text-white text-[10px] hover:bg-[#4b5563]">
                        Filter
                    </button>
                    <span className="text-[10px] text-gray-400">{assignedIds.size} / 11</span>
                </div>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[32px_52px_1fr_28px] gap-2 p-2 border-b border-zinc-800 bg-[#2b2f3e] text-gray-500 uppercase text-[10px]">
                <div className="text-center">PK</div>
                <div className="text-center">Pos</div>
                <div>Player</div>
                <div />
            </div>

            <div className="flex-1 overflow-y-auto pb-10">
                {sorted.map(player => {
                    const isOn = assignedIds.has(player.id);
                    const menuOpen = openMenuId === player.id;

                    return (
                        <div
                            key={player.id}
                            draggable
                            onDragStart={e => onDragStart(e, player)}
                            className={`grid grid-cols-[32px_52px_1fr_28px] gap-2 p-2 border-b border-zinc-800
                                hover:bg-[#2c3040] items-center cursor-grab select-none relative
                                ${isOn ? 'bg-[#1a4a2c]/25' : ''}`}
                        >
                            <div className={`text-center font-bold ${isOn ? 'text-green-400' : 'text-gray-600'}`}>
                                {isOn ? '✓' : '-'}
                            </div>
                            <div className="text-center font-bold text-blue-300 truncate text-[10px]">
                                {player.position}
                            </div>
                            <div
                                className="flex items-center gap-1.5 truncate cursor-pointer hover:text-green-400 transition-colors"
                                onClick={() => (window.location.href = `/team/player/${player.id}`)}
                            >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${isOn ? 'bg-green-600' : 'bg-gray-700'}`}>
                                    {player.number}
                                </div>
                                <span className={`font-semibold truncate ${isOn ? 'text-green-100' : 'text-white'}`}>
                                    {player.name}
                                </span>
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : player.id); }}
                                    className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                >
                                    <MoreHorizontal size={14} />
                                </button>
                                {menuOpen && (
                                    <div
                                        ref={menuRef}
                                        className="absolute right-8 top-0 z-50 w-64 bg-[#252836] border border-zinc-700 rounded-md shadow-2xl overflow-hidden"
                                        style={{ transform: 'translateY(10px)' }}
                                    >
                                        <div className="px-3 py-2 bg-[#1b1e2b] border-b border-zinc-700 text-[10px] font-bold text-gray-400 uppercase">
                                            Assign Position
                                        </div>
                                        <div className="max-h-64 overflow-y-auto">
                                            {positions.map(pos => {
                                                const occupant = assignments[pos.id];
                                                const isSelf = occupant?.id === player.id;
                                                return (
                                                    <button
                                                        key={pos.id}
                                                        disabled={isSelf}
                                                        onClick={e => { e.stopPropagation(); onAssign(player, pos.id); setOpenMenuId(null); }}
                                                        className={`w-full text-left px-3 py-2 hover:bg-[#374151] flex items-center justify-between
                                                            transition-colors border-b border-zinc-700/50 last:border-0
                                                            ${isSelf ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-yellow-500 w-10">{pos.label}</span>
                                                            {occupant
                                                                ? <span className="text-white truncate">{occupant.name}</span>
                                                                : <span className="text-gray-500 italic">Empty</span>}
                                                        </div>
                                                        {!isSelf && (
                                                            <div className={`text-[9px] px-1.5 rounded uppercase font-bold ${occupant ? 'bg-blue-600/20 text-blue-400' : 'bg-green-600/20 text-green-400'}`}>
                                                                {occupant ? 'Swap' : 'Assign'}
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}