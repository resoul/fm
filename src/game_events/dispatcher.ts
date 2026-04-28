import type { IEvent } from "./IEvent";
import MatchesEvent from "./matchesEvent";
import StartSeasonEvent from "./startSeasonEvent";

export default class Dispatcher implements IEvent {

    private events: IEvent[];

    constructor() {
        this.events = [
            new StartSeasonEvent(),
            new MatchesEvent(),
        ];
    }

    async dispatch(dateTime: Date): Promise<void> {
        return Promise.all(this.events.map(event => event.dispatch(dateTime))).then(() => {});
    }

}