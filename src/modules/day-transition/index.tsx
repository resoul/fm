import Days from "./components/days";
import Header from "./components/header";
import { setRediretc, setShowTimeline, useEventStates } from "@/state/useEventStates";
import { useNavigate } from "react-router-dom";
import { useEffect, } from "react";

export default function DayTransitionModule() {
    const event = useEventStates(state => state.events);
    const redirect = useEventStates(state => state.redirect);
    const showTimeline = useEventStates(state => state.showTimeline);

    const navigate = useNavigate();
    
    useEffect(() => {
        if (event.length && !redirect) {
            setShowTimeline(false);
            setRediretc(true);
            navigate('/matches');
        }
    }, [event.length, navigate]);

    if (!showTimeline) {
        return null;
    }

    return ( 
    <div className="fixed inset-0 bg-black/50 z-50">
        <Header />
        <Days />
    </div>
    );
}