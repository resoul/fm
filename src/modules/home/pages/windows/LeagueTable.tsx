import { cn } from "@/lib/utils";
import { SectionHeader } from "../../componets/SectionHeader";
import { useManager } from "@/hooks/useManager";
import type { Club } from "@/schemas/club";
import { useLiveQuery } from "dexie-react-hooks";
import db  from "@/../db/db";

type LeagueTableType = {
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

export default function LeagueTable() {

    const manager = useManager();
    const seasonId = 1; // TODO: get current season id

    const table = useLiveQuery<LeagueTableType[]>(
    async () => {
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

        // 4. Сортируем (используя логику "spaceship")
        return leagueTable.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
    }, [seasonId]
);

    if (table == undefined || manager == undefined) {
        return <>Loading...</>;
    }

    table.sort((a, b) => {
        if (b.points !== a.points) {
            return b.points - a.points;
        }
        return b.goalDifference - a.goalDifference;
    });

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            <SectionHeader title="LEAGUE TABLE" />
            <p className="text-[10px] text-zinc-500 text-center mb-2">League Positions</p>
            <table className="w-full text-xs">
                <thead>
                <tr className="text-zinc-600 text-[10px]">
                    <th className="text-left py-0.5 w-6">POS</th>
                    <th className="text-left py-0.5">TEAM</th>
                    <th className="text-right py-0.5 w-4">P</th>
                    <th className="text-right py-0.5 w-6">GD</th>
                    <th className="text-right py-0.5 w-7">PTS</th>
                </tr>
                </thead>
                <tbody>
                {table.map((table: LeagueTableType) => (
                    <tr key={table.club.id} className={cn('cursor-pointer hover:bg-zinc-800/30 transition-colors', table.club.id == manager.clubId && 'bg-zinc-800/50')}>
                        <td className="py-px text-zinc-600 text-[10px]">{table.club.pos}</td>
                        <td className="py-px">
                            <div className="flex items-center gap-1">
                                <div className={cn('size-2.5 rounded-full shrink-0', table.club.color ?? 'bg-zinc-600')} />
                                <span className={cn('truncate text-[11px]', table.club.id == manager.clubId ? 'text-teal-400 font-medium' : 'text-zinc-300')}>
                                        {table.club.name}
                                    </span>
                            </div>
                        </td>
                        <td className="py-px text-right text-zinc-600 text-[10px]">{table.played}</td>
                        <td className="py-px text-right text-zinc-600 text-[10px]">{table.goalDifference}</td>
                        <td className="py-px text-right text-zinc-500 text-[10px] font-medium">{table.points}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}