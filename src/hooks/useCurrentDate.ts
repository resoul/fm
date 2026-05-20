import { CurrentDate } from "@/../db/models/CurrentDate";
import { useLiveQuery } from "dexie-react-hooks";

export default function useCurrentDate(){
    return useLiveQuery<CurrentDate>(
        async () => await CurrentDate.getDateTime(), []
    );
}