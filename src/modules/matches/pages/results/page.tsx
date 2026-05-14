import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDateTime } from '@/state/useDateTime';
import { useManager } from '@/state/useManager';
import ManagerMatches from '@/../db/caches/ManagerMatches';
import { MatchStatusEnum, type Match } from '@/../db/models/Match';
import { CurrentDate, Stage, type Club } from '@/../db/models';
import Table from '@/../db/projections/Table';

type GameType = {
    date: Date;
    homeClub: Club;
    homeClubPosition: number;
    awayClub: Club;
    awayClubPosition: number;
    match: Match;
    isManagerGame: boolean;
};

export function Page() {

    const manager = useManager(state => state.manager);
    const tables = new Map<number, Table>();

    const games = useLiveQuery<GameType[]>(
        async () => {
            const dateTime = await CurrentDate.getDate();
            const matches = await ManagerMatches.getInstance(manager).getAllTodayMatches(dateTime);
            // const stages = await manager.getStages();
            // const matches = db.match.where()

            const games = await Promise.all(matches.map(async (match) => {
                const [homeClub, awayClub] = await Promise.all([
                    db.club.get(match.homeClubId),
                    db.club.get(match.awayClubId)
                ]);

                if (!homeClub || !awayClub){
                    throw new Error('no clubs');
                }

                if (!tables.has(match.roundId)){
                    const season = await (await match.getRound()).getSeason();
                    const stage = await db.oneOrError<Stage>('stage', {competitionId: season.competitionId});
                    const table = await stage.getTable();
                    tables.set(match.roundId, table);
                }
           
                return {
                    date: new Date(match.date),
                    homeClub,
                    homeClubPosition: tables.get(match.roundId)?.getTableClub(homeClub.id)?.position ?? 0,
                    awayClub,
                    awayClubPosition: tables.get(match.roundId)?.getTableClub(awayClub.id)?.position ?? 0,
                    match: match,
                    isManagerGame: match.homeClubId === manager?.clubId || match.awayClubId === manager?.clubId,
                };
            }));
            return games;
        }, [manager.id]
    );
    // console.log('rendering');

    if (games == undefined) {
        return <>Loading...</>
    }

    if (games.length === 0) {
        return <>No games today</>
    }

    return (
        <div>
            {games.map(game => (
                <div key={game.match.id}>
                    <div className='flex gap-4'>
                        <div className='w-8'>
                            {`${String(game.date.getHours()).padStart(2, '0')}:${String(game.date.getMinutes()).padStart(2, '0')}`}
                        </div>
                        <div className='w-8'>{game.homeClubPosition}th</div>
                        <div className={`w-40 ${game.isManagerGame && game.homeClub.id === manager?.clubId ? " text-blue-500" : ""}`}>
                            {game.homeClub.name}
                        </div>
                        <div className='w-16'>{game.match.status === MatchStatusEnum.ended ? `${game.match.homeGoals} - ${game.match.awayGoals}` : 'vs'}</div>
                        <div className={`w-40 ${game.isManagerGame && game.awayClub.id === manager?.clubId ? "bg-blue-500 text-white" : ""}`}>
                            {game.awayClub.name}
                        </div> 
                        <div className='w-8'>{game.awayClubPosition}th</div>
                    </div>
                </div>
            ))}
        </div>
    )
}
