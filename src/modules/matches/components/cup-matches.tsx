import { Club, FinishMethodEnum, Manager, MatchStatusEnum, type Match, type Stage } from "@/../db/models";
import { useManager } from "@/state/useManager";
import db from "@/../db/db";
import { useLiveQuery } from "dexie-react-hooks";

type GameType = {
    date: Date,
    homeClub: Club,
    awayClub: Club,
    match: Match
}

const pOrE = (match: Match, home: boolean): string => {
    if (match.status == MatchStatusEnum.ended && match.finishMethod != FinishMethodEnum.regular){
        if (match.homeGoals > match.awayGoals && home || match.homeGoals < match.awayGoals && !home){
            return match.finishMethod == FinishMethodEnum.overtime ? 'e' : 'p';
        }
    }

    return '';
}

const score = (match: Match) => {
    if (match.finishMethod != FinishMethodEnum.penalties){
        return `${match.homeGoals} - ${match.awayGoals}`;
    }
    return (
        `${match.homeGoals}(${match.homePenalty}) - ${match.awayGoals}(${match.awayPenalty})`
    );
}

const clubName = (club: Club, manager: Manager, match: Match) => {
    if (club.id === manager.clubId){
        return <div className="w-40 text-blue-500">{club.name}</div>
    }

    return (
        <div className={`w-40 ${match.status === MatchStatusEnum.ended && club.id != match.getWinnerId() ? " text-gray-400" : ""}`}>
            {club.name}
        </div>
    );
}

export default function CupMatches({stage, matches}: {stage: Stage, matches: Match[]}){
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
           
                return {
                    date: new Date(match.date),
                    homeClub,
                    awayClub,
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
                        {clubName(game.homeClub, manager, game.match)}
                        <div className='w-20'>
                            {pOrE(game.match, true)}
                            {game.match.status === MatchStatusEnum.ended ? score(game.match) : 'vs' }
                            {pOrE(game.match, false)}
                        </div>
                        {clubName(game.awayClub, manager, game.match)}
                    </div>
                </div>
            ))}
        </div>
    )
}