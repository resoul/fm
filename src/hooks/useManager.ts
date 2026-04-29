import { useLiveQuery } from "dexie-react-hooks";
import db from '@/../db/db';

export function useManager()  {
    return useLiveQuery(
        async () => {
            const manager = await db.table('manager').get(1);
            return manager;
        }
    );
}