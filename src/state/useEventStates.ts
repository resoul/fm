import { create } from "zustand";

type EventStates = {
    events: string[];
    redirect: boolean; //only one redirect on event
    showTimeline: boolean; //show frontground
};

export const useEventStates = create<EventStates>(() => ({
    events: [],
    redirect: false,
    showTimeline: false,
}));

export function addEvent(eventName: string) {
    useEventStates.setState((state) => ({
        events: state.events.concat(eventName),
    }));
}

export function setRediretc(redirect: boolean){
    useEventStates.setState({redirect : redirect});
}

export function setShowTimeline(showTimeline: boolean){
    useEventStates.setState({showTimeline : showTimeline});
}

export function clearEvents() {
    useEventStates.setState({ events: [], redirect: false });
}

export function isHaveEvent(){
    return useEventStates.getState().events.length > 0;
}