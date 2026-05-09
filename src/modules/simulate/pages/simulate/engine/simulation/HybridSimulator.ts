import { BaseSimulator } from "./BaseSimulator";
import { MatchSimulator } from "./MatchSimulator";
import { FastSimulator } from "./FastSimulator";
import { SimulationWorld } from "../core/SimulationWorld";

export class HybridSimulator extends BaseSimulator {
    private matchSim: MatchSimulator;
    private fastSim: FastSimulator;
    private isHighlightMode: boolean = false;
    private highlightDuration: number = 0;

    constructor(world: SimulationWorld) {
        super(world);
        this.matchSim = new MatchSimulator(world);
        this.fastSim = new FastSimulator(world);
    }

    step(): void {
        if (this.isHighlightMode) {
            this.matchSim.step();
            this.highlightDuration--;
            if (this.highlightDuration <= 0) {
                this.isHighlightMode = false;
                console.log("Switching to Fast Simulation");
            }
        } else {
            this.fastSim.step();
            if (this.checkHighlightNeeded()) {
                this.isHighlightMode = true;
                this.highlightDuration = 600; // ~10 seconds of highlight
                console.log("Switching to Highlight Mode (Real-time)");
            }
        }
    }

    private checkHighlightNeeded(): boolean {
        const state = this.world.state;
        
        // Simple highlight detection: 
        // 1. Goal scored in last step
        // 2. Ball is near penalty area
        const ball = this.world.ball;
        const field = this.world.config.fieldDimensions;
        
        const inPenaltyArea = ball.pos.x < 150 || ball.pos.x > field.width - 150;
        
        // In FastSim, we can check if a "goal" event was recently emitted
        const lastEvent = state.events[state.events.length - 1];
        const isNewGoal = lastEvent?.type === "goal" && state.tick - lastEvent.minute * 60 * 60 < 100;

        return isNewGoal || (inPenaltyArea && this.world.rng.next() < 0.01);
    }
}
