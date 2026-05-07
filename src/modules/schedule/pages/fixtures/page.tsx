import { useLiveQuery } from "dexie-react-hooks";
import db from "@/../db/db";
import { useManager } from "@/state/useManager";
import { ScrollArea } from "@/components/scroll-area";

type FixtureRow = {
    id: number;
    date: string;
    homeClubName: string;
    awayClubName: string;
    score: string;
};

export function Page() {
    const manager = useManager(state => state.manager);

    const fixtures = useLiveQuery<FixtureRow[]>(
        async () => {
            if (!manager?.clubId) return [];

            const homeMatches = await db
                .table("match")
                .where("homeClubId")
                .equals(manager.clubId)
                .toArray();

            const awayMatches = await db
                .table("match")
                .where("awayClubId")
                .equals(manager.clubId)
                .toArray();

            const allMatches = [...homeMatches, ...awayMatches].sort((a, b) => a.date.localeCompare(b.date));

            return await Promise.all(
                allMatches.map(async (match) => {
                    const [homeClub, awayClub] = await Promise.all([
                        db.table("club").get(match.homeClubId),
                        db.table("club").get(match.awayClubId),
                    ]);

                    return {
                        id: match.id,
                        date: new Date(match.date).toLocaleDateString(),
                        homeClubName: homeClub?.name ?? "Unknown",
                        awayClubName: awayClub?.name ?? "Unknown",
                        score:
                            match.status === "played"
                                ? `${match.homeGoals ?? 0}:${match.awayGoals ?? 0}`
                                : "-",
                    };
                })
            );
        },
        [manager?.clubId]
    );

    if (!fixtures) {
        return <div className="p-4 text-zinc-400">Loading fixtures...</div>;
    }

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                    <h1 className="text-sm uppercase tracking-wide text-zinc-400">All Fixtures</h1>

                    {fixtures.length === 0 ? (
                        <div className="text-sm text-zinc-500">No matches found.</div>
                    ) : (
                        <div className="rounded-md border border-zinc-800 overflow-hidden">
                            <div className="grid grid-cols-[110px_1fr_24px_1fr_70px] px-3 py-2 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                                <div>Date</div>
                                <div>Home</div>
                                <div className="text-center">v</div>
                                <div>Away</div>
                                <div className="text-right">Score</div>
                            </div>
                            {fixtures.map((match) => (
                                <div key={match.id} className="grid grid-cols-[110px_1fr_24px_1fr_70px] px-3 py-2 text-sm border-t border-zinc-900">
                                    <div className="text-zinc-400">{match.date}</div>
                                    <div className="text-zinc-200">{match.homeClubName}</div>
                                    <div className="text-center text-zinc-500">v</div>
                                    <div className="text-zinc-200">{match.awayClubName}</div>
                                    <div className="text-right text-zinc-300">{match.score}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
