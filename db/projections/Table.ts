import db from "@/../db/db"
import type { Competion } from "db/models";
import { Club } from "../models/Club";

export default class Table {
    
    competition: Competion;
    type: string;
    clubs: TableClub[];

    constructor(competion: Competion, type: string){
        this.competition = competion;
        this.type = type;
        this.clubs = [];
    }

    getTable(sort: Exclude<keyof TableClub, "club"> = 'points'): TableClub[]{
        let table = this.clubs;
        if (sort == 'points'){
            table.sort((a, b) => {
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                return b.goalDifference - a.goalDifference;
            });
        } else {
            table.sort((a, b) => {
                return b[sort] - a[sort];
            });
        }

        return table;
    }

    async initTable(){
        
        if (this.clubs.length > 0){
            return this.clubs;
        }

        const seasonId = (await this.competition.getActiveSeason()).id;
        const [seasonClubs, rounds] = await Promise.all([
            db.table('seasonClub').where('seasonId').equals(seasonId).toArray(),
            db.table('round').where('seasonId').equals(seasonId).toArray()
        ]);

        const roundIds = rounds.map(r => r.id);

        const allMatches = await db.table('match')
            .where('roundId')
            .anyOf(roundIds)
            .filter(m => m.status === 'played')
            .toArray();

        for (const sClub of seasonClubs) {
            const club = await db.table('club').get(sClub.clubId);
            if (!club) continue;

            const row = new TableClub(club);

            const clubMatches = allMatches.filter(
                m => m.homeClubId === club.id || m.awayClubId === club.id
            );

            clubMatches.forEach(match => {
                const isHome = match.homeClubId === club.id;
                const homeG = match.homeGoals || 0;
                const awayG = match.awayGoals || 0;
                const diff = homeG - awayG;

                row.played++;
                if (diff === 0) {
                    row.draws++;
                    row.points += 1;
                } else if ((isHome && diff > 0) || (!isHome && diff < 0)) {
                    row.wins++;
                    row.points += 3;
                } else {
                    row.losses++;
                }

                row.scoredGoals += isHome ? homeG : awayG;
                row.missedGoals += isHome ? awayG : homeG;
            });

            row.goalDifference = row.scoredGoals - row.missedGoals;
            this.clubs.push(row);
        }

        return this.clubs;
    }
}

export class TableClub{
    club: Club;
    points: number;
    missedGoals: number;
    scoredGoals: number;
    goalDifference: number;
    played: number;
    losses: number;
    wins: number;
    draws: number;

    constructor(club: Club){
        this.club = club;
        this.points = 0;
        this.missedGoals = 0;
        this.scoredGoals = 0;
        this.goalDifference = 0;
        this.played = 0;
        this.losses = 0;
        this.wins = 0;
        this.draws = 0;
    }

}