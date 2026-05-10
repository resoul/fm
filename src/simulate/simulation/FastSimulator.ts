import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { CommandResolver } from "../core/CommandResolver";
import { DecisionSystem, PhysicsSystem, RefereeSystem } from "../match/systems";

export class FastSimulator extends BaseSimulator {
    private resolver: CommandResolver;

    constructor(world: SimulationWorld) {
        super(world);
        this.resolver = new CommandResolver();
        
        // Fast simulator only runs essential systems
        this.pipeline
            .addSystem(new DecisionSystem())
            .addSystem(new PhysicsSystem())
            .addSystem(new RefereeSystem());
    }

    step(): void {
        this.world.state.tick++;
        const ctx = this.createContext();
        const commands = this.pipeline.update(ctx);
        this.resolver.resolve(this.world, commands);
    }
}
