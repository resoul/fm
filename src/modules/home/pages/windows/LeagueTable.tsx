import { cn } from "@/lib/utils";
import { SectionHeader } from "../../componets/SectionHeader";
import { useManager } from "@/hooks/useManager";
import { useQuery } from "@tanstack/react-query";
import { ClubSchema } from "@/schemas/club";
import type { Club } from "@/schemas/club";

export default function LeagueTable() {

    const {data: manager} = useManager();

    if (!manager) return null;
    
    const leagueTable = useQuery({
        queryKey: ['homeLeagueTable', manager.id],
        queryFn: async () => {
            const response = await fetch(`/leagueClubs/${manager.leagueId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch home league table');
            }
            const data = await response.json();
            return data.map((club: Club) => ClubSchema.parse(club));
        }
    });

    if (leagueTable.isLoading) {
        return <>Loading...</>;
    }

    if (leagueTable.isError) {
        return <>Error fetching home league table</>;
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
                    <th className="text-right py-0.5 w-4">P</th>
                    <th className="text-right py-0.5 w-6">GD</th>
                    <th className="text-right py-0.5 w-7">PTS</th>
                </tr>
                </thead>
                <tbody>
                {leagueTable.data?.map((club: Club) => (
                    <tr key={club.id} className={cn('cursor-pointer hover:bg-zinc-800/30 transition-colors', club.id == manager.clubId && 'bg-zinc-800/50')}>
                        <td className="py-px text-zinc-600 text-[10px]">{club.pos}</td>
                        <td className="py-px">
                            <div className="flex items-center gap-1">
                                <div className={cn('size-2.5 rounded-full shrink-0', club.color ?? 'bg-zinc-600')} />
                                <span className={cn('truncate text-[11px]', club.id == manager.clubId ? 'text-teal-400 font-medium' : 'text-zinc-300')}>
                                        {club.name}
                                    </span>
                            </div>
                        </td>
                        <td className="py-px text-right text-zinc-600 text-[10px]">{club.p}</td>
                        <td className="py-px text-right text-zinc-600 text-[10px]">{club.gd}</td>
                        <td className="py-px text-right text-zinc-500 text-[10px] font-medium">{club.pts}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}