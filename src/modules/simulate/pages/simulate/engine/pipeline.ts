import { SimulationContext } from "./context";

/**
 * Interface for a simulation system.
 */
export interface SimulationSystem {
    name: string;
    update(ctx: SimulationContext): void;
}

/**
 * Orchestrates the execution of multiple systems in a fixed order.
 */
export class SimulationPipeline {
    private systems: SimulationSystem[] = [];

    /**
     * Adds a system to the pipeline. Systems are executed in the order they are added.
     */
    addSystem(system: SimulationSystem) {
        this.systems.push(system);
        return this;
    }

    /**
     * Executes one simulation tick across all systems.
     */
    update(ctx: SimulationContext) {
        for (const system of this.systems) {
            system.update(ctx);
        }
    }

    clear() {
        this.systems = [];
    }
}
