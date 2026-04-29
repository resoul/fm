import { cn } from '@/lib/utils';
import { SectionHeader } from '../../componets/SectionHeader';
import { JuveBadge } from "@/modules/home/layout/juve-badge";
import { useManager } from '@/hooks/useManager';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '@/../db/db';
import { useDateTime } from '@/state/useDateTime';

type FixtureType = {
    date: string;
    venue: 'H' | 'A' | 'N';
    homeClub: { id: number; name: string };
    awayClub: { id: number; name: string };
    // type: string;
    // opponentBadge: string | null;
};

export default function Fixtures() {

    const manager = useManager();
    const dateTime = useDateTime(state => state.dateTime);

    const schedule = useLiveQuery<FixtureType[]>(
        async () => {
            if (!manager?.clubId) {
                return [];
            }
            const matches = await db.table('match').where('homeClubId').equals(manager.clubId).and(
                match => new Date(match.date) >= dateTime
            ).toArray();
            const awayMatches = await db.table('match').where('awayClubId').equals(manager.clubId).and(
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
        }, [manager?.clubId, dateTime]
    );

    if (schedule == undefined) {
        return <>Loading...</>
    }

    if (schedule.length === 0) {
        return (
            <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
                <p className="text-center text-zinc-500 text-sm py-4">No matches available</p>
            </div>
        );
    }

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            <SectionHeader title="JUVENTUS FIXTURES" />
            <table className="w-full text-xs">
                <tbody>
                {schedule.slice(0, 5).map((match, i) => (
                    <tr key={i} className="hover:bg-zinc-800/40 cursor-pointer transition-colors">
                        <td className="py-1 text-zinc-400 w-12">{match.date}</td>
                        <td className="py-1 w-8">
                                <span className={cn('text-[10px] font-bold px-1',
                                    match.venue === 'H' ? 'text-teal-400' :
                                        match.venue === 'A' ? 'text-zinc-400' : 'text-yellow-400'
                                )}>
                                    {match.venue}
                                </span>
                        </td>
                        <td className="py-1">
                            <div className="flex items-center gap-1.5">
                                {/* {match.opponentBadge ? (
                                    <div className={cn('size-4 rounded-full shrink-0 flex items-center justify-center', match.opponentBadge)}>
                                        <svg viewBox="0 0 32 36" className="size-2.5 text-white/70" fill="currentColor">
                                            <path d="M16 2L3 8v10c0 8.5 5.5 16.5 13 19 7.5-2.5 13-10.5 13-19V8L16 2z" />
                                        </svg>
                                    </div>
                                ) : ( */}
                                    <JuveBadge size="xs" />
                                {/* )} */}
                                <span className={cn('text-zinc-300', i === 0 && 'text-teal-400')}>
                                    {match.homeClub.id === manager?.clubId ? match.awayClub.name : match.homeClub.name}
                                </span>
                            </div>
                        </td>
                        <td className="py-1 text-right text-zinc-500">Seria A</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}