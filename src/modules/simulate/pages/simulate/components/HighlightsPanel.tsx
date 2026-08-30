/**
 * HighlightsPanel — «Опасные моменты» режим
 *
 * Показывает только ключевые события матча.
 * 7.1: Кнопка «▶ Момент» — телепортирует симуляцию к нужному тику.
 */

import React, { useState } from "react";
import type { MatchEvent } from "@/simulate/types";

const HIGHLIGHT_TYPES = new Set([
    "goal", "shot", "shot_saved", "shot_missed", "corner", "freekick",
]);

const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    goal:        { icon: "⚽", label: "ГОЛ",            color: "#ffd700" },
    shot:        { icon: "🎯", label: "Удар",            color: "#44aaff" },
    shot_saved:  { icon: "🧤", label: "Сейв",            color: "#44ff99" },
    shot_missed: { icon: "💨", label: "Мимо",            color: "#ff7777" },
    corner:      { icon: "🚩", label: "Угловой",         color: "#ffaa44" },
    freekick:    { icon: "🥅", label: "Своб. удар",      color: "#cc88ff" },
};

interface HighlightsPanelProps {
    events: MatchEvent[];
    homeColor: string;
    awayColor: string;
    homeName: string;
    onJumpToTick?: (tick: number) => void;
    canReplay?: boolean;
}

const HighlightsPanel: React.FC<HighlightsPanelProps> = ({
    events, homeColor, awayColor, homeName,
    onJumpToTick, canReplay = false,
}) => {
    const [jumpingTo, setJumpingTo] = useState<string | null>(null);

    const highlights = events
        .filter(e => HIGHLIGHT_TYPES.has(e.type))
        .slice(0, 30)
        .reverse();

    const handleJump = (evt: MatchEvent) => {
        if (!onJumpToTick) return;
        setJumpingTo(evt.id);
        // Estimate tick from minute/second at 60fps
        const estimatedTick = (evt.minute * 60 + evt.second) * 60;
        onJumpToTick(estimatedTick);
        setTimeout(() => setJumpingTo(null), 800);
    };

    if (highlights.length === 0) {
        return (
            <div style={{
                padding: "20px 12px",
                textAlign: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
            }}>
                Опасных моментов пока нет.<br />
                <span style={{ fontSize: 10 }}>Удары, сейвы и голы появятся здесь</span>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {highlights.map((evt) => {
                const cfg = EVENT_CONFIG[evt.type] ?? { icon: "📌", label: evt.type, color: "#888" };
                const isHomeEvent = evt.teamId === null
                    ? null
                    : (evt.teamId?.includes("home") || evt.teamId === homeName)
                        ? "home" : "away";
                const teamColor = isHomeEvent === "home" ? homeColor
                    : isHomeEvent === "away" ? awayColor
                    : cfg.color;

                const isJumping = jumpingTo === evt.id;

                return (
                    <div
                        key={evt.id}
                        style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            padding: "6px 8px",
                            borderRadius: 6,
                            background: evt.type === "goal"
                                ? "rgba(255,215,0,0.08)"
                                : "rgba(255,255,255,0.03)",
                            borderLeft: `3px solid ${cfg.color}`,
                            transition: "background 0.15s",
                        }}
                    >
                        <div style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.5)",
                            minWidth: 28,
                            paddingTop: 1,
                            fontVariantNumeric: "tabular-nums",
                        }}>
                            {evt.minute}'{evt.second > 0 ? String(evt.second).padStart(2, "0") : ""}
                        </div>

                        <span style={{ fontSize: 14, lineHeight: 1 }}>{cfg.icon}</span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    letterSpacing: 0.5,
                                    color: cfg.color,
                                    textTransform: "uppercase",
                                }}>
                                    {cfg.label}
                                </span>
                                {evt.playerName && (
                                    <span style={{
                                        fontSize: 10,
                                        color: teamColor,
                                        fontWeight: 600,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {evt.playerName}
                                    </span>
                                )}
                            </div>
                            {evt.description && (
                                <div style={{
                                    fontSize: 9,
                                    color: evt.type === "goal"
                                        ? "rgba(255,215,0,0.7)"
                                        : "rgba(255,255,255,0.28)",
                                    marginTop: 2,
                                    fontStyle: evt.type !== "goal" ? "italic" : "normal",
                                    lineHeight: 1.35,
                                }}>
                                    {evt.description}
                                </div>
                            )}
                            {(evt.type === "shot" || evt.type === "shot_saved" || evt.type === "shot_missed") && evt.xg !== undefined && (
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                                    xG: {(evt.xg).toFixed(2)}
                                </div>
                            )}
                        </div>

                        {/* 7.1 Jump-to-moment button */}
                        {canReplay && onJumpToTick && (
                            <button
                                onClick={() => handleJump(evt)}
                                title="Перемотать к этому моменту"
                                style={{
                                    flexShrink: 0,
                                    padding: "3px 7px",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    borderRadius: 4,
                                    border: `1px solid ${isJumping ? cfg.color : "rgba(255,255,255,0.12)"}`,
                                    background: isJumping ? `${cfg.color}22` : "rgba(255,255,255,0.04)",
                                    color: isJumping ? cfg.color : "rgba(255,255,255,0.35)",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    letterSpacing: 0.3,
                                    whiteSpace: "nowrap",
                                    alignSelf: "center",
                                }}
                            >
                                {isJumping ? "⏪" : "▶"}
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default HighlightsPanel;
