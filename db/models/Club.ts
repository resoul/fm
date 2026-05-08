import Schedule from "@/../db/projections/Schedule";
import db from "../db";
import { Match } from "./Match";

export class Club {
    id!: number;
    name!: string;
    color!: string | null;

    async getSchedule(dateTime: Date): Promise<Schedule> {
        const schedule = new Schedule(this);
        const matches = await db.table<Match>('match').where('homeClubId').equals(this.id).and(
            match => new Date(match.date) >= dateTime
        ).toArray();
        const awayMatches = await db.table<Match>('match').where('awayClubId').equals(this.id).and(
            match => new Date(match.date) >= dateTime
        ).toArray();
        const allMatches = [...matches, ...awayMatches];
        allMatches.sort((a, b) => a.date.localeCompare(b.date));
        await Promise.all(allMatches.map(async (match) => {
            const rivalId = match.homeClubId != this.id ? match.homeClubId : match.awayClubId;
            const rival = await db.table('club').get(rivalId);
            schedule.addFixture(match, rival);
        }));

        return schedule;
    }
}