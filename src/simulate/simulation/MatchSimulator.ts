import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { CommandResolver } from "../core/CommandResolver";
import {
    DecisionSystem, MovementSystem, ShootingSystem, PassingSystem, AerialSystem,
    GoalkeeperSystem, TackleSystem, PhysicsSystem, RefereeSystem, TacticalSystem,
    OffBallSystem, RestartIntelligenceSystem,
} from "../match/systems";
import { ZoneSystem } from "../systems/ZoneSystem";
import { MomentumSystem } from "../systems/MomentumSystem";
import { TacticalInstructionsSystem } from "../systems/TacticalInstructionsSystem";
import { MatchRhythmSystem } from "../systems/MatchRhythmSystem";
import { MatchAnalyzer } from "../coach/MatchAnalyzer";
import { CoachSystem } from "../coach/CoachSystem";
import { SubstitutionSystem } from "../coach/SubstitutionSystem";
import { COACH_ARCHETYPES } from "../coach/CoachProfile";
import { finaliseStats } from "../stats/PlayerMatchStats";
import { rateAllPlayers } from "../stats/PlayerRating";
import { buildPostMatchReport, type PostMatchReport } from "../stats/PostMatchReport";

export class MatchSimulator extends BaseSimulator {
    private resolver: CommandResolver;
    private _postMatchReport: PostMatchReport | null = null;

    // ── Coach layer ────────────────────────────────────────
    readonly analyzer:       MatchAnalyzer;
    readonly tacticalSystem: TacticalInstructionsSystem;
    readonly subSystem:      SubstitutionSystem;

    constructor(
        world: SimulationWorld,
        options?: {
            maxSubstitutions?: number;
        },
    ) {
        super(world);
        this.resolver = new CommandResolver();

        // Instantiate shared coach-layer objects so they can be
        // referenced by the pipeline and also exposed for tests / UI.
        this.analyzer       = new MatchAnalyzer();
        this.tacticalSystem = new TacticalInstructionsSystem();
        this.subSystem      = new SubstitutionSystem(options?.maxSubstitutions ?? 3);

        // Default coaches — balanced archetype for both sides.
        // Consumers can call setCoach() before match start to override.
        const homeCoach = { ...COACH_ARCHETYPES.balanced, id: "home_coach", name: "Home Coach" };
        const awayCoach = { ...COACH_ARCHETYPES.balanced, id: "away_coach", name: "Away Coach" };

        const coachSystem = new CoachSystem(
            this.analyzer,
            this.tacticalSystem,
            this.subSystem,
            homeCoach,
            awayCoach,
        );

        this.pipeline
            .addSystem(new TacticalSystem())
            .addSystem(new ZoneSystem())
            .addSystem(new MomentumSystem())
            .addSystem(new MatchRhythmSystem())
            // ── Coach layer: reads rhythm, writes style + subs ──
            .addSystem(coachSystem)
            .addSystem(this.subSystem)
            .addSystem(this.tacticalSystem)
            // ── Rest of pipeline unchanged ──────────────────────
            .addSystem(new RestartIntelligenceSystem())
            .addSystem(new OffBallSystem())
            .addSystem(new DecisionSystem())
            .addSystem(new GoalkeeperSystem())
            .addSystem(new ShootingSystem())
            .addSystem(new PassingSystem())
            .addSystem(new AerialSystem())
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

        if (this.world.state.phase === "fulltime" && !this._postMatchReport) {
            this._finalise();
        }
    }

    // ── Public API ────────────────────────────────────────

    /**
     * Override the default balanced coach for one side.
     * Must be called before the first step().
     *
     * Example:
     *   sim.setCoach("home", COACH_ARCHETYPES.aggressive);
     */
    setCoach(_side: import("../types").TeamSide, _coach: import("../coach/CoachProfile").CoachProfile): void {
        // CoachSystem holds references — we re-create it with the new profile.
        // Easiest approach: expose the CoachSystem ref and update its internal profile.
        // For now, this is a documentation stub — see CoachSystem._homeCoach/_awayCoach
        // for full access. In a future iteration, expose setHomeCoach/setAwayCoach on CoachSystem.
        console.warn("setCoach: hot-swap not yet wired — pass coach in MatchSimulator constructor options");
    }

    /** Read-only access to accumulated per-player stats */
    getPlayerStats(): ReadonlyMap<string, import("../stats/PlayerMatchStats").PlayerMatchStats> {
        return this.playerStats;
    }

    /** Observations collected by MatchAnalyzer this match */
    getObservations(): ReturnType<typeof this.analyzer.getObservations> {
        return this.analyzer.getObservations();
    }

    private _finalise(): void {
        // Считаем passAccuracy и прочие derived fields
        for (const stats of this.playerStats.values()) {
            finaliseStats(stats);
        }

        // Рейтинги — GK получает goalsConceded от противника
        rateAllPlayers(
            this.playerStats,
            this.world.homeTeam.players,
            this.world.awayTeam.players,
            this.world.awayTeam.score,  // голы пропущенные home GK
            this.world.homeTeam.score,  // голы пропущенные away GK
        );

        this._postMatchReport = buildPostMatchReport({
            homeTeam:     this.world.homeTeam,
            awayTeam:     this.world.awayTeam,
            state:        this.world.state,
            playerStats:  this.playerStats,
            observations: this.analyzer.getObservations(),
        });
    }

    /** Возвращает готовый отчёт после fulltime, до этого — null */
    getPostMatchReport(): PostMatchReport | null {
        return this._postMatchReport;
    }
}