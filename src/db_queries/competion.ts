import db  from "@/../db/db";

export const competionByClubId = async (clubId: number, competionType = 'league') => {
    const competitions = await competionsByClubId(clubId);
    return competitions.find(c => c.type === competionType);
}

export const competionsByClubId = async (clubId: number) => {
    const seasonClubs = await db.table("seasonClub").where('clubId').equals(clubId).toArray();
    const seasonIds = seasonClubs.map(sc => sc.seasonId);
    const seasons = await db.table("season").bulkGet(seasonIds);
    const seasonsMap = new Map(seasons.map(s => [s.competitionId, s]));
    const competitions = await db.table("competition").bulkGet(seasons.map(s => s.competitionId));

    return competitions.map(c => {
        return {
            ...c,
            season: seasonsMap.get(c.id),
        };
    });
}