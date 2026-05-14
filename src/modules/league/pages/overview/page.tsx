import { ScrollArea } from '@/components/scroll-area';
import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Competition } from '@/../db/models/Competition';
import type Table from 'db/projections/Table';
import type { TableClub } from '@/../db/projections/Table';
import type { Stage } from '@db/../db/models';

export function Page() {
    const { competitionId } = useParams();
    const [sort, setSort] = useState<Exclude<keyof TableClub, "club">>('points');

    const data = useLiveQuery<{competitionName?: string, seasonName?: string, table: Table|null, error?: string}>(async () => {

        try {
            const competition = await db.oneOrError<Competition>('competition', competitionId);
            const season = await competition.getActiveSeason();
            const stage = await db.oneOrError<Stage>('stage', {competitionId: competition.id});
            const table = await stage.getTable();
            await table.initTable();

            return {
                competitionName: competition.name,
                seasonName: season.name,
                table,
            };
        } catch (e: any){
            console.log(e);
            return {competitionName: '', seasonName: '', table: null, error: e.messge}
        }
    }, [competitionId]);

    if (!data) {
        return <>Loading...</>
    }

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="pr-2 pb-4 space-y-3">
                    <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4">
                        <h1 className="text-lg font-semibold text-zinc-100">{data?.competitionName || 'League'}</h1>
                        <p className="text-xs text-zinc-500">Season: {data?.seasonName || '-'}</p>
                    </div>

                    {data?.error ? (
                        <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-4 text-sm text-red-300">{data.error}</div>
                    ) : (
                        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-3">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-zinc-500">
                                        <th className="text-left py-2 w-12 cursor-pointer" onClick={() => setSort('points')}>POS</th>
                                        <th className="text-left py-2">TEAM</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('played')}>PLD</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('wins')}>W</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('draws')}>D</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('losses')}>L</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('scoredGoals')}>GF</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('missedGoals')}>GA</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('goalDifference')}>GD</th>
                                        <th className="text-right py-2 w-12 cursor-pointer" onClick={() => setSort('points')}>PTS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.table?.getTable(sort).map((row, idx) => (
                                        <tr key={row.club.id} className="border-t border-zinc-800/70 text-zinc-200 hover:bg-zinc-800/30 transition-colors">
                                            <td className="py-2">{idx + 1}</td>
                                            <td className="py-2">
                                                <Link to={`/league/${competitionId}/team/${row.club.id}`} className="hover:text-teal-300 transition-colors">
                                                    {row.club.name}
                                                </Link>
                                            </td>
                                            <td className="py-2 text-right">{row.played}</td>
                                            <td className="py-2 text-right">{row.wins}</td>
                                            <td className="py-2 text-right">{row.draws}</td>
                                            <td className="py-2 text-right">{row.losses}</td>
                                            <td className="py-2 text-right">{row.scoredGoals}</td>
                                            <td className="py-2 text-right">{row.missedGoals}</td>
                                            <td className="py-2 text-right">{row.goalDifference}</td>
                                            <td className="py-2 text-right font-semibold">{row.points}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
