import { addEvent } from "@/state/useEventStates";
import type { IEvent } from "./IEvent";

export default class MatchesEvent implements IEvent {

    async dispatch(dateTime: Date) {
        await new Promise(resolve => setTimeout(resolve, 100));

        if (dateTime.getDate() === 5) {
            addEvent("Matches");
        }
    }

}