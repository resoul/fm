import { addEvent } from "@/state/useEventStates";
import type { IEvent } from "./IEvent";
import db from "@/../db/db";
import { simulateGoals } from "@/lib/utils/poisson";
import { MatchStatusEnum } from "@/../db/models";
import ManagerMatches from "@/../db/caches/ManagerMatches";

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
            ManagerMatches.setDateChanged(dateTime);
        }
    }

    async symulateMatch(matches: {id: number, homeClubId: number, awayClubId: number}[]) {
        await db.transaction('rw', db.table('match'), async () => {
            await Promise.all(matches.map(async (match) => {
                await db.table('match').update(match.id, {
                    homeGoals: simulateGoals(1.65),
                    awayGoals: simulateGoals(1.20),
                    status: MatchStatusEnum.ended,
                });
            }));
        });
    }

}