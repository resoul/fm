import React, { useRef, useEffect, useCallback } from "react";
import { MatchEngine } from "../engine/matchEngine";
import { Renderer } from "../engine/renderer";
import type { RenderOptions, MatchEvent } from "../engine/types";

interface FootballFieldProps {
    engine: MatchEngine;
    renderOptions: RenderOptions;
    onEvent?: (event: MatchEvent) => void;
    onTick?: () => void;
}

const CANVAS_WIDTH  = 720;
const CANVAS_HEIGHT = 480;

const FootballField: React.FC<FootballFieldProps> = ({
                                                         engine,
                                                         renderOptions,
                                                         onEvent,
                                                         onTick,
                                                     }) => {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const rafRef      = useRef<number>(0);
    // FIX: track whether the loop is intentionally stopped (tab hidden)
    const isActiveRef = useRef<boolean>(true);
    const lastFrameTimeRef = useRef<number>(0);

    // Init renderer once canvas is ready
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        rendererRef.current = new Renderer(canvas, engine.field);
    }, [engine.field]);

    // Register engine event callback
    useEffect(() => {
        if (!onEvent) return;
        
        const listener = (evt: MatchEvent) => {
            onEvent(evt);
            if (evt.type === "goal") {
                rendererRef.current?.triggerGoalFlash();
            }
        };

        engine.onEvent(listener);
        return () => {
            engine.offEvent(listener);
        };
    }, [engine, onEvent]);

    // Main game loop
    const gameLoop = useCallback((timestamp: number) => {
        // FIX: if the tab was hidden and we're back, reset lastFrameTime
        // so we don't accumulate a huge deltaTime that would run hundreds of ticks at once
        if (lastFrameTimeRef.current === 0) {
            lastFrameTimeRef.current = timestamp;
        }
        const delta = timestamp - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timestamp;

        // FIX: if delta is too large (>200ms = tab was hidden), skip simulation
        // this prevents the engine from trying to "catch up" after a tab switch
        if (delta < 200) {
            engine.tick();
            onTick?.();
        }

        if (rendererRef.current) {
            rendererRef.current.render(
                engine.homeTeam,
                engine.awayTeam,
                engine.ball,
                engine.state,
                renderOptions,
                engine.world.tacticalData,
            );
        }

        rafRef.current = requestAnimationFrame(gameLoop);
    }, [engine, renderOptions, onTick]);

    // FIX: Page Visibility API — pause/resume RAF when tab is hidden/shown
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Tab is hidden: cancel the animation frame
                isActiveRef.current = false;
                if (rafRef.current) {
                    cancelAnimationFrame(rafRef.current);
                    rafRef.current = 0;
                }
            } else {
                // Tab is visible again: reset frame time and restart loop
                isActiveRef.current = true;
                lastFrameTimeRef.current = 0; // will be reset on first frame
                rafRef.current = requestAnimationFrame(gameLoop);
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [gameLoop]);

    // Start the RAF loop
    useEffect(() => {
        lastFrameTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(gameLoop);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [gameLoop]);

    return (
        <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: "4px",
                boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
        />
    );
};

export default FootballField;