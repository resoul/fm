import React, { useState, useMemo } from "react";
import type { Club, MatchLineup, MatchEvent } from "../engine/types";
import { generateClub, buildMatchTeam, autoSelectLineup } from "../engine/teamFactory";
import { MatchEngine, DEFAULT_FIELD } from "../engine/matchEngine";
import { LineupBuilder } from "./LineupBuilder";

// ── Pre-generated clubs ───────────────────────────────────
function createDefaultClubs(): [Club, Club] {
    const home = generateClub(
        "home_club",
        "FC Scarlet",
        "FCS",
        "#e63946",
        "#ffffff",
        "4-3-3",
        78,
    );
    const away = generateClub(
        "away_club",
        "Azur City",
        "ACF",
        "#457b9d",
        "#ffffff",
        "4-4-2",
        75,
    );
    return [home, away];
}

// ── Step indicator ────────────────────────────────────────
const StepBadge: React.FC<{ step: number; current: number; label: string }> = ({ step, current, label }) => {
    const done   = step < current;
    const active = step === current;
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: done ? "#10b981" : active ? "#6366f1" : "rgba(255,255,255,0.1)",
                border: `2px solid ${done ? "#10b981" : active ? "#818cf8" : "rgba(255,255,255,0.15)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, color: "#fff",
                transition: "all 0.3s ease",
            }}>
                {done ? "✓" : step}
            </div>
            <span style={{
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                color: active ? "#fff" : done ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                letterSpacing: 0.3,
            }}>
                {label}
            </span>
        </div>
    );
};

// ── Main PreMatchPage ─────────────────────────────────────
interface PreMatchPageProps {
    onMatchReady: (engine: MatchEngine) => void;
}

export const PreMatchPage: React.FC<PreMatchPageProps> = ({ onMatchReady }) => {
    const [clubs]          = useState<[Club, Club]>(createDefaultClubs);
    const [step, setStep]  = useState(1); // 1=home lineup, 2=away lineup, 3=preview, 4=result
    const [homeLineup, setHomeLineup] = useState<MatchLineup | null>(null);
    const [awayLineup, setAwayLineup] = useState<MatchLineup | null>(null);
    const [quickResult, setQuickResult] = useState<{ homeScore: number, awayScore: number, events: MatchEvent[] } | null>(null);

    const handleHomeConfirm = (lineup: MatchLineup) => {
        setHomeLineup(lineup);
        setStep(2);
    };

    const handleAwayConfirm = (lineup: MatchLineup) => {
        setAwayLineup(lineup);
        setStep(3);
    };

    const handleKickoff = () => {
        if (!homeLineup || !awayLineup) return;
        const homeTeam = buildMatchTeam(clubs[0], homeLineup, DEFAULT_FIELD, "home");
        const awayTeam = buildMatchTeam(clubs[1], awayLineup, DEFAULT_FIELD, "away");
        const engine = new MatchEngine(homeTeam, awayTeam);
        onMatchReady(engine);
    };

    const handleQuickSim = () => {
        if (!homeLineup || !awayLineup) return;
        const homeTeam = buildMatchTeam(clubs[0], homeLineup, DEFAULT_FIELD, "home");
        const awayTeam = buildMatchTeam(clubs[1], awayLineup, DEFAULT_FIELD, "away");
        const engine = new MatchEngine(homeTeam, awayTeam);
        
        // Fast simulation loop
        engine.start();
        while (engine.state.phase !== "fulltime") {
            engine.tick();
            // Safety break
            if (engine.state.tick > 200000) break;
        }

        setQuickResult({
            homeScore: engine.homeTeam.score,
            awayScore: engine.awayTeam.score,
            events: engine.events.filter(e => e.type === "goal"),
        });
        setStep(4);
    };

    return (
        <div style={{
            minHeight: "100vh",
            background: "linear-gradient(135deg, #0a0a0f 0%, #0f1a2e 50%, #0a0f0a 100%)",
            color: "#fff",
            fontFamily: "'DM Sans', system-ui, sans-serif",
            padding: "32px 24px",
        }}>
            {/* Header */}
            <div style={{ maxWidth: 900, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>⚽</div>
                    <h1 style={{
                        fontSize: 22, fontWeight: 900,
                        letterSpacing: 1, margin: "0 0 4px",
                        background: "linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.6) 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                    }}>
                        PRE-MATCH SETUP
                    </h1>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, letterSpacing: 0.5 }}>
                        Select lineups and formation before kick-off
                    </p>
                </div>

                {/* Step indicators */}
                <div style={{
                    display: "flex",
                    gap: 20,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 28,
                    padding: "12px 20px",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.06)",
                }}>
                    <StepBadge step={1} current={step} label={`${clubs[0].name} Lineup`} />
                    <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.12)" }} />
                    <StepBadge step={2} current={step} label={`${clubs[1].name} Lineup`} />
                    <div style={{ width: 40, height: 1, background: "rgba(255,255,255,0.12)" }} />
                    <StepBadge step={3} current={step} label="Kick Off" />
                </div>

                {/* Step 1: Home lineup */}
                {step === 1 && (
                    <div style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12,
                        padding: "24px",
                    }}>
                        <LineupBuilder
                            club={clubs[0]}
                            onConfirm={handleHomeConfirm}
                            label="Home Team"
                        />
                    </div>
                )}

                {/* Step 2: Away lineup */}
                {step === 2 && (
                    <div style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12,
                        padding: "24px",
                    }}>
                        <LineupBuilder
                            club={clubs[1]}
                            onConfirm={handleAwayConfirm}
                            label="Away Team"
                        />
                    </div>
                )}

                {/* Step 3: Preview + kickoff */}
                {step === 3 && homeLineup && awayLineup && (
                    <MatchPreview
                        homeClub={clubs[0]}
                        awayClub={clubs[1]}
                        homeLineup={homeLineup}
                        awayLineup={awayLineup}
                        onBack={() => setStep(2)}
                        onKickoff={handleKickoff}
                        onQuickSim={handleQuickSim}
                    />
                )}

                {/* Step 4: Quick Result */}
                {step === 4 && quickResult && (
                    <div style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12,
                        padding: "32px",
                        textAlign: "center",
                    }}>
                        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 24, letterSpacing: 1 }}>FINAL RESULT</h2>
                        
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 32, marginBottom: 32 }}>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 24, fontWeight: 900, color: clubs[0].color }}>{clubs[0].name}</div>
                            </div>
                            <div style={{ fontSize: 48, fontWeight: 900, background: "rgba(255,255,255,0.05)", padding: "0 24px", borderRadius: 12 }}>
                                {quickResult.homeScore} - {quickResult.awayScore}
                            </div>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontSize: 24, fontWeight: 900, color: clubs[1].color }}>{clubs[1].name}</div>
                            </div>
                        </div>

                        <div style={{ maxWidth: 400, margin: "0 auto", textAlign: "left", marginBottom: 32 }}>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Scorers</div>
                            {quickResult.events.map((e, i) => (
                                <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between" }}>
                                    <span>⚽ {e.playerName}</span>
                                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{e.minute}'</span>
                                </div>
                            ))}
                            {quickResult.events.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>No goals scored</div>}
                        </div>

                        <button
                            onClick={() => setStep(3)}
                            style={{
                                padding: "10px 24px", borderRadius: 7,
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "rgba(255,255,255,0.05)",
                                color: "#fff", cursor: "pointer", fontSize: 13,
                            }}
                        >
                            Back to Preview
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Match Preview screen ──────────────────────────────────
import { overallRating } from "../engine/types";

const MatchPreview: React.FC<{
    homeClub: Club;
    awayClub: Club;
    homeLineup: MatchLineup;
    awayLineup: MatchLineup;
    onBack: () => void;
    onKickoff: () => void;
    onQuickSim: () => void;
}> = ({ homeClub, awayClub, homeLineup, awayLineup, onBack, onKickoff, onQuickSim }) => {
    const homeOVR = useMemo(() => {
        const profiles = homeLineup.startingXI.map(id => homeClub.squad.find(p => p.id === id));
        const valid    = profiles.filter(Boolean) as any[];
        return valid.length ? Math.round(valid.reduce((s, p) => s + overallRating(p.attributes), 0) / valid.length) : 0;
    }, [homeClub, homeLineup]);

    const awayOVR = useMemo(() => {
        const profiles = awayLineup.startingXI.map(id => awayClub.squad.find(p => p.id === id));
        const valid    = profiles.filter(Boolean) as any[];
        return valid.length ? Math.round(valid.reduce((s, p) => s + overallRating(p.attributes), 0) / valid.length) : 0;
    }, [awayClub, awayLineup]);

    const homePlayers = homeLineup.startingXI.map(id => homeClub.squad.find(p => p.id === id)).filter(Boolean) as any[];
    const awayPlayers = awayLineup.startingXI.map(id => awayClub.squad.find(p => p.id === id)).filter(Boolean) as any[];

    return (
        <div>
            {/* Scoreboard-style header */}
            <div style={{
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "24px 32px",
                textAlign: "center",
                marginBottom: 20,
            }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 2, marginBottom: 16, textTransform: "uppercase" }}>
                    Match Preview
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
                    {/* Home */}
                    <div style={{ flex: 1, textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: homeClub.color }}>{homeClub.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{homeLineup.formation} · OVR {homeOVR}</div>
                    </div>

                    {/* VS */}
                    <div style={{
                        padding: "10px 20px",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.1)",
                    }}>
                        <span style={{ fontSize: 24, fontWeight: 900, color: "rgba(255,255,255,0.5)", letterSpacing: 2 }}>VS</span>
                    </div>

                    {/* Away */}
                    <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: awayClub.color }}>{awayClub.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{awayLineup.formation} · OVR {awayOVR}</div>
                    </div>
                </div>

                {/* OVR comparison bar */}
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: homeClub.color, fontWeight: 700, minWidth: 30 }}>{homeOVR}</span>
                    <div style={{ flex: 1, height: 6, background: awayClub.color, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                            width: `${(homeOVR / (homeOVR + awayOVR)) * 100}%`,
                            height: "100%",
                            background: homeClub.color,
                            transition: "width 0.5s ease",
                        }} />
                    </div>
                    <span style={{ fontSize: 11, color: awayClub.color, fontWeight: 700, minWidth: 30, textAlign: "right" }}>{awayOVR}</span>
                </div>
            </div>

            {/* Starting XIs side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {/* Home XI */}
                <div style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: 16,
                }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, color: homeClub.color, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
                        {homeClub.name} Starting XI
                    </div>
                    {homePlayers.map((p: any, i: number) => (
                        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", width: 16 }}>{i + 1}</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", width: 24 }}>{p.number}</span>
                            <span style={{ fontSize: 11, color: "#fff", flex: 1 }}>{p.name}</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", width: 28 }}>{p.primaryPosition}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: homeClub.color }}>{overallRating(p.attributes)}</span>
                        </div>
                    ))}
                </div>

                {/* Away XI */}
                <div style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10,
                    padding: 16,
                }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, color: awayClub.color, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
                        {awayClub.name} Starting XI
                    </div>
                    {awayPlayers.map((p: any, i: number) => (
                        <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", width: 16 }}>{i + 1}</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", width: 24 }}>{p.number}</span>
                            <span style={{ fontSize: 11, color: "#fff", flex: 1 }}>{p.name}</span>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", width: 28 }}>{p.primaryPosition}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: awayClub.color }}>{overallRating(p.attributes)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
                <button
                    onClick={onBack}
                    style={{
                        padding: "10px 20px", borderRadius: 7,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.6)",
                        fontSize: 12, cursor: "pointer",
                    }}
                >
                    ← Back
                </button>
                <button
                    onClick={onQuickSim}
                    style={{
                        padding: "0 20px", borderRadius: 7,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.08)",
                        color: "#fff",
                        fontSize: 12, fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    ⚡ INSTANT RESULT
                </button>
                <button
                    onClick={onKickoff}
                    style={{
                        flex: 1, padding: "12px 0", borderRadius: 7,
                        border: "none",
                        background: "linear-gradient(135deg, #16a34a, #15803d)",
                        color: "#fff",
                        fontSize: 15, fontWeight: 900,
                        cursor: "pointer",
                        letterSpacing: 1,
                        boxShadow: "0 4px 24px rgba(22,163,74,0.4)",
                    }}
                >
                    ⚽ KICK OFF
                </button>
            </div>
        </div>
    );
};

export default PreMatchPage;