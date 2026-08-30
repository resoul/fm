import React, { useState } from "react";
import type { PostMatchReport, ReportPlayer } from "@/simulate/stats/PostMatchReport";
import type { PlayerMatchStats } from "@/simulate/stats/PlayerMatchStats";

interface PostMatchReportUIProps {
    report: PostMatchReport;
    onNewMatch: () => void;
}

// ── Tabs ──────────────────────────────────────────────────────
type Tab = "overview" | "players" | "timeline";

// ── Helpers ───────────────────────────────────────────────────
function ratingColor(r: number): string {
    if (r >= 8.5) return "#ffd700";
    if (r >= 7.5) return "#4ade80";
    if (r >= 6.5) return "#60a5fa";
    if (r >= 5.5) return "rgba(255,255,255,0.65)";
    return "#f87171";
}

function ratingBg(r: number): string {
    if (r >= 8.5) return "rgba(255,215,0,0.12)";
    if (r >= 7.5) return "rgba(74,222,128,0.10)";
    if (r >= 6.5) return "rgba(96,165,250,0.09)";
    return "rgba(255,255,255,0.04)";
}

const S: React.CSSProperties = { fontFamily: "'DM Mono', 'Fira Mono', monospace" };

// ── Scoreboard ────────────────────────────────────────────────
const Scoreboard: React.FC<{ report: PostMatchReport }> = ({ report }) => {
    const { home, away, homeScore, awayScore, narrative, winner } = report;
    const hColor = home.color;
    const aColor = away.color;

    return (
        <div style={{
            background: "linear-gradient(160deg, rgba(0,0,0,0.75) 0%, rgba(10,12,20,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 14,
            padding: "28px 32px 22px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
        }}>
            {/* Subtle backdrop glow */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                background: `radial-gradient(ellipse at 30% 50%, ${hColor}18 0%, transparent 60%),
                             radial-gradient(ellipse at 70% 50%, ${aColor}18 0%, transparent 60%)`,
            }} />

            {/* FULL TIME badge */}
            <div style={{ marginBottom: 14 }}>
                <span style={{
                    display: "inline-block",
                    padding: "3px 14px",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 2,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    color: "rgba(255,255,255,0.6)",
                }}>
                    FULL TIME
                </span>
            </div>

            {/* Score row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, position: "relative" }}>
                {/* Home */}
                <div style={{ flex: 1, textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: hColor, letterSpacing: -0.5 }}>{home.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, letterSpacing: 1 }}>HOME · {home.formation}</div>
                </div>

                {/* Score */}
                <div style={{ textAlign: "center" }}>
                    <div style={{
                        fontSize: 52, fontWeight: 900, letterSpacing: 6, lineHeight: 1,
                        ...S,
                    }}>
                        <span style={{ color: winner === "home" ? hColor : winner === "draw" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }}>
                            {homeScore}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 4px" }}>–</span>
                        <span style={{ color: winner === "away" ? aColor : winner === "draw" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }}>
                            {awayScore}
                        </span>
                    </div>
                </div>

                {/* Away */}
                <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: aColor, letterSpacing: -0.5 }}>{away.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, letterSpacing: 1 }}>AWAY · {away.formation}</div>
                </div>
            </div>

            {/* Narrative headline */}
            <div style={{
                marginTop: 16,
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.55)",
                fontStyle: "italic",
            }}>
                "{narrative.headline}"
            </div>

            {/* Goal scorers */}
            {report.goals.length > 0 && (
                <div style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "center",
                    gap: 24,
                    flexWrap: "wrap",
                }}>
                    {report.goals.map(g => (
                        <span key={g.id} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            ⚽ <span style={{ color: g.teamId === "home" ? hColor : aColor, fontWeight: 600 }}>
                                {g.playerName}
                            </span>{" "}
                            <span style={{ color: "rgba(255,255,255,0.3)", ...S }}>{g.minute}'</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Stat comparison bar ───────────────────────────────────────
const CompareBar: React.FC<{
    label: string;
    homeVal: number;
    awayVal: number;
    hColor: string;
    aColor: string;
    suffix?: string;
    decimals?: number;
}> = ({ label, homeVal, awayVal, hColor, aColor, suffix = "", decimals = 0 }) => {
    const total = homeVal + awayVal || 1;
    const homePct = (homeVal / total) * 100;
    const fmt = (v: number) => decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
    return (
        <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>
                <span style={{ color: hColor, fontWeight: 700 }}>{fmt(homeVal)}{suffix}</span>
                <span style={{ letterSpacing: 0.5 }}>{label}</span>
                <span style={{ color: aColor, fontWeight: 700 }}>{fmt(awayVal)}{suffix}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: `${aColor}55`, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${homePct}%`, background: hColor, borderRadius: 3, transition: "width 0.6s ease" }} />
            </div>
        </div>
    );
};

// ── Overview tab ──────────────────────────────────────────────
const OverviewTab: React.FC<{ report: PostMatchReport }> = ({ report }) => {
    const { home, away, narrative, tacticalWindows } = report;
    const hColor = home.color;
    const aColor = away.color;
    const hs = home.stats;
    const as_ = away.stats;

    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

            {/* Team stats */}
            <div style={{
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
                padding: "16px 18px",
            }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 14 }}>
                    Match Stats
                </div>
                <CompareBar label="Possession" homeVal={hs.possession} awayVal={as_.possession} hColor={hColor} aColor={aColor} suffix="%" />
                <CompareBar label="Shots" homeVal={hs.shots} awayVal={as_.shots} hColor={hColor} aColor={aColor} />
                <CompareBar label="On Target" homeVal={hs.shotsOnTarget} awayVal={as_.shotsOnTarget} hColor={hColor} aColor={aColor} />
                <CompareBar label="xG" homeVal={hs.xg ?? 0} awayVal={as_.xg ?? 0} hColor={hColor} aColor={aColor} decimals={2} />
                <CompareBar label="Passes" homeVal={hs.passes} awayVal={as_.passes} hColor={hColor} aColor={aColor} />
                <CompareBar label="Pass Acc." homeVal={hs.passAccuracy} awayVal={as_.passAccuracy} hColor={hColor} aColor={aColor} suffix="%" />
                <CompareBar label="Tackles" homeVal={hs.tackles} awayVal={as_.tackles} hColor={hColor} aColor={aColor} />

                {/* xG overperformance note */}
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                    {([
                        { side: home, xgOver: home.xGOverperformance, color: hColor },
                        { side: away, xgOver: away.xGOverperformance, color: aColor },
                    ] as const).map(({ side, xgOver, color }) => (
                        <div key={side.id} style={{
                            flex: 1, padding: "6px 10px", borderRadius: 6,
                            background: xgOver > 0 ? "rgba(74,222,128,0.07)" : xgOver < 0 ? "rgba(248,113,113,0.07)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${xgOver > 0 ? "rgba(74,222,128,0.15)" : xgOver < 0 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.05)"}`,
                            fontSize: 9,
                        }}>
                            <div style={{ color, fontWeight: 700, marginBottom: 2 }}>{side.name}</div>
                            <div style={{ color: "rgba(255,255,255,0.4)" }}>
                                xG overperf: <span style={{ color: xgOver > 0 ? "#4ade80" : xgOver < 0 ? "#f87171" : "rgba(255,255,255,0.4)", fontWeight: 700 }}>
                                    {xgOver > 0 ? "+" : ""}{xgOver.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right column: narrative + top performers + tactical windows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Match story */}
                <div style={{
                    background: "rgba(0,0,0,0.45)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: "14px 16px",
                }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 10 }}>Match Story</div>
                    <p style={{ fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", margin: 0 }}>
                        {narrative.summary}
                    </p>
                    {narrative.highlights.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                            {narrative.highlights.map((h, i) => (
                                <div key={i} style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "flex", gap: 6 }}>
                                    <span style={{ color: "#ffd700" }}>★</span>{h}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top performers */}
                <div style={{
                    background: "rgba(0,0,0,0.45)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: "14px 16px",
                }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 10 }}>
                        Top Performers
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        {[home, away].map(team => (
                            <div key={team.id} style={{ flex: 1 }}>
                                <div style={{ fontSize: 9, color: team.color, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>{team.name}</div>
                                {team.topPerformers.map(p => (
                                    <div key={p.id} style={{
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 10,
                                    }}>
                                        <span style={{ color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
                                            {p.name}
                                        </span>
                                        <span style={{
                                            ...S, fontSize: 11, fontWeight: 700,
                                            color: ratingColor(p.rating),
                                            background: ratingBg(p.rating),
                                            padding: "1px 6px", borderRadius: 4,
                                        }}>
                                            {p.rating.toFixed(1)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tactical windows */}
                {tacticalWindows.length > 0 && (
                    <div style={{
                        background: "rgba(0,0,0,0.45)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 10,
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 10 }}>
                            Tactical Windows (15 min)
                        </div>
                        {tacticalWindows.map(w => (
                            <div key={w.minute} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 9,
                            }}>
                                <span style={{ color: "rgba(255,255,255,0.3)", ...S, width: 24 }}>{w.minute}'</span>
                                <div style={{ flex: 1, display: "flex", gap: 4 }}>
                                    <span style={{ color: hColor }}>Poss {Math.round(w.home.possession * 100)}%</span>
                                    <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                                    <span style={{ color: w.home.xGDelta > 0 ? "#4ade80" : w.home.xGDelta < -0.05 ? "#f87171" : "rgba(255,255,255,0.3)" }}>
                                        xG {w.home.xGDelta > 0 ? "+" : ""}{w.home.xGDelta.toFixed(2)}
                                    </span>
                                    <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                                    <span style={{ color: "rgba(255,255,255,0.35)" }}>Press {Math.round(w.home.pressingSuccess * 100)}%</span>
                                </div>
                                <span style={{ color: "rgba(255,255,255,0.2)" }}>vs</span>
                                <div style={{ flex: 1, display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                    <span style={{ color: aColor }}>Poss {Math.round(w.away.possession * 100)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Players tab ────────────────────────────────────────────────
type SortKey = "rating" | "goals" | "assists" | "xG" | "passAcc" | "tackles" | "distance";

const PlayersTab: React.FC<{ report: PostMatchReport }> = ({ report }) => {
    const [sortKey, setSortKey] = useState<SortKey>("rating");
    const [filterTeam, setFilterTeam] = useState<"all" | "home" | "away">("all");
    const { home, away } = report;

    type Row = { player: ReportPlayer; stats: PlayerMatchStats; team: "home" | "away"; color: string };

    const rows: Row[] = [
        ...Object.values(home.players).map(p => ({
            player: p, stats: home.playerStats[p.id], team: "home" as const, color: home.color,
        })),
        ...Object.values(away.players).map(p => ({
            player: p, stats: away.playerStats[p.id], team: "away" as const, color: away.color,
        })),
    ].filter(r => r.stats);

    const filtered = filterTeam === "all" ? rows : rows.filter(r => r.team === filterTeam);

    const sorted = [...filtered].sort((a, b) => {
        const s = (r: Row) => {
            const st = r.stats;
            switch (sortKey) {
                case "rating":   return st.rating;
                case "goals":    return st.goals;
                case "assists":  return st.assists;
                case "xG":       return st.xG;
                case "passAcc":  return st.passAccuracy;
                case "tackles":  return st.tacklesWon;
                case "distance": return st.distanceCovered;
            }
        };
        return s(b) - s(a);
    });

    const cols: { key: SortKey; label: string }[] = [
        { key: "rating",   label: "RTG" },
        { key: "goals",    label: "G" },
        { key: "assists",  label: "A" },
        { key: "xG",       label: "xG" },
        { key: "passAcc",  label: "PA%" },
        { key: "tackles",  label: "TKL" },
        { key: "distance", label: "KM" },
    ];

    const hStyle = (active: boolean): React.CSSProperties => ({
        padding: "5px 8px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: active ? "#fff" : "rgba(255,255,255,0.35)",
        background: active ? "rgba(255,255,255,0.1)" : "none",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        ...S,
    });

    return (
        <div style={{
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            overflow: "hidden",
        }}>
            {/* Toolbar */}
            <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(0,0,0,0.3)",
            }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", flex: 1 }}>Player Ratings</span>

                {/* Team filter */}
                {(["all", "home", "away"] as const).map(t => (
                    <button key={t} onClick={() => setFilterTeam(t)} style={{
                        padding: "3px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: filterTeam === t ? "rgba(255,255,255,0.1)" : "none",
                        color: filterTeam === t ? "#fff" : "rgba(255,255,255,0.35)",
                        cursor: "pointer",
                    }}>
                        {t === "all" ? "All" : t === "home" ? home.name : away.name}
                    </button>
                ))}

                <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 10 }}>|</span>

                {/* Sort */}
                {cols.map(c => (
                    <button key={c.key} onClick={() => setSortKey(c.key)} style={hStyle(sortKey === c.key)}>
                        {c.label}
                    </button>
                ))}
            </div>

            {/* Header row */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "20px 30px 1fr 28px 80px 28px 28px 38px 28px 28px 42px",
                padding: "6px 14px",
                fontSize: 8,
                color: "rgba(255,255,255,0.25)",
                letterSpacing: 0.5,
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                textTransform: "uppercase",
            }}>
                <span>#</span>
                <span>Pos</span>
                <span>Player</span>
                <span style={{ textAlign: "center" }}>G</span>
                <span style={{ textAlign: "center" }}>xG / A</span>
                <span style={{ textAlign: "center" }}>Sh</span>
                <span style={{ textAlign: "center" }}>PA%</span>
                <span style={{ textAlign: "center" }}>TKL</span>
                <span style={{ textAlign: "center" }}>Int</span>
                <span style={{ textAlign: "center" }}>KM</span>
                <span style={{ textAlign: "right" }}>RTG</span>
            </div>

            {/* Rows */}
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {sorted.map((row, idx) => {
                    const { player, stats, color } = row;
                    const km = (stats.distanceCovered / 1000).toFixed(1);
                    return (
                        <div key={player.id} style={{
                            display: "grid",
                            gridTemplateColumns: "20px 30px 1fr 28px 80px 28px 28px 42px 28px 28px 42px",
                            padding: "6px 14px",
                            alignItems: "center",
                            fontSize: 10,
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                            background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                        }}>
                            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, ...S }}>{idx + 1}</span>
                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 0.3 }}>{player.position}</span>
                            <span style={{ color, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {player.name}
                            </span>
                            <span style={{ textAlign: "center", color: stats.goals > 0 ? "#ffd700" : "rgba(255,255,255,0.3)", fontWeight: stats.goals > 0 ? 700 : 400, ...S }}>
                                {stats.goals || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 9, ...S }}>
                                {stats.xG.toFixed(2)} / {stats.assists || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", ...S }}>
                                {stats.shots || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: stats.passAccuracy >= 80 ? "#4ade80" : "rgba(255,255,255,0.4)", ...S }}>
                                {stats.passAccuracy || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", ...S }}>
                                {stats.tacklesWon || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", ...S }}>
                                {stats.interceptions || "–"}
                            </span>
                            <span style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", ...S }}>
                                {km}
                            </span>
                            <span style={{
                                textAlign: "right",
                                fontWeight: 800,
                                fontSize: 12,
                                color: ratingColor(stats.rating),
                                background: ratingBg(stats.rating),
                                padding: "2px 6px",
                                borderRadius: 5,
                                ...S,
                                justifySelf: "end",
                            }}>
                                {stats.rating.toFixed(1)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Timeline tab ──────────────────────────────────────────────
const TimelineTab: React.FC<{ report: PostMatchReport }> = ({ report }) => {
    const { events, home, away } = report;
    const SHOW_TYPES = new Set(["goal", "shot", "shot_saved", "shot_missed", "corner", "freekick", "halftime", "fulltime"]);

    const EVENT_CFG: Record<string, { icon: string; color: string }> = {
        goal:        { icon: "⚽", color: "#ffd700" },
        shot:        { icon: "🎯", color: "#60a5fa" },
        shot_saved:  { icon: "🧤", color: "#4ade80" },
        shot_missed: { icon: "💨", color: "#f87171" },
        corner:      { icon: "🚩", color: "#fb923c" },
        freekick:    { icon: "🥅", color: "#c084fc" },
        halftime:    { icon: "⏸",  color: "rgba(255,255,255,0.3)" },
        fulltime:    { icon: "🏁", color: "rgba(255,255,255,0.5)" },
    };

    const filtered = events.filter(e => SHOW_TYPES.has(e.type));

    return (
        <div style={{
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            padding: "16px",
        }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 14 }}>
                Match Timeline
            </div>

            {/* Central timeline */}
            <div style={{ position: "relative" }}>
                {/* Vertical line */}
                <div style={{
                    position: "absolute",
                    left: "50%", top: 0, bottom: 0,
                    width: 1,
                    background: "rgba(255,255,255,0.07)",
                    transform: "translateX(-50%)",
                }} />

                {filtered.map((evt, i) => {
                    console.log(i, evt)

                    const cfg = EVENT_CFG[evt.type] ?? { icon: "•", color: "#888" };
                    const isHome = evt.teamId === "home";
                    const isAway = evt.teamId === "away";
                    const isCenter = !isHome && !isAway;
                    const teamColor = isHome ? home.color : isAway ? away.color : cfg.color;

                    return (
                        <div key={evt.id} style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 0,
                            marginBottom: 8,
                            position: "relative",
                        }}>
                            {/* Home side (left) */}
                            <div style={{
                                flex: 1,
                                textAlign: "right",
                                paddingRight: 20,
                                opacity: isHome ? 1 : 0,
                                pointerEvents: isHome ? "auto" : "none",
                            }}>
                                {isHome && (
                                    <div style={{
                                        display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2,
                                        padding: "5px 10px",
                                        borderRadius: 6,
                                        background: evt.type === "goal" ? "rgba(255,215,0,0.09)" : "rgba(255,255,255,0.03)",
                                        border: `1px solid ${cfg.color}22`,
                                    }}>
                                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                                            <span style={{ color: teamColor, fontWeight: 600 }}>{evt.playerName}</span>
                                            <span>{cfg.icon}</span>
                                        </div>
                                        {evt.xg !== undefined && (
                                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", ...S }}>xG {evt.xg.toFixed(2)}</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Center: minute + icon */}
                            <div style={{
                                width: 56,
                                flexShrink: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 2,
                                zIndex: 1,
                            }}>
                                <div style={{
                                    width: 28, height: 28,
                                    borderRadius: "50%",
                                    background: "rgba(10,12,20,1)",
                                    border: `2px solid ${cfg.color}`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 13,
                                }}>
                                    {cfg.icon}
                                </div>
                                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", ...S }}>
                                    {evt.minute}'
                                </span>
                            </div>

                            {/* Away side (right) */}
                            <div style={{
                                flex: 1,
                                textAlign: "left",
                                paddingLeft: 20,
                                opacity: isAway ? 1 : isCenter ? 1 : 0,
                                pointerEvents: (isAway || isCenter) ? "auto" : "none",
                            }}>
                                {(isAway || isCenter) && (
                                    <div style={{
                                        display: "inline-flex", flexDirection: "column", gap: 2,
                                        padding: "5px 10px",
                                        borderRadius: 6,
                                        background: evt.type === "goal" ? "rgba(255,215,0,0.09)" : evt.type === "halftime" || evt.type === "fulltime" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)",
                                        border: `1px solid ${cfg.color}22`,
                                    }}>
                                        <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                                            {isAway && <span style={{ color: teamColor, fontWeight: 600 }}>{evt.playerName}</span>}
                                            {isCenter && <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>{evt.description}</span>}
                                        </div>
                                        {evt.xg !== undefined && (
                                            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", ...S }}>xG {evt.xg.toFixed(2)}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Root component ─────────────────────────────────────────────
const PostMatchReportUI: React.FC<PostMatchReportUIProps> = ({ report, onNewMatch }) => {
    const [tab, setTab] = useState<Tab>("overview");

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: "8px 18px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        border: "none",
        borderBottom: active ? "2px solid #e63946" : "2px solid transparent",
        background: "none",
        color: active ? "#fff" : "rgba(255,255,255,0.35)",
        cursor: "pointer",
        transition: "all 0.15s",
    });

    return (
        <div style={{
            maxWidth: 900,
            margin: "0 auto",
            color: "#fff",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            display: "flex",
            flexDirection: "column",
            gap: 12,
        }}>
            {/* Scoreboard */}
            <Scoreboard report={report} />

            {/* Tab bar + New Match button */}
            <div style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8,
                overflow: "hidden",
            }}>
                <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
                <button style={tabStyle(tab === "players")} onClick={() => setTab("players")}>Players</button>
                <button style={tabStyle(tab === "timeline")} onClick={() => setTab("timeline")}>Timeline</button>

                <div style={{ flex: 1 }} />

                <button
                    onClick={onNewMatch}
                    style={{
                        margin: "0 12px",
                        padding: "6px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.07)",
                        color: "#fff",
                        cursor: "pointer",
                        letterSpacing: 0.3,
                    }}
                >
                    ↺ New Match
                </button>
            </div>

            {/* Tab content */}
            {tab === "overview"  && <OverviewTab  report={report} />}
            {tab === "players"   && <PlayersTab   report={report} />}
            {tab === "timeline"  && <TimelineTab  report={report} />}
        </div>
    );
};

export default PostMatchReportUI;