import { cn } from "@/lib/utils";
import { SectionHeader } from "../../componets/SectionHeader";
import { useManager } from "@/state/useManager";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import type Table from "@/../db/projections/Table";
import type { TableClub } from "@/../db/projections/Table";
import db from "@/../db/db";
import type { Stage } from "@/../db/models";

export default function LeagueTable() {

    const manager = useManager(state => state.manager);
    const [sort, setSort] = useState<Exclude<keyof TableClub, "club">>('points');

    const table = useLiveQuery<Table>(
        async () => {
            const competition = await manager.getCompetition('league');
            const stage = await db.oneOrError<Stage>('stage', {competitionId: competition.id});
            const table = await stage.getTable();

            return table;
        }, [manager.id]
    );

    if (table == undefined) {
        return <>Loading...</>;
    }

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            <SectionHeader title="LEAGUE TABLE" />
            <p className="text-[10px] text-zinc-500 text-center mb-2">League Positions</p>
            <table className="w-full text-xs">
                <thead>
                <tr className="text-zinc-600 text-[10px]">
                    <th className="text-left py-0.5 w-6">POS</th>
                    <th className="text-left py-0.5">TEAM</th>
                    <th className="text-right py-0.5 w-4" onClick={() => setSort('played')}>P</th>
                    <th className="text-right py-0.5 w-6" onClick={() => setSort('goalDifference')}>GD</th>
                    <th className="text-right py-0.5 w-7" onClick={() => setSort('points')}>PTS</th>
                </tr>
                </thead>
                <tbody>
                {table.getTable(sort).map((table: TableClub, idx: number) => (
                    <tr key={table.club.id} className={cn('cursor-pointer hover:bg-zinc-800/30 transition-colors', table.club.id == manager.clubId && 'bg-zinc-800/50')}>
                        <td className="py-px text-zinc-600 text-[10px]">{idx + 1}</td>
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