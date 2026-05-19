import { addEvent } from "@/state/useEventStates";
import type { IEvent } from "./IEvent";
import db from "@/../db/db";
import { simulateGoals } from "@/lib/utils/poisson";
import { FinishMethodEnum, Match, MatchStatusEnum, StageEnum } from "@/../db/models";

const hourInMs = 60 * 60 * 1000;

export default class MatcheEvent implements IEvent {

    async dispatch(dateTime: string) {

        const matches = await db.table('match').where('date').equals(dateTime).toArray();

        if (matches.length > 0) {
            addEvent("Matches");
        }

        const datet = new Date(new Date(dateTime).getTime() - 2 * hourInMs);
        const matchest = await db.match.where('date').equals(datet.toISOString().slice(0, 19)).toArray();
        if (matchest.length > 0) {
            await this.symulateMatch(matchest);
            addEvent("Matches");
        }
    }

    async symulateMatch(matches: Match[]) {
        await db.transaction('rw', db.table('match'), async () => {
            
            await Promise.all(matches.map(async (match) => {
                let homeGoals = simulateGoals(1.65);
                let awayGoals = simulateGoals(1.20);
                let finishMethod = FinishMethodEnum.regular;
                let homePenalty = 0;
                let awayPenalty = 0;
                
                if (homeGoals == awayGoals && (await match.getStage()).type == StageEnum.cup){
                    homeGoals += simulateGoals(1.35);
                    awayGoals += simulateGoals(1.10);
                    finishMethod = FinishMethodEnum.overtime;
                    if (homeGoals == awayGoals){
                        [homePenalty, awayPenalty] = this.symulatePenalty();
                        finishMethod = FinishMethodEnum.penalties;
                    }
                }

                await db.match.update(match.id, {
                    homeGoals: homeGoals,
                    awayGoals: awayGoals,
                    status: MatchStatusEnum.ended,
                    finishMethod: finishMethod,
                    homePenalty: homePenalty,
                    awayPenalty: awayPenalty,
                });
            }));
        });
    }

    symulatePenalty(){
        let first = 0;
        let second = 0;

        for (let i = 1; i < 6; i++){
            first += this.takePenalty();
            if (Math.abs(first - second) > 5 - i + 1){
                break;
            }
            second += this.takePenalty();
            if (Math.abs(first - second) > 5 - i){
                break;
            }
        }

        while(first == second){
            first += this.takePenalty();
            second += this.takePenalty();
        }

        return [first, second];
    }

    takePenalty(skillLevel = 0.8) {
        return Math.random() < skillLevel ? 1 : 0;
    }

}