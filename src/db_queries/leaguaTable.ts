import type { Club } from "@/schemas/club";
import db  from "@/../db/db";

export type LeagueTableType = {
    club: Club;
    points: number;
    missedGoals: number;
    scoredGoals: number;
    goalDifference: number;
    played: number;
    losses: number;
    wins: number;
    draws: number;
}

export const leguaTableByCompetionId = async(competitionId: number): Promise<LeagueTableType[]> => {
    console.log(db.table('season').schema.indexes.map(idx => idx.name));
    const seasons = await db.table('season')
        .where({ 
            competitionId: competitionId, 
            isActive: 1 
        })
        .first();
    const table = await leaguaTableBySeasonId(seasons.id);

    return table;
}


export const leaguaTableBySeasonId = async(seasonId: number): Promise<LeagueTableType[]> => {
    // 1. Получаем клубы и раунды
    const [seasonClubs, rounds] = await Promise.all([
        db.table('seasonClub').where('seasonId').equals(seasonId).toArray(),
        db.table('round').where('seasonId').equals(seasonId).toArray()
    ]);

    const roundIds = rounds.map(r => r.id);
    
    // 2. Сразу получаем ВСЕ сыгранные матчи этого сезона одним запросом
    // Это критически важно для производительности и корректности слежения
    const allMatches = await db.table('match')
        .where('roundId')
        .anyOf(roundIds)
        .filter(m => m.status === 'played')
        .toArray();

    // 3. Формируем таблицу
    const leagueTable: LeagueTableType[] = [];

    for (const sClub of seasonClubs) {
        const club = await db.table('club').get(sClub.clubId);
        if (!club) continue;

        const row: LeagueTableType = {
            club, points: 0, missedGoals: 0, scoredGoals: 0,
            goalDifference: 0, played: 0, losses: 0, wins: 0, draws: 0,
        };

        // Фильтруем матчи в памяти (это быстрее, чем делать запросы к БД в цикле)
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
        leagueTable.push(row);
    }

    return leagueTable;
}