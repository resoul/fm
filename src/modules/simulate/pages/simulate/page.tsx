import { useState, useCallback, useMemo, useRef } from "react";
import { ScrollArea } from '@/components/scroll-area';
import { MatchEngine } from "./engine/matchEngine";
import FootballField from "./components/FootballField";
import MatchHUD from "./components/MatchHUD";
import PreMatchPage from "./components/PreMatchPage";
import type { MatchEvent, RenderOptions } from "./engine/types";

// ── App flow: "prematch" → "playing" ─────────────────────
type AppScreen = "prematch" | "playing";

export function SimulatePage() {
    const [screen, setScreen]     = useState<AppScreen>("prematch");
    const engineRef               = useRef<MatchEngine | null>(null);

    // Force re-render on tick/events
    const [tick, setTick]         = useState(0);
    const [events, setEvents]     = useState<MatchEvent[]>([]);
    const [showNames, setShowNames] = useState(true);

    const handleMatchReady = useCallback((engine: MatchEngine) => {
        engineRef.current = engine;
        setTick(0);
        setEvents([]);
        setScreen("playing");
    }, []);

    const handleTick = useCallback(() => {
        setTick(t => t + 1);
    }, []);

    const handleEvent = useCallback((evt: MatchEvent) => {
        setEvents(prev => [evt, ...prev].slice(0, 80));
    }, []);

    const handleStart = useCallback(() => {
        const engine = engineRef.current;
        if (!engine) return;
        if (!engine.state.isRunning) {
            engine.start();
        } else {
            engine.pause();
        }
        setTick(t => t + 1);
    }, []);

    const handlePause = useCallback(() => {
        engineRef.current?.pause();
        setTick(t => t + 1);
    }, []);

    const handleReset = useCallback(() => {
        // Go back to prematch setup
        setScreen("prematch");
        setEvents([]);
        setTick(0);
    }, []);

    const renderOptions: RenderOptions = useMemo(() => ({
        showNames,
        showStats: true,
        showHeatmap: false,
        showPossessionArrow: true,
    }), [showNames]);

    // ── Pre-match screen ────────────────────────────────────
    if (screen === "prematch") {
        return <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="pr-2 pb-4 space-y-3">
                    <PreMatchPage onMatchReady={handleMatchReady} />
                </div>
            </ScrollArea>
        </div>
    }

    // ── Match screen ────────────────────────────────────────
    const engine = engineRef.current!;

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="pr-2 pb-4 space-y-3">
                    {/* Header */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 20px",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(0,0,0,0.4)",
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18 }}>⚽</span>
                            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>Football Simulation Engine</span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5 }}>v2.0</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                                <input
                                    type="checkbox"
                                    checked={showNames}
                                    onChange={e => setShowNames(e.target.checked)}
                                    style={{ accentColor: "#e63946" }}
                                />
                                Show names
                            </label>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                                {engine.homeTeam.formation} vs {engine.awayTeam.formation}
                            </span>
                        </div>
                    </div>

                    {/* Main layout */}
                    <div style={{
                        flex: 1,
                        display: "grid",
                        gridTemplateColumns: "1fr 260px",
                        gap: 12,
                        padding: 12,
                        minHeight: 0,
                    }}>
                        {/* Canvas */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                            <FootballField
                                engine={engine}
                                renderOptions={renderOptions}
                                onEvent={handleEvent}
                                onTick={handleTick}
                            />
                            {/* Legend */}
                            <div style={{
                                display: "flex",
                                gap: 16,
                                padding: "6px 10px",
                                background: "rgba(0,0,0,0.4)",
                                borderRadius: 6,
                                fontSize: 10,
                                color: "rgba(255,255,255,0.5)",
                                flexWrap: "wrap",
                            }}>
                                <span><span style={{ color: engine.homeTeam.color }}>●</span> {engine.homeTeam.name} (Home · →)</span>
                                <span><span style={{ color: engine.awayTeam.color }}>●</span> {engine.awayTeam.name} (Away · ←)</span>
                                <span><span style={{ color: "#ffdd44" }}>●</span> Ball carrier</span>
                                <span><span style={{ color: "#44aaff" }}>●</span> Passing</span>
                                <span><span style={{ color: "#ff4444" }}>●</span> Defending</span>
                                <span><span style={{ color: "#ffaa00" }}>●</span> Shooting</span>
                            </div>
                        </div>

                        {/* HUD sidebar */}
                        <div style={{ minWidth: 0, overflow: "hidden", height: "calc(100vh - 100px)" }}>
                            <MatchHUD
                                key={tick > 0 ? "active" : "init"}
                                homeTeam={engine.homeTeam}
                                awayTeam={engine.awayTeam}
                                state={engine.state}
                                events={events}
                                onStart={handleStart}
                                onPause={handlePause}
                                onReset={handleReset}
                            />
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}