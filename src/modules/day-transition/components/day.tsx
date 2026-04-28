import nextDateTime from "@/lib/date/nextDateTime";
import { useDateTime } from "@/state/useDateTime";

const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function Day({ dayNumber }: { dayNumber: number }) {
    
    const dateTime = useDateTime(state => state.dateTime);
    const date = nextDateTime(dateTime, dayNumber * 24);

    return (
        <div className="min-w-37.5 bg-gray-500">
            <div className="w-full">
                <div className="text-white text-md">{date.getDate()}</div>
                <div className="text-md text-white">{days[date.getDay()]}</div>
            </div>
        </div>
    );

}