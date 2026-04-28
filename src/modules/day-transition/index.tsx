import { useDateTime } from "@/state/useDateTime";
import Days from "./components/days";
import Header from "./components/header";

export default function DayTransitionModule() {
    const { processing } = useDateTime();

    if (!processing) {
        return null;
    }

    return ( 
    <div className="fixed inset-0 bg-black/50 z-50">
        <Header />
        <Days />
    </div>
    );
}