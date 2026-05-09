import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { CommandResolver } from "../core/CommandResolver";
import { DecisionSystem } from "../systems/DecisionSystem";
import { MovementSystem } from "../systems/MovementSystem";
import { ShootingSystem } from "../systems/ShootingSystem";
import { PassingSystem } from "../systems/PassingSystem";
import { GoalkeeperSystem } from "../systems/GoalkeeperSystem";
import { TackleSystem } from "../systems/TackleSystem";
import { PhysicsSystem } from "../systems/PhysicsSystem";
import { RefereeSystem } from "../systems/RefereeSystem";
import { TacticalSystem } from "../systems/TacticalSystem";

export class MatchSimulator extends BaseSimulator {
    private resolver: CommandResolver;

    constructor(world: SimulationWorld) {
        super(world);
        this.resolver = new CommandResolver();

        // Register systems in order
        this.pipeline
            .addSystem(new TacticalSystem())
            .addSystem(new DecisionSystem())
            .addSystem(new GoalkeeperSystem())
            .addSystem(new ShootingSystem())
            .addSystem(new PassingSystem())
            .addSystem(new TackleSystem())
            .addSystem(new MovementSystem())
            .addSystem(new PhysicsSystem())
            .addSystem(new RefereeSystem());
    }

    step(): void {
        this.world.state.tick++;
        this.updateSpatialHash();
        const ctx = this.createContext();
        const commands = this.pipeline.update(ctx);
        this.resolver.resolve(this.world, commands);
    }
}
