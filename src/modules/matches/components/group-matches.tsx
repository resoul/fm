import { Club, Manager, MatchStatusEnum, type Match, type Stage } from "@/../db/models";
import { useManager } from "@/state/useManager";
import db from "@/../db/db";
import { useLiveQuery } from "dexie-react-hooks";

type GameType = {
    date: Date;
    homeClub: Club;
    homeClubPosition: number;
    awayClub: Club;
    awayClubPosition: number;
    match: Match;
};

const clubName = (club: Club, manager: Manager, match: Match) => {
    if (club.id === manager.clubId){
        return <div className="w-40 text-blue-500">{club.name}</div>
    }

    return (
        <div className={`w-40 ${
            match.status !== MatchStatusEnum.ended 
            || club.id == match.getWinnerId()
            || null == match.getWinnerId()
            ? "" : " text-gray-400"}`}>
            {club.name}
        </div>
    );
}

export default function GroupMatches({stage, matches}: {stage: Stage, matches: Match[]}){
    const manager = useManager(state => state.manager);
    const games = useLiveQuery<GameType[]>(
        async () => {

            const games = await Promise.all(matches.map(async (match) => {
                const [homeClub, awayClub] = await Promise.all([
                    db.club.get(match.homeClubId),
                    db.club.get(match.awayClubId)
                ]);

                if (!homeClub || !awayClub){
                    throw new Error('no clubs');
                }

                const table = await stage.getTable();
           
                return {
                    date: new Date(match.date),
                    homeClub,
                    homeClubPosition: table.getTableClub(homeClub.id)?.position ?? 0,
                    awayClub,
                    awayClubPosition: table.getTableClub(awayClub.id)?.position ?? 0,
                    match: match,
                };
            }));
            return games;
        }, [manager.id]
    );

    if (games == undefined) {
        return <>Loading...</>
    }

    games.sort((a, b) => a.date.getTime() - b.date.getTime());

    return (
        <div>
            <h1>{stage.name}</h1>
            {games.map(game => (
                <div key={game.match.id}>
                    <div className='flex gap-4'>
                        <div className='w-8'>
                            {`${String(game.date.getHours()).padStart(2, '0')}:${String(game.date.getMinutes()).padStart(2, '0')}`}
                        </div>
                        <div className='w-8'>{game.homeClubPosition}th</div>
                        {clubName(game.homeClub, manager, game.match)}
                        <div className='w-16'>{game.match.status === MatchStatusEnum.ended ? `${game.match.homeGoals} - ${game.match.awayGoals}` : 'vs'}</div>
                        {clubName(game.awayClub, manager, game.match)}
                        <div className='w-8'>{game.awayClubPosition}th</div>
                    </div>
                </div>
            ))}
        </div>
    )
}