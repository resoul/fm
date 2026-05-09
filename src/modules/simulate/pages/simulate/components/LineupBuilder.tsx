import React, { useState, useMemo } from "react";
import type { Club, PlayerProfile, MatchLineup, PlayerPosition } from "../engine/types";
import { FORMATIONS } from "../engine/teamFactory";
import { overallRating } from "../engine/types";

// ── Position color map ────────────────────────────────────
const POS_COLORS: Record<string, string> = {
    GK:  "#f59e0b",
    CB:  "#3b82f6", LB: "#3b82f6", RB: "#3b82f6",
    CM:  "#10b981", LM: "#10b981", RM: "#10b981", CAM: "#10b981",
    LW:  "#ef4444", RW: "#ef4444", ST: "#ef4444",
};

const POS_GROUP: Record<string, string> = {
    GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF",
    CM: "MID", LM: "MID", RM: "MID", CAM: "MID",
    LW: "FWD", RW: "FWD", ST: "FWD",
};

const PlayerCard: React.FC<{
    profile: PlayerProfile;
    isSelected: boolean;
    isStarting: boolean;
    slotPosition?: PlayerPosition;
    onClick: () => void;
}> = ({ profile, isSelected, isStarting, slotPosition, onClick }) => {
    const ovr = overallRating(profile.attributes);
    const posColor = POS_COLORS[profile.primaryPosition] ?? "#888";
    const fitnessColor = profile.fitness >= 80 ? "#10b981" : profile.fitness >= 60 ? "#f59e0b" : "#ef4444";
    const formColor = profile.form >= 70 ? "#10b981" : profile.form >= 45 ? "#f59e0b" : "#ef4444";

    const positionMismatch = slotPosition && profile.primaryPosition !== slotPosition;

    return (
        <div
            onClick={onClick}
            style={{
                padding: "8px 10px",
                borderRadius: 6,
                cursor: "pointer",
                background: isSelected
                    ? "rgba(99,102,241,0.25)"
                    : isStarting
                        ? "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.03)",
                border: isSelected
                    ? "1px solid rgba(99,102,241,0.7)"
                    : isStarting
                        ? "1px solid rgba(255,255,255,0.15)"
                        : "1px solid rgba(255,255,255,0.06)",
                marginBottom: 4,
                transition: "all 0.15s ease",
                position: "relative",
            }}
        >
            {/* Position mismatch warning */}
            {positionMismatch && (
                <div style={{
                    position: "absolute", top: 4, right: 6,
                    fontSize: 9, color: "#f59e0b", fontWeight: 700,
                }}>⚠</div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Number */}
                <div style={{
                    width: 22, height: 22, borderRadius: 4,
                    background: posColor, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 9, fontWeight: 800,
                    color: "#fff", flexShrink: 0,
                }}>
                    {profile.number}
                </div>

                {/* Name + pos */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {profile.name}
                    </div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", display: "flex", gap: 5, marginTop: 1 }}>
                        <span style={{ color: posColor }}>{profile.primaryPosition}</span>
                        <span>·</span>
                        <span>Age {profile.age}</span>
                        <span>·</span>
                        <span>{profile.nationality}</span>
                    </div>
                </div>

                {/* OVR */}
                <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: ovr >= 80 ? "rgba(16,185,129,0.2)" : ovr >= 70 ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.08)",
                    border: `1px solid ${ovr >= 80 ? "rgba(16,185,129,0.4)" : ovr >= 70 ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.12)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", flexShrink: 0,
                }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{ovr}</span>
                    <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>OVR</span>
                </div>
            </div>

            {/* Fitness + Form pills */}
            <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 10,
                    background: `${fitnessColor}22`, color: fitnessColor, fontWeight: 600,
                }}>
                    FIT {profile.fitness}
                </span>
                <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 10,
                    background: `${formColor}22`, color: formColor, fontWeight: 600,
                }}>
                    FORM {profile.form}
                </span>
            </div>
        </div>
    );
};

// ── Formation pitch view ──────────────────────────────────
const FormationPitch: React.FC<{
    slots: Array<{ position: PlayerPosition; rx: number; ry: number }>;
    selectedXI: (PlayerProfile | null)[];
    activeSlot: number | null;
    onSlotClick: (idx: number) => void;
    teamColor: string;
}> = ({ slots, selectedXI, activeSlot, onSlotClick, teamColor }) => {
    const pitchW = 300;
    const pitchH = 200;

    return (
        <div style={{
            position: "relative",
            width: pitchW,
            height: pitchH,
            background: "linear-gradient(180deg, #1a3a1a 0%, #1e4a1e 50%, #1a3a1a 100%)",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            overflow: "hidden",
            flexShrink: 0,
        }}>
            {/* Pitch lines */}
            <svg width={pitchW} height={pitchH} style={{ position: "absolute", inset: 0 }}>
                <rect x="4" y="4" width={pitchW - 8} height={pitchH - 8} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" rx="2" />
                <line x1={pitchW / 2} y1="4" x2={pitchW / 2} y2={pitchH - 4} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <circle cx={pitchW / 2} cy={pitchH / 2} r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                {/* Left penalty */}
                <rect x="4" y={pitchH / 2 - 35} width="55" height="70" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                {/* Right penalty */}
                <rect x={pitchW - 59} y={pitchH / 2 - 35} width="55" height="70" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            </svg>

            {/* Player slots */}
            {slots.map((slot, idx) => {
                const profile = selectedXI[idx];
                const isActive = activeSlot === idx;
                const x = slot.rx * pitchW;
                const y = slot.ry * pitchH;
                const posColor = POS_COLORS[slot.position] ?? "#888";

                return (
                    <div
                        key={idx}
                        onClick={() => onSlotClick(idx)}
                        title={`Slot ${idx + 1}: ${slot.position}${profile ? ` — ${profile.name}` : " (empty)"}`}
                        style={{
                            position: "absolute",
                            left: x,
                            top: y,
                            transform: "translate(-50%, -50%)",
                            cursor: "pointer",
                            zIndex: 10,
                        }}
                    >
                        <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            background: profile
                                ? (isActive ? "rgba(99,102,241,0.9)" : `${teamColor}cc`)
                                : "rgba(255,255,255,0.15)",
                            border: isActive
                                ? "2px solid #818cf8"
                                : profile
                                    ? `2px solid ${teamColor}`
                                    : "2px dashed rgba(255,255,255,0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s ease",
                            boxShadow: isActive ? "0 0 10px rgba(99,102,241,0.6)" : "none",
                        }}>
                            {profile ? (
                                <span style={{ fontSize: 8, fontWeight: 800, color: "#fff" }}>{profile.number}</span>
                            ) : (
                                <span style={{ fontSize: 9, color: posColor }}>+</span>
                            )}
                        </div>
                        <div style={{
                            position: "absolute",
                            top: "100%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            marginTop: 1,
                            fontSize: 7,
                            color: profile ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)",
                            whiteSpace: "nowrap",
                            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                            fontWeight: 600,
                        }}>
                            {profile ? profile.name.split(" ")[1] ?? profile.name : slot.position}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ── Main LineupBuilder component ──────────────────────────
interface LineupBuilderProps {
    club: Club;
    onConfirm: (lineup: MatchLineup) => void;
    label?: string;
}

export const LineupBuilder: React.FC<LineupBuilderProps> = ({ club, onConfirm, label }) => {
    const [formation, setFormation] = useState(club.defaultFormation);
    const [selectedXI, setSelectedXI] = useState<(string | null)[]>(Array(11).fill(null));
    const [activeSlot, setActiveSlot] = useState<number | null>(0);
    const [filter, setFilter] = useState<string>("ALL");

    const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
    const usedIds = new Set(selectedXI.filter(Boolean));

    // Players in the squad not yet assigned to a slot
    const squadFiltered = useMemo(() => {
        return club.squad.filter(p => {
            if (filter === "ALL") return true;
            return POS_GROUP[p.primaryPosition] === filter;
        });
    }, [club.squad, filter]);

    const handleSlotClick = (idx: number) => {
        setActiveSlot(idx === activeSlot ? null : idx);
    };

    const handlePlayerClick = (profile: PlayerProfile) => {
        if (activeSlot === null) return;

        // If player already in XI, remove them first
        const existingSlot = selectedXI.findIndex(id => id === profile.id);
        const next = [...selectedXI];

        if (existingSlot !== -1) {
            next[existingSlot] = null;
        }

        // Assign to active slot (or deselect if already there)
        if (next[activeSlot] === profile.id) {
            next[activeSlot] = null;
        } else {
            next[activeSlot] = profile.id;
            // Auto-advance to next empty slot
            const nextEmpty = next.findIndex((v, i) => i > activeSlot && v === null);
            setActiveSlot(nextEmpty === -1 ? null : nextEmpty);
        }

        setSelectedXI(next);
    };

    const handleAutoFill = () => {
        const slotsCopy = [...slots];
        const next: (string | null)[] = Array(11).fill(null);
        const usedSet = new Set<string>();

        slotsCopy.forEach((slot, idx) => {
            // First try position match
            let candidate = club.squad.find(p =>
                !usedSet.has(p.id) && p.primaryPosition === slot.position
            );
            // Fallback: any available player
            if (!candidate) {
                candidate = club.squad.find(p => !usedSet.has(p.id));
            }
            if (candidate) {
                next[idx] = candidate.id;
                usedSet.add(candidate.id);
            }
        });

        setSelectedXI(next);
        setActiveSlot(null);
    };

    const handleClear = () => {
        setSelectedXI(Array(11).fill(null));
        setActiveSlot(0);
    };

    const canConfirm = selectedXI.filter(Boolean).length === 11;

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm({
            clubId: club.id,
            formation,
            startingXI: selectedXI as string[],
        });
    };

    const selectedProfiles = selectedXI.map(id =>
        id ? (club.squad.find(p => p.id === id) ?? null) : null
    );

    const totalOVR = selectedProfiles.reduce((sum, p) => sum + (p ? overallRating(p.attributes) : 0), 0);
    const avgOVR   = canConfirm ? Math.round(totalOVR / 11) : 0;

    return (
        <div style={{ color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
            {/* Header */}
            {label && (
                <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.4)",
                    marginBottom: 12,
                }}>
                    {label}
                </div>
            )}

            {/* Club header */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
                padding: "10px 14px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
            }}>
                <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: club.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, color: club.secondaryColor, letterSpacing: 0.5,
                }}>
                    {club.shortName}
                </div>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{club.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                        {club.squad.length} players in squad · REP {club.reputation}
                        {avgOVR > 0 && <span style={{ marginLeft: 8, color: "#10b981" }}>Team OVR {avgOVR}</span>}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 14 }}>
                {/* Left: pitch + controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Formation select */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {Object.keys(FORMATIONS).map(fmt => (
                            <button
                                key={fmt}
                                onClick={() => {
                                    setFormation(fmt);
                                    setSelectedXI(Array(11).fill(null));
                                    setActiveSlot(0);
                                }}
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: 5,
                                    border: `1px solid ${formation === fmt ? club.color : "rgba(255,255,255,0.1)"}`,
                                    background: formation === fmt ? `${club.color}33` : "rgba(255,255,255,0.04)",
                                    color: formation === fmt ? "#fff" : "rgba(255,255,255,0.55)",
                                    fontSize: 11,
                                    fontWeight: formation === fmt ? 700 : 400,
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                }}
                            >
                                {fmt}
                            </button>
                        ))}
                    </div>

                    {/* Pitch */}
                    <FormationPitch
                        slots={slots}
                        selectedXI={selectedProfiles}
                        activeSlot={activeSlot}
                        onSlotClick={handleSlotClick}
                        teamColor={club.color}
                    />

                    {/* Active slot hint */}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center", minHeight: 14 }}>
                        {activeSlot !== null ? (
                            <>Assigning to slot <strong style={{ color: POS_COLORS[slots[activeSlot]?.position] ?? "#fff" }}>{slots[activeSlot]?.position}</strong> — pick a player</>
                        ) : (
                            "Click a slot on the pitch to select it"
                        )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                        <button
                            onClick={handleAutoFill}
                            style={{
                                flex: 1, padding: "7px 0",
                                borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
                                background: "rgba(255,255,255,0.07)",
                                color: "rgba(255,255,255,0.8)",
                                fontSize: 11, cursor: "pointer", fontWeight: 600,
                            }}
                        >
                            ⚡ Auto-fill
                        </button>
                        <button
                            onClick={handleClear}
                            style={{
                                flex: 1, padding: "7px 0",
                                borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.03)",
                                color: "rgba(255,255,255,0.45)",
                                fontSize: 11, cursor: "pointer",
                            }}
                        >
                            ✕ Clear
                        </button>
                    </div>

                    {/* Confirm button */}
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        style={{
                            width: "100%", padding: "10px 0",
                            borderRadius: 7,
                            border: "none",
                            background: canConfirm
                                ? `linear-gradient(135deg, ${club.color}, ${club.color}bb)`
                                : "rgba(255,255,255,0.06)",
                            color: canConfirm ? "#fff" : "rgba(255,255,255,0.3)",
                            fontSize: 13, fontWeight: 800,
                            cursor: canConfirm ? "pointer" : "not-allowed",
                            letterSpacing: 0.5,
                            transition: "all 0.2s ease",
                            boxShadow: canConfirm ? `0 4px 20px ${club.color}55` : "none",
                        }}
                    >
                        {canConfirm ? `✓ Confirm Lineup` : `Select ${11 - selectedXI.filter(Boolean).length} more`}
                    </button>
                </div>

                {/* Right: squad list */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Position filter */}
                    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                        {["ALL", "GK", "DEF", "MID", "FWD"].map(grp => (
                            <button
                                key={grp}
                                onClick={() => setFilter(grp)}
                                style={{
                                    padding: "3px 8px", borderRadius: 4,
                                    border: `1px solid ${filter === grp ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                                    background: filter === grp ? "rgba(255,255,255,0.12)" : "transparent",
                                    color: filter === grp ? "#fff" : "rgba(255,255,255,0.4)",
                                    fontSize: 10, cursor: "pointer", fontWeight: 600, letterSpacing: 0.5,
                                }}
                            >
                                {grp}
                            </button>
                        ))}
                    </div>

                    {/* Squad list */}
                    <div style={{ maxHeight: 340, overflowY: "auto", paddingRight: 2 }}>
                        {squadFiltered.map(profile => {
                            const isStarting = usedIds.has(profile.id);
                            const slotIdx = selectedXI.findIndex(id => id === profile.id);
                            const slotPos = slotIdx !== -1 ? slots[slotIdx]?.position : undefined;

                            return (
                                <PlayerCard
                                    key={profile.id}
                                    profile={profile}
                                    isSelected={false}
                                    isStarting={isStarting}
                                    slotPosition={slotPos}
                                    onClick={() => handlePlayerClick(profile)}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LineupBuilder;