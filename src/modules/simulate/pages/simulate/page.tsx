import { useState, useCallback, useMemo, useRef } from "react";
import { ScrollArea } from '@/components/scroll-area';
import { MatchEngine } from "@/simulate/matchEngine";
import FootballField from "./components/FootballField";
import MatchHUD from "./components/MatchHUD";
import PreMatchPage from "./components/PreMatchPage";
import type { MatchEvent, RenderOptions } from "@/simulate/types";
import PostMatchReportUI from "./components/PostMatchReportUI";
import type { PostMatchReport } from "@/simulate/stats/PostMatchReport";

type AppScreen = "prematch" | "playing" | "report";

export function SimulatePage() {
    const [screen, setScreen]     = useState<AppScreen>("prematch");
    const [report, setReport] = useState<PostMatchReport | null>(null);
    const engineRef               = useRef<MatchEngine | null>(null);

    // Force re-render on tick/events
    const [tick, setTick]         = useState(0);
    const [events, setEvents]     = useState<MatchEvent[]>([]);
    const [showNames, setShowNames] = useState(true);

    // 7.2 Tactical overlay toggles
    const [showZones, setShowZones] = useState(false);
    const [showPassingLanes, setShowPassingLanes] = useState(false);
    const [showDefensiveLine, setShowDefensiveLine] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [showDebugInfo, setShowDebugInfo] = useState(true);

    const handleMatchReady = useCallback((engine: MatchEngine) => {
        engineRef.current = engine;
        setTick(0);
        setEvents([]);
        setScreen("playing");
    }, []);

    const handleTick = useCallback(() => {
        setTick(t => t + 1);
        const engine = engineRef.current;
        if (!engine) return;
        if (engine.state.phase === "fulltime") {
            // MatchSimulator вешает _finalise() сам на первый fulltime tick.
            // Даём один кадр чтобы report точно был готов.
            const sim = (engine as any).activeSimulator;
            const r: PostMatchReport | null = sim?.getPostMatchReport?.() ?? null;
            if (r) {
                setReport(r);
                setScreen("report");
            }
        }
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

    // 7.1 Jump-to-moment: pause + fast-forward to target tick
    const handleJumpToTick = useCallback((targetTick: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        // Pause first
        engine.pause();
        // Fast-forward to the target tick by stepping (capped to prevent hang)
        const currentTick = engine.state.tick;
        if (targetTick <= currentTick) {
            // Can't go back without full restart — just highlight
            setTick(t => t + 1);
            return;
        }
        const steps = Math.min(targetTick - currentTick, 3600); // max 60s of sim
        for (let i = 0; i < steps; i++) {
            engine.tick();
        }
        setTick(t => t + 1);
    }, []);

    const handleReset = useCallback(() => {
        setScreen("prematch");
        setEvents([]);
        setTick(0);
        setReport(null);
    }, []);

    const renderOptions: RenderOptions = useMemo(() => ({
        showNames,
        showStats: true,
        showHeatmap,
        showPossessionArrow: true,
        showZones,
        showPassingLanes,
        showDefensiveLine,
        showPressureHeatmap: false,
        showDebugInfo,
    }), [showNames, showHeatmap, showZones, showPassingLanes, showDefensiveLine, showDebugInfo]);

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

    if (screen === "report" && report) {
        return (
            <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
                <ScrollArea className="h-full">
                    <div className="pr-2 pb-4 space-y-3">
                        <PostMatchReportUI
                            report={report}
                            onNewMatch={handleReset}
                        />
                    </div>
                </ScrollArea>
            </div>
        );
    }

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
                                Names
                            </label>
                            {/* 7.2 Tactical Overlay toggles */}
                            {(["Zones", "Lanes", "Def. Line", "Heatmap", "Debug"] as const).map((label, i) => {
                                const [val, setter] = [
                                    [showZones, setShowZones],
                                    [showPassingLanes, setShowPassingLanes],
                                    [showDefensiveLine, setShowDefensiveLine],
                                    [showHeatmap, setShowHeatmap],
                                    [showDebugInfo, setShowDebugInfo],
                                ][i] as [boolean, (v: boolean) => void];
                                return (
                                    <label key={label} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 10, color: val ? "rgba(180,220,255,0.9)" : "rgba(255,255,255,0.4)" }}>
                                        <input
                                            type="checkbox"
                                            checked={val}
                                            onChange={e => setter(e.target.checked)}
                                            style={{ accentColor: "#44aaff", width: 10, height: 10 }}
                                        />
                                        {label}
                                    </label>
                                );
                            })}
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
                                onJumpToTick={handleJumpToTick}
                                canReplay={true}
                            />
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}