import type { MatchEvent } from "../types";

export class EventStore {
    private events: MatchEvent[] = [];

    push(event: MatchEvent) {
        this.events.push(event);
    }

    getAll(): MatchEvent[] {
        return [...this.events];
    }

    clear() {
        this.events = [];
    }

    // Filter events for replay
    getAuthoritativeEvents(): MatchEvent[] {
        return this.events.filter(e => 
            ["goal", "pass", "shot", "tackle", "foul", "kickoff", "halftime", "fulltime"].includes(e.type)
        );
    }
}
