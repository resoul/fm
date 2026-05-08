import DbError from "../errors/DbError";
import db from "../db";
import type { Competion } from "./Competition";

export class Manager{
    id!: number;
    clubId!: number;
    name!: string;

    async getCompetion(type: string): Promise<Competion>{
        const competitions = await this.getCompetions();
        const competition = competitions.find(c => c.type === type);
        if (!competition){
            throw new DbError(`No competition type ${type} found for manager ${this.id}`);
        }

        return competition;
    }

    async getCompetions(): Promise<Competion[]>{
        const seasonClubs = await db.table("seasonClub").where('clubId').equals(this.clubId).toArray();
        const seasonIds = seasonClubs.map(sc => sc.seasonId);
        const seasons = await db.table("season").bulkGet(seasonIds);

        return await db.table("competition").bulkGet(seasons.map(s => s.competitionId));
    }

    async schedule(dateTime: Date){

        const matches = await db.table('match').where('homeClubId').equals(this.clubId).and(
                match => new Date(match.date) >= dateTime
            ).toArray();
            const awayMatches = await db.table('match').where('awayClubId').equals(this.clubId).and(
                match => new Date(match.date) >= dateTime
            ).toArray();
            const allMatches = [...matches, ...awayMatches];
            allMatches.sort((a, b) => a.date.localeCompare(b.date));
            const fixtures = await Promise.all(allMatches.map(async (match) => {
                const [homeClub, awayClub] = await Promise.all([
                    db.table('club').get(match.homeClubId),
                    db.table('club').get(match.awayClubId)
                ]);
                return {
                    date: new Date(match.date).toLocaleDateString(),
                    venue: match.venue,
                    homeClub: homeClub,
                    awayClub: awayClub,
                };
            }));
            return fixtures;
    }
}