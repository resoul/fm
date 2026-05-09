import React, { useEffect, useRef, useState } from "react";
import type { MatchState, Team, MatchEvent } from "../engine/types";
import HighlightsPanel from "./HighlightsPanel";

interface MatchHUDProps {
    homeTeam: Team;
    awayTeam: Team;
    state: MatchState;
    events: MatchEvent[];
    onStart: () => void;
    onPause: () => void;
    onReset: () => void;
}

// ── Possession Bar ─────────────────────────────────────────
const PossessionBar: React.FC<{ home: number; away: number; homeColor: string; awayColor: string }> = ({
    home, away, homeColor, awayColor,
}) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
        <span style={{ color: homeColor, fontWeight: 600, minWidth: 28 }}>{home}%</span>
        <div style={{ flex: 1, height: 6, background: awayColor, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${home}%`, height: "100%", background: homeColor, transition: "width 1s ease" }} />
        </div>
        <span style={{ color: awayColor, fontWeight: 600, minWidth: 28, textAlign: "right" }}>{away}%</span>
    </div>
);

// ── Stat Row ───────────────────────────────────────────────
const StatRow: React.FC<{ label: string; home: number | string; away: number | string; homeColor: string; awayColor: string }> = ({
    label, home, away, homeColor, awayColor,
}) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11 }}>
        <span style={{ color: homeColor, fontWeight: 600, minWidth: 30 }}>{home}</span>
        <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, flex: 1, textAlign: "center" }}>{label}</span>
        <span style={{ color: awayColor, fontWeight: 600, minWidth: 30, textAlign: "right" }}>{away}</span>
    </div>
);

// ── Event Item ─────────────────────────────────────────────
const EventItem: React.FC<{ event: MatchEvent; homeColor: string; awayColor: string }> = ({
    event, homeColor, awayColor,
}) => {
    const color = event.teamId === "home" ? homeColor : event.teamId === "away" ? awayColor : "rgba(255,255,255,0.5)";
    const isGoal = event.type === "goal";
    return (
        <div style={{
            padding: "5px 8px",
            borderRadius: 4,
            marginBottom: 4,
            background: isGoal ? "rgba(255,220,50,0.12)" : "rgba(255,255,255,0.04)",
            borderLeft: `3px solid ${color}`,
            fontSize: 11,
            lineHeight: 1.4,
        }}>
            <span style={{ color: "rgba(255,255,255,0.45)", marginRight: 6, fontSize: 10 }}>
                {event.minute}'{event.second.toString().padStart(2, "0")}
            </span>
            <span style={{ color: isGoal ? "#ffdd44" : "rgba(255,255,255,0.8)", fontWeight: isGoal ? 700 : 400 }}>
                {event.description}
            </span>
        </div>
    );
};

type FeedTab = "all" | "highlights";

// ── Main HUD ───────────────────────────────────────────────
const MatchHUD: React.FC<MatchHUDProps> = ({
    homeTeam, awayTeam, state, events, onStart, onPause, onReset,
}) => {
    const eventsRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<FeedTab>("all");

    // Auto-scroll event feed
    useEffect(() => {
        if (eventsRef.current) {
            eventsRef.current.scrollTop = 0;
        }
    }, [events.length]);

    const phaseLabel: Record<string, string> = {
        kickoff:  "KICK OFF",
        playing:  "LIVE",
        goal:     "GOAL!",
        halftime: "HALF TIME",
        fulltime: "FULL TIME",
        freekick: "FREE KICK",
        goalkick: "GOAL KICK",
        throwin:  "THROW IN",
        corner:   "CORNER",
    };

    const minStr = String(state.minute).padStart(2, "0");
    const secStr = String(state.second).padStart(2, "0");

    const isRunning = state.isRunning && !state.isPaused;
    const isOver    = state.phase === "fulltime";
    const hColor    = homeTeam.color;
    const aColor    = awayTeam.color;

    const recentEvents = [...events].reverse().slice(0, 50);

    // Count highlights for badge
    const HIGHLIGHT_TYPES = new Set(["goal", "shot", "shot_saved", "shot_missed", "corner", "freekick"]);
    const highlightCount = events.filter(e => HIGHLIGHT_TYPES.has(e.type)).length;

    return (
        <div style={{
            display: "grid",
            gridTemplateRows: "auto auto 1fr",
            gap: 10,
            color: "#ffffff",
            height: "100%",
        }}>

            {/* ── Score board ── */}
            <div style={{
                background: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "12px 16px",
            }}>
                {/* Phase badge */}
                <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <span style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 1,
                        background: state.phase === "goal" ? "#ffdd44"
                            : state.phase === "fulltime" ? "#444"
                            : state.phase === "halftime" ? "#555"
                            : "#e63946",
                        color: state.phase === "goal" ? "#000" : "#fff",
                    }}>
                        {phaseLabel[state.phase] ?? state.phase.toUpperCase()}
                    </span>
                </div>

                {/* Teams & Score */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>HOME</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: hColor, lineHeight: 1.2 }}>{homeTeam.name}</div>
                    </div>

                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 4, lineHeight: 1 }}>
                            <span style={{ color: hColor }}>{homeTeam.score}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 2px" }}>–</span>
                            <span style={{ color: aColor }}>{awayTeam.score}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, letterSpacing: 1 }}>
                            {minStr}:{secStr}
                        </div>
                    </div>

                    <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>AWAY</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: aColor, lineHeight: 1.2 }}>{awayTeam.name}</div>
                    </div>
                </div>

                {/* Controls */}
                <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "center" }}>
                    {!isOver && (
                        <button
                            onClick={isRunning ? onPause : onStart}
                            style={{
                                padding: "5px 16px",
                                borderRadius: 5,
                                border: "1px solid rgba(255,255,255,0.2)",
                                background: isRunning ? "rgba(255,255,255,0.1)" : "#e63946",
                                color: "#fff",
                                cursor: "pointer",
                                fontSize: 11,
                                fontWeight: 600,
                                letterSpacing: 0.5,
                            }}
                        >
                            {!state.isRunning ? "▶ START" : isRunning ? "⏸ PAUSE" : "▶ RESUME"}
                        </button>
                    )}
                    <button
                        onClick={onReset}
                        style={{
                            padding: "5px 14px",
                            borderRadius: 5,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.07)",
                            color: "rgba(255,255,255,0.7)",
                            cursor: "pointer",
                            fontSize: 11,
                        }}
                    >
                        ↺ Reset
                    </button>
                </div>
            </div>

            {/* ── Match stats ── */}
            <div style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                padding: "10px 12px",
            }}>
                <div style={{ fontSize: 10, letterSpacing: 1, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase" }}>Match stats</div>
                <PossessionBar home={state.stats.home.possession} away={state.stats.away.possession} homeColor={hColor} awayColor={aColor} />
                <div style={{ marginTop: 6 }}>
                    <StatRow label="Shots" home={state.stats.home.shots} away={state.stats.away.shots} homeColor={hColor} awayColor={aColor} />
                    <StatRow label="On Target" home={state.stats.home.shotsOnTarget} away={state.stats.away.shotsOnTarget} homeColor={hColor} awayColor={aColor} />
                    <StatRow label="Passes" home={state.stats.home.passes} away={state.stats.away.passes} homeColor={hColor} awayColor={aColor} />
                    <StatRow label="Tackles" home={state.stats.home.tackles} away={state.stats.away.tackles} homeColor={hColor} awayColor={aColor} />
                </div>
            </div>

            {/* ── Event feed with tabs ── */}
            <div style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8,
                padding: "0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            }}>
                {/* Tab header */}
                <div style={{
                    display: "flex",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    flexShrink: 0,
                }}>
                    {([
                        { id: "all" as FeedTab, label: "Все события" },
                        { id: "highlights" as FeedTab, label: `⚡ Моменты`, badge: highlightCount },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1,
                                padding: "8px 4px",
                                background: "none",
                                border: "none",
                                borderBottom: activeTab === tab.id
                                    ? "2px solid #e63946"
                                    : "2px solid transparent",
                                color: activeTab === tab.id
                                    ? "#fff"
                                    : "rgba(255,255,255,0.4)",
                                cursor: "pointer",
                                fontSize: 10,
                                fontWeight: 600,
                                letterSpacing: 0.3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                                transition: "all 0.15s",
                            }}
                        >
                            {tab.label}
                            {"badge" in tab && tab.badge > 0 && (
                                <span style={{
                                    background: "#e63946",
                                    color: "#fff",
                                    borderRadius: 10,
                                    fontSize: 9,
                                    padding: "1px 5px",
                                    fontWeight: 700,
                                }}>
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div
                    ref={eventsRef}
                    style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "10px 12px" }}
                >
                    {activeTab === "all" && (
                        <>
                            {recentEvents.length === 0 && (
                                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Waiting for kick off…</div>
                            )}
                            {recentEvents.map(evt => (
                                <EventItem key={evt.id} event={evt} homeColor={hColor} awayColor={aColor} />
                            ))}
                        </>
                    )}

                    {activeTab === "highlights" && (
                        <HighlightsPanel
                            events={events}
                            homeColor={hColor}
                            awayColor={aColor}
                            homeName={homeTeam.name}
                            awayName={awayTeam.name}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchHUD;
