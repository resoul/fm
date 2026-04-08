import { useManager } from "@/hooks/useManager";
import { JuveBadge } from "@/modules/home/layout/juve-badge";

export default function NextMatch() {

    const {data: manager} = useManager();

    if (!manager) return null;

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-4">
            <div className="text-center mb-3">
                <p className="text-xs font-bold text-teal-400 uppercase tracking-wider">NEXT MATCH</p>
                <p className="text-xs text-zinc-400">Tuesday 12th July 2022 (Tomorrow)</p>
            </div>
            <div className="flex items-center justify-center gap-8">
                <JuveBadge size="lg" />
                <div className="text-center flex-1">
                    <h2 className="text-base font-bold text-zinc-100">Juventus v Juventus Second XI</h2>
                    <p className="text-xs text-teal-400 mt-0.5">Friendly</p>
                    <p className="text-xs text-zinc-500 mt-1">⚽ Giuseppe Moccagatta &nbsp;🌡 31°C</p>
                    <div className="flex items-center justify-center gap-8 mt-2 text-xs text-zinc-500">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-zinc-600">MANAGER</p>
                            <p className="text-zinc-300">{manager.name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-zinc-600">PREVIOUS MEETINGS</p>
                            <p className="text-zinc-300">None</p>
                        </div>
                    </div>
                </div>
                <JuveBadge size="lg" />
            </div>
        </div>
    )
}