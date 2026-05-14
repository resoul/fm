import useCurrentDate from "@/hooks/useCurrentDate";
import { useManager } from "@/state/useManager";
import Schedule from "db/projections/Schedule";
import { useLiveQuery } from "dexie-react-hooks";

export default function Header() {

    const manager = useManager(state => state.manager);
    const date = useCurrentDate();
    const cD =  date ? new Date(date.date) : null;

    const schedule = useLiveQuery<Schedule|null>(
        async() => {
            const club = await manager.getClub();
            return cD ? await club.getSchedule(cD) : null;
        }, [date?.getLocaleDate()] //TODO
    );

    if (!schedule || !schedule.fixtures[0] || !cD){
        return <>No next match</>
    }

    const diffDays = Math.round((new Date(schedule.fixtures[0].match.date).getTime() - cD.getTime()) / (1000 * 3600 * 24));

    return (
        <div className="w-full h-16 bg-gray-800 flex items-center">
            <div className="text-yellow-400 text-xl font-bold min-w-60 px-20">{diffDays} Day{diffDays != 1 ? 's': ''}</div>
            <div className="w-0.5 bg-gray-600 h-full mr-5 "></div>
            <div className="text-white justify-center">
                Next match: Juventus vs {schedule.fixtures[0].rival.name}
            </div>
        </div>
    );
}