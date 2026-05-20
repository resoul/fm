import { useLiveQuery } from "dexie-react-hooks";
import db from "@/../db/db";
import { useManager } from "@/state/useManager";
import { ScrollArea } from "@/components/scroll-area";
import { Match, MatchStatusEnum, type Club, type Manager, type Stage } from "@/../db/models";

type FixtureRow = {
    match: Match;
    date: Date;
    club: Club;
    place: "H" | "A";
    stage: Stage;
};

const statusBul = (match: Match, manager: Manager) => {
    if (match.status !== MatchStatusEnum.ended) {
        return '';
    }

    const sise = 'w-5 h-5 rounded-full';

    if (match.getWinnerId() === manager.clubId) {
        return <div className={` ${sise} bg-green-500`}></div>;
    }

    if (match.getWinnerId() === null) {
        return <div className={` ${sise} bg-linear-to-r from-yellow-400 from-50% to-gray-400 to-50%`}></div>;
    }

    return <div className={` ${sise} bg-red-500`}></div>;
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
                    const place = match.homeClubId === manager.clubId ? "H" : "A";
                    const clubId = place === "H" ? match.awayClubId : match.homeClubId;
                    const club = await db.table("club").get(clubId);

                    return {
                        match: match,
                        date: new Date(match.date),
                        club: club,
                        place: place,
                        stage: await db.oneOrError('stage', match.stageId),
                    };
                })
            );
        },
        [manager?.clubId]
    );

    if (!fixtures) {
        return <div className="p-4 text-zinc-400">Loading fixtures...</div>;
    }

    const colsSize = 'grid grid-cols-[1fr_1fr_1fr_2fr_2fr_1fr_1fr_1fr_2fr]';

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="p-4 space-y-3">
                    <h1 className="text-sm uppercase tracking-wide text-zinc-400">All Fixtures</h1>

                    {fixtures.length === 0 ? (
                        <div className="text-sm text-zinc-500">No matches found.</div>
                    ) : (
                        <div className="rounded-md border border-zinc-800 overflow-hidden">
                            <div className={`grid ${colsSize} px-3 py-2 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500`}>
                                <div className="text-center">Date</div>
                                <div className="text-center">Time</div>
                                <div className="text-center">Opposition</div>
                                <div className="text-center">TV</div>
                                <div className="text-center">Venue</div>
                                <div className="text-center">Status</div>
                                <div className="text-center">Result</div>
                                <div className="text-center">Competition</div>
                            </div>
                            {fixtures.map((fixture) => (
                                <div key={fixture.match.id} className={`grid ${colsSize} px-3 py-2 text-sm border-t border-zinc-900`}>
                                    <div className="text-zinc-400 text-center">{fixture.date.toLocaleDateString()}</div>
                                    <div className="text-zinc-400 text-center">{fixture.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="text-black text-center">{fixture.club.name}</div>
                                    <div className="text-center">TV</div>
                                    <div className="text-center">{fixture.place}</div>
                                    <div className="text-center">{statusBul(fixture.match, manager)}</div>
                                    <div className="text-center">
                                        {fixture.match.status === "ended"
                                            ? `${fixture.match.homeGoals} - ${fixture.match.awayGoals}`
                                            : "vs"}
                                    </div>
                                    <div className="text-center text-zinc-400">{fixture.stage.name}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
