import { useState, useMemo, useCallback } from 'react';
import type { Player } from './data';
import { FORMATIONS, DEFAULT_FORMATION } from './formations';
import { GHOST_SLOTS, SNAP_RADIUS } from './ghost-grid';


// Find the ghost slot nearest to a given (x, y) — used to place players on the ghost grid
function nearestGhost(x: number, y: number) {
    let best = GHOST_SLOTS[0];
    let bestDist = Infinity;
    for (const g of GHOST_SLOTS) {
        const d = Math.sqrt((g.x - x) ** 2 + (g.y - y) ** 2);
        if (d < bestDist) { bestDist = d; best = g; }
    }
    return best;
}

export interface PlayerOnPitch {
    player: Player;
    slotId: string;
    x: number; // % from left
    y: number; // % from top
    animating: boolean;
}

export function useTactics(initialPlayers: Player[]) {
    const [formationKey, setFormationKey] = useState<string>(DEFAULT_FORMATION);
    const [onPitch, setOnPitch] = useState<PlayerOnPitch[]>([]);

    const formation = useMemo(() => FORMATIONS[formationKey], [formationKey]);

    // Legacy: assignments as Record<slotId, Player> for PlayerList compatibility
    const assignments = useMemo(() => {
        const rec: Record<string, Player> = {};
        onPitch.forEach(p => { rec[p.slotId] = p.player; });
        return rec;
    }, [onPitch]);

    // ── Move / snap player to slot ──────────────────────────────────────────
    // movePlayer: toSlotId is a GHOST slot id (ghost-gk, ghost-d1, etc.)
    // or a formation slot id — in the latter case we map to nearest ghost slot.
    const movePlayer = useCallback((player: Player, toSlotId: string) => {
        // Resolve ghost slot — prefer direct ghost id, else find nearest ghost to formation slot
        let ghostSlot = GHOST_SLOTS.find(g => g.id === toSlotId);
        if (!ghostSlot) {
            const formSlot = formation.positions.find(s => s.id === toSlotId);
            if (formSlot) ghostSlot = nearestGhost(formSlot.x, formSlot.y);
        }
        if (!ghostSlot) return;


        // Get role/duty from nearest formation slot to ghost position
        const formSlot = formation.positions.reduce((best, s) => {
            const db = Math.sqrt((best.x - ghostSlot!.x) ** 2 + (best.y - ghostSlot!.y) ** 2);
            const ds = Math.sqrt((s.x - ghostSlot!.x) ** 2 + (s.y - ghostSlot!.y) ** 2);
            return ds < db ? s : best;
        });

        const targetGhostId = ghostSlot.id;

        setOnPitch(prev => {
            const next = [...prev];
            const fromIdx = next.findIndex(p => p.player.id === player.id);
            const occupantIdx = next.findIndex(p => p.slotId === targetGhostId);
            const isFromList = fromIdx === -1;

            // Enforce 11-player limit: block if pitch is full and player is new (from list)
            // and target slot is empty (no swap possible)
            if (isFromList && occupantIdx === -1 && next.length >= 11) {
                return prev;
            }

            if (!isFromList && occupantIdx !== -1 && occupantIdx !== fromIdx) {
                // Pitch→pitch swap: send occupant back to dragged player's old ghost slot
                const prevGhost = GHOST_SLOTS.find(g => g.id === next[fromIdx].slotId) ?? ghostSlot!;
                next[occupantIdx] = {
                    ...next[occupantIdx],
                    slotId: prevGhost.id,
                    x: prevGhost.x,
                    y: prevGhost.y,
                    animating: true,
                };
            } else if (isFromList && occupantIdx !== -1) {
                // List→pitch swap: replace occupant with new player (remove occupant)
                next.splice(occupantIdx, 1);
            }

            const newEntry: PlayerOnPitch = {
                player: { ...player, role: formSlot.defaultRole, duty: formSlot.defaultDuty },
                slotId: targetGhostId,
                x: ghostSlot!.x,
                y: ghostSlot!.y,
                animating: true,
            };

            if (!isFromList) {
                next[fromIdx] = newEntry;
            } else {
                next.push(newEntry);
            }
            return next;
        });
    }, [formation]);

    // ── Update free position (during/after drag) ────────────────────────────
    const updatePosition = useCallback((playerId: string, x: number, y: number) => {
        setOnPitch(prev =>
            prev.map(p => p.player.id === playerId ? { ...p, x, y, animating: false } : p)
        );
    }, []);

    // ── Snap or return after drag ends ──────────────────────────────────────
    // Snaps to nearest GHOST_SLOT (the static 17-slot grid visible on pitch).
    // Role/duty are kept from the player's current values (formation changes handle those).
    const snapOrReturn = useCallback((
        playerId: string,
        dropX: number,
        dropY: number,
        radius: number = SNAP_RADIUS,
    ) => {
        setOnPitch(prev => {
            const idx = prev.findIndex(p => p.player.id === playerId);
            if (idx === -1) return prev;

            const next = [...prev];
            const current = next[idx];

            // Find nearest GHOST slot
            // Restriction: player on the GK slot (g-gk) cannot be dragged to empty non-GK slots
            const isOnGKSlot = current.slotId === 'g-gk';

            let nearest = GHOST_SLOTS[0];
            let nearestDist = Infinity;
            for (const slot of GHOST_SLOTS) {
                const dx = slot.x - dropX;
                const dy = slot.y - dropY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = slot;
                }
            }

            if (nearestDist <= radius) {
                const occupantIdx = next.findIndex(
                    p => p.slotId === nearest.id && p.player.id !== playerId
                );

                // Player on GK slot dragged to empty non-GK slot → return
                if (isOnGKSlot && nearest.id !== 'g-gk' && occupantIdx === -1) {
                    const originalGhost = GHOST_SLOTS.find(g => g.id === current.slotId);
                    next[idx] = { ...current, x: originalGhost?.x ?? current.x, y: originalGhost?.y ?? current.y, animating: true };
                    return next;
                }

                if (occupantIdx !== -1) {
                    // Swap occupant back to current player's slot
                    next[occupantIdx] = {
                        ...next[occupantIdx],
                        slotId: current.slotId,
                        x: current.x,
                        y: current.y,
                        animating: true,
                    };
                    const prevGhost = GHOST_SLOTS.find(g => g.id === current.slotId);
                    if (prevGhost) {
                        next[occupantIdx] = {
                            ...next[occupantIdx],
                            x: prevGhost.x,
                            y: prevGhost.y,
                        };
                    }
                }

                // Snap dragged player to ghost slot
                next[idx] = {
                    ...current,
                    slotId: nearest.id,
                    x: nearest.x,
                    y: nearest.y,
                    animating: true,
                };
            } else {
                // Return to original ghost slot position
                const originalGhost = GHOST_SLOTS.find(g => g.id === current.slotId);
                const returnX = originalGhost?.x ?? current.x;
                const returnY = originalGhost?.y ?? current.y;
                next[idx] = { ...current, x: returnX, y: returnY, animating: true };
            }

            return next;
        });
    }, []);

    // ── Remove from pitch ───────────────────────────────────────────────────
    const removePlayer = useCallback((playerId: string) => {
        setOnPitch(prev => prev.filter(p => p.player.id !== playerId));
    }, []);

    // ── Clear animation flag after transition ───────────────────────────────
    const clearAnimating = useCallback((playerId: string) => {
        setOnPitch(prev =>
            prev.map(p => p.player.id === playerId ? { ...p, animating: false } : p)
        );
    }, []);

    // ── Auto pick ───────────────────────────────────────────────────────────
    const autoPick = useCallback(() => {
        const pool = [...initialPlayers];

        const popBest = (naturalFor: string[], accomplishedFor: string[]): Player | undefined => {
            for (const code of naturalFor) {
                const idx = pool.findIndex(p =>
                    p.position === code || p.position.startsWith(code) || code.startsWith(p.position),
                );
                if (idx !== -1) return pool.splice(idx, 1)[0];
            }
            for (const code of accomplishedFor) {
                const idx = pool.findIndex(p =>
                    p.position === code || p.position.startsWith(code) || code.startsWith(p.position),
                );
                if (idx !== -1) return pool.splice(idx, 1)[0];
            }
            return pool.shift();
        };

        const next: PlayerOnPitch[] = [];
        const usedGhostIds = new Set<string>();

        const pickGhost = (fx: number, fy: number): typeof GHOST_SLOTS[0] => {
            let best = GHOST_SLOTS[0];
            let bestDist = Infinity;
            for (const g of GHOST_SLOTS) {
                if (usedGhostIds.has(g.id)) continue;
                const d = Math.sqrt((g.x - fx) ** 2 + (g.y - fy) ** 2);
                if (d < bestDist) { bestDist = d; best = g; }
            }
            usedGhostIds.add(best.id);
            return best;
        };

        const gkSlot = formation.positions.find(s => s.label === 'GK');
        if (gkSlot) {
            const gk = pool.find(p => p.position === 'GK');
            if (gk) {
                const ghost = pickGhost(gkSlot.x, gkSlot.y);
                next.push({ player: { ...gk, role: gkSlot.defaultRole, duty: gkSlot.defaultDuty }, slotId: ghost.id, x: ghost.x, y: ghost.y, animating: false });
                pool.splice(pool.indexOf(gk), 1);
            }
        }

        formation.positions.forEach(slot => {
            if (slot.label === 'GK') return;
            const p = popBest(slot.naturalFor, slot.accomplishedFor);
            if (p) {
                const ghost = pickGhost(slot.x, slot.y);
                next.push({ player: { ...p, role: slot.defaultRole, duty: slot.defaultDuty }, slotId: ghost.id, x: ghost.x, y: ghost.y, animating: false });
            }
        });

        setOnPitch(next);
    }, [formation, initialPlayers]);

    // ── Clear ───────────────────────────────────────────────────────────────
    const clearPitch = useCallback(() => setOnPitch([]), []);

    // ── Formation change — animate players to new positions ─────────────────
    const handleFormationChange = useCallback((newKey: string) => {
        const newFormation = FORMATIONS[newKey];

        setOnPitch(prev => {
            const pool: PlayerOnPitch[] = [...prev];
            const next: PlayerOnPitch[] = [];

            const popBest = (naturalFor: string[], accomplishedFor: string[]): PlayerOnPitch | undefined => {
                for (const code of naturalFor) {
                    const idx = pool.findIndex(p =>
                        p.player.position === code ||
                        p.player.position.startsWith(code) ||
                        code.startsWith(p.player.position),
                    );
                    if (idx !== -1) return pool.splice(idx, 1)[0];
                }
                for (const code of accomplishedFor) {
                    const idx = pool.findIndex(p =>
                        p.player.position === code ||
                        p.player.position.startsWith(code) ||
                        code.startsWith(p.player.position),
                    );
                    if (idx !== -1) return pool.splice(idx, 1)[0];
                }
                return pool.shift();
            };

            const usedGhostIds2 = new Set<string>();
            const pickGhost2 = (fx: number, fy: number): typeof GHOST_SLOTS[0] => {
                let best = GHOST_SLOTS[0];
                let bestDist = Infinity;
                for (const g of GHOST_SLOTS) {
                    if (usedGhostIds2.has(g.id)) continue;
                    const d = Math.sqrt((g.x - fx) ** 2 + (g.y - fy) ** 2);
                    if (d < bestDist) { bestDist = d; best = g; }
                }
                usedGhostIds2.add(best.id);
                return best;
            };

            const gkSlot = newFormation.positions.find(s => s.label === 'GK');
            if (gkSlot) {
                const gkIdx = pool.findIndex(p => p.player.position === 'GK');
                if (gkIdx !== -1) {
                    const gk = pool.splice(gkIdx, 1)[0];
                    const ghost = pickGhost2(gkSlot.x, gkSlot.y);
                    next.push({ ...gk, slotId: ghost.id, x: ghost.x, y: ghost.y, animating: true, player: { ...gk.player, role: gkSlot.defaultRole, duty: gkSlot.defaultDuty } });
                }
            }

            newFormation.positions.forEach(slot => {
                if (slot.label === 'GK') return;
                const p = popBest(slot.naturalFor, slot.accomplishedFor);
                if (p) {
                    const ghost = pickGhost2(slot.x, slot.y);
                    next.push({ ...p, slotId: ghost.id, x: ghost.x, y: ghost.y, animating: true, player: { ...p.player, role: slot.defaultRole, duty: slot.defaultDuty } });
                }
            });

            return next;
        });

        setFormationKey(newKey);
    }, []);

    return {
        formation,
        formationKey,
        assignments,
        onPitch,
        handleFormationChange,
        movePlayer,
        updatePosition,
        snapOrReturn,
        removePlayer,
        clearAnimating,
        autoPick,
        clearPitch,
    };
}