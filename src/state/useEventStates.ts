import { create } from "zustand";

type EventStates = {
    events: string[];
};

export const useEventStates = create<EventStates>(() => ({
    events: []
}));

export function addEvent(eventName: string) {
    useEventStates.setState((state) => ({
        events: state.events.concat(eventName)
    }));
}

export function clearEvents() {
    useEventStates.setState({ events: [] });
}