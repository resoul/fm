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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const rafRef = useRef<number>(0);

    // Init renderer once canvas is ready
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        rendererRef.current = new Renderer(canvas, engine.field);
    }, [engine.field]);

    // Register engine event callback
    useEffect(() => {
        if (onEvent) {
            engine.onEvent((evt) => {
                onEvent(evt);
                // Flash on goal
                if (evt.type === "goal") {
                    rendererRef.current?.triggerGoalFlash();
                }
            });
        }
    }, [engine, onEvent]);

    // Main game loop
    const gameLoop = useCallback(() => {
        engine.tick();
        onTick?.();

        if (rendererRef.current) {
            rendererRef.current.render(
                engine.homeTeam,
                engine.awayTeam,
                engine.ball,
                engine.state,
                renderOptions,
            );
        }

        rafRef.current = requestAnimationFrame(gameLoop);
    }, [engine, renderOptions, onTick]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(rafRef.current);
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