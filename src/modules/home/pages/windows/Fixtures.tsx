import { cn } from '@/lib/utils';
import { SectionHeader } from '../../componets/SectionHeader';
import { JuveBadge } from "@/modules/home/layout/juve-badge";
import { useQuery } from '@tanstack/react-query';
import { useManager } from '@/hooks/useManager';

const FIXTURES = [
    { date: '12/07', venue: 'N', opponent: 'Juventus Second XI', type: 'FR', opponentBadge: null },
    { date: '16/07', venue: 'A', opponent: 'Galatasaray', type: 'FR', opponentBadge: 'bg-yellow-500' },
    { date: '30/07', venue: 'H', opponent: 'Milan', type: 'FR', opponentBadge: 'bg-red-700' },
    { date: '03/08', venue: 'A', opponent: 'Shakhtar', type: 'FR', opponentBadge: 'bg-orange-500' },
    { date: '06/08', venue: 'A', opponent: 'PAOK', type: 'FR', opponentBadge: 'bg-zinc-700' },
];

type FixtureType = {
    date: string;
    venue: 'H' | 'A' | 'N';
    homeClubName: string;
    awayClubName: string;
    // type: string;
    // opponentBadge: string | null;
};

export default function Fixtures() {

    const {data: manager} = useManager();

    const schedule = useQuery<FixtureType[]>({
        queryKey: ['schedule'],
        queryFn: async () => {
            const response = await fetch('/schedule/club/' + manager?.clubId);
            if (!response.ok) {
                throw new Error('Failed to fetch fixtures');
            }
            return response.json();
        }
    });

    if (schedule.isLoading) {
        return (
            <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
                <p className="text-center text-zinc-500 text-sm py-4">Loading fixtures...</p>
            </div>
        );
    }

    if (schedule.isError) {
        return (
            <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
                <p className="text-center text-zinc-500 text-sm py-4">Error loading fixtures</p>
            </div>
        );
    }

    console.log("Fetched schedule:", schedule.data);
    
    if (!schedule.data || schedule.data.length === 0) {
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
                {schedule.data.slice(0, 5).map((match, i) => (
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
                                <span className={cn('text-zinc-300', i === 0 && 'text-teal-400')}>{match.awayClubName}</span>
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