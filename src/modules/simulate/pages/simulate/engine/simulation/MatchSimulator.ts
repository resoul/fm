import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { CommandResolver } from "../core/CommandResolver";
import {
    DecisionSystem, MovementSystem, ShootingSystem, PassingSystem,
    GoalkeeperSystem, TackleSystem, PhysicsSystem, RefereeSystem, TacticalSystem,
    OffBallSystem, RestartIntelligenceSystem,
} from "../match/systems";
import { ZoneSystem } from "../systems/ZoneSystem";
import { MomentumSystem } from "../systems/MomentumSystem";
import { TacticalInstructionsSystem } from "../systems/TacticalInstructionsSystem";
import { MatchRhythmSystem } from "../systems/MatchRhythmSystem";

export class MatchSimulator extends BaseSimulator {
    private resolver: CommandResolver;

    constructor(world: SimulationWorld) {
        super(world);
        this.resolver = new CommandResolver();

        this.pipeline
            .addSystem(new TacticalSystem())
            .addSystem(new ZoneSystem())
            .addSystem(new MomentumSystem())
            .addSystem(new MatchRhythmSystem())
            .addSystem(new TacticalInstructionsSystem())
            .addSystem(new RestartIntelligenceSystem())
            .addSystem(new OffBallSystem())
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