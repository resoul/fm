import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useManager } from '@/state/useManager';
import { type Match } from '@/../db/models/Match';
import { CurrentDate, Stage, StageEnum } from '@/../db/models';
import GroupMatches from '../../components/group-matches';
import CupMatches from '../../components/cup-matches';

export function Page() {

    const manager = useManager(state => state.manager);

    const stageMatches = useLiveQuery<Record<number, {stage: Stage, matches: Match[]}>>(
        async () => {
            const dayIndex = await CurrentDate.getDayIndex();
            const seasonIds = await manager.getSeasonIds();
            const matches = await db.match.where('[dayIndex+seasonId]').anyOf(seasonIds.map(id => [dayIndex, id])).toArray();
            const stageMatches: Record<number, {stage: Stage, matches: Match[]}> = {};
            const stagePromises: Record<number, Promise<Stage>> = {};
            await Promise.all(matches.map(async m => {
                if (!stagePromises[m.stageId]) {
                    stagePromises[m.stageId] = m.getStage();
                }
                const stage = await stagePromises[m.stageId];
                if (!Object.hasOwn(stageMatches, m.stageId)){
                    console.log(m.stageId);
                    stageMatches[m.stageId] = {stage: stage, matches: []};
                }
                stageMatches[m.stageId].matches.push(m);
            }));
            return stageMatches;
        }
    );

    if (stageMatches == undefined) {
        return <>Loading...</>
    }

    if (Object.keys(stageMatches).length === 0) {
        return <>No games today</>
    }

    console.log(stageMatches);
    return (
        <div>
            {Object.values(stageMatches).map(stageMatch => ( 
            <div key={stageMatch.stage.id}>
                {stageMatch.stage.type == StageEnum.group ? 
                <GroupMatches {...stageMatch} /> : <CupMatches {...stageMatch} />}           
            </div>
            ))}
        </div>
    )
}
