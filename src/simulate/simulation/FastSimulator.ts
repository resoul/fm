// ============================================================
// FastSimulator — полноценный розыгрыш без рендера
//
// Отличия от MatchSimulator:
//   • Нет CoachSystem / SubstitutionSystem / TacticalInstructionsSystem
//     (тактические замены не нужны для фонового расчёта)
//   • Нет ZoneSystem / MomentumSystem / MatchRhythmSystem / OffBallSystem
//     (экономим ~30% CPU на тик, результат матча не меняется)
//   • Все системы начисления статистики ЕСТЬ:
//     PassingSystem, AerialSystem, ShootingSystem, TackleSystem, MovementSystem,
//     GoalkeeperSystem — ctx.playerStats заполняется полностью
//   • После fulltime автоматически вызывает _finalise():
//     finaliseStats → rateAllPlayers → buildPostMatchReport
//   • B.5: _finalise() вызывает applyPostMatchFatigue для каждого
//     игрока, у которого есть ProfileId → persistится fitness/form
//   • runToEnd() — синхронный цикл до fulltime, возвращает отчёт
// ============================================================

import { BaseSimulator } from "./BaseSimulator";
import { SimulationWorld } from "../core/SimulationWorld";
import { CommandResolver } from "../core/CommandResolver";
import {
    AerialSystem,
    DecisionSystem,
    MovementSystem,
    ShootingSystem,
    PassingSystem,
    GoalkeeperSystem,
    TackleSystem,
    PhysicsSystem,
    RefereeSystem,
    TacticalSystem,
    ZoneSystem,
    TacticalInstructionsSystem,
    OffBallSystem,
} from "../match/systems";
import { finaliseStats } from "../stats/PlayerMatchStats";
import { rateAllPlayers } from "../stats/PlayerRating";
import {
    buildPostMatchReport,
    type PostMatchReport,
} from "../stats/PostMatchReport";
import {
    applyPostMatchFatigue,
    type MatchFatigueRecord,
} from "../coach/FormFatigueModel";
import type { Club } from "../types";

export class FastSimulator extends BaseSimulator {
    private resolver: CommandResolver;
    private _report: PostMatchReport | null = null;

    private _homeClub: Club | null = null;
    private _awayClub: Club | null = null;

    constructor(world: SimulationWorld) {
        super(world);
        this.resolver = new CommandResolver();

        // ── Pipeline ──────────────────────────────────────
        // S.1: ZoneSystem and TacticalInstructionsSystem added for FastSim parity.
        // ZoneSystem must run before DecisionSystem and OffBallSystem.
        // TacticalInstructionsSystem feeds style (gegenpress/tiki_taka) to UtilityAI.
        this.pipeline
            .addSystem(new TacticalSystem())
            .addSystem(new ZoneSystem())
            .addSystem(new TacticalInstructionsSystem())
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

    setClubs(homeClub: Club, awayClub: Club): this {
        this._homeClub = homeClub;
        this._awayClub = awayClub;
        return this;
    }

    step(): void {
        this.world.state.tick++;
        this.updateSpatialHash();
        const ctx = this.createContext();
        const commands = this.pipeline.update(ctx);
        this.resolver.resolve(this.world, commands);

        if (this.world.state.phase === "fulltime" && !this._report) {
            this._finalise();
        }
    }

    private _finalise(): void {
        for (const stats of this.playerStats.values()) {
            finaliseStats(stats);
        }

        rateAllPlayers(
            this.playerStats,
            this.world.homeTeam.players,
            this.world.awayTeam.players,
            this.world.awayTeam.score,
            this.world.homeTeam.score,
        );

        this._report = buildPostMatchReport({
            homeTeam:     this.world.homeTeam,
            awayTeam:     this.world.awayTeam,
            state:        this.world.state,
            playerStats:  this.playerStats,
            observations: [],
        });

        // ── B.5: persist fitness / form onto PlayerProfiles ───
        const clubs = [
            { club: this._homeClub, team: this.world.homeTeam },
            { club: this._awayClub, team: this.world.awayTeam },
        ];

        for (const { club, team } of clubs) {
            if (!club) continue;

            for (const player of team.players) {
                if (!player.profileId) continue;
                const profile = club.squad.find(p => p.id === player.profileId);
                if (!profile) continue;

                const stats = this.playerStats.get(player.id);
                const rating = stats?.rating ?? 6.0;

                // Собираем последние рейтинги из профиля для sliding average.
                // PlayerProfile не хранит историю рейтингов — передаём пустой
                // массив, FormFatigueModel сам сформирует окно из текущего.
                const record: MatchFatigueRecord = {
                    playerId:          player.id,
                    fatigueAtFullTime: player.fatigue,
                    matchRating:       rating,
                    minutesPlayed:     stats?.minutesPlayed ?? 90,
                };

                applyPostMatchFatigue(profile, record, []);
            }
        }
    }

    // ── Public API ────────────────────────────────────────

    /**
     * Синхронный прогон всего матча до fulltime.
     * Вызывать в Worker или после await (не в main thread на 60fps).
     *
     * @param maxTicks  защита от бесконечного цикла (default 400 000 ≈ 110 мин при 60fps)
     * @returns PostMatchReport сразу после завершения
     */
    runToEnd(maxTicks = 400_000): PostMatchReport {
        let guard = 0;
        while (this.world.state.phase !== "fulltime" && guard < maxTicks) {
            this.step();
            guard++;
        }
        if (!this._report) {
            this._finalise();
        }
        return this._report!;
    }

    /** Готовый отчёт (null пока матч не завершён) */
    getPostMatchReport(): PostMatchReport | null {
        return this._report;
    }

    /** Read-only доступ к статистике игроков */
    getPlayerStats(): ReadonlyMap<
        string,
        import("../stats/PlayerMatchStats").PlayerMatchStats
    > {
        return this.playerStats;
    }
}