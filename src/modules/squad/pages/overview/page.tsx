import { useLiveQuery } from "dexie-react-hooks";
import db from "@/../db/db";
import { useManager } from "@/state/useManager";
import { ScrollArea } from "@/components/scroll-area";

type PersonRow = {
    id: number;
    name: string;
    role: string;
    clubId: number;
    position: string | null;
};

export function Page() {
    const manager = useManager(state => state.manager);

    const squad = useLiveQuery<PersonRow[]>(
        async () => {
            if (!manager?.clubId) return [];

            return db
                .table("person")
                .where("clubId")
                .equals(manager.clubId)
                .and((p: PersonRow) => p.role === "player")
                .toArray();
        },
        [manager?.clubId]
    );

    if (!manager) {
        return <div className="p-4 text-zinc-400">Loading manager...</div>;
    }

    if (!squad) {
        return <div className="p-4 text-zinc-400">Loading squad...</div>;
    }

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="pr-2 p-4 space-y-4">
                    <div className="text-sm text-zinc-400">
                        Manager: <span className="text-zinc-200">{manager.name}</span> | clubId:{" "}
                        <span className="text-zinc-200">{manager.clubId}</span>
                    </div>

                    <div className="rounded-md border border-zinc-800 overflow-hidden">
                        <div className="grid grid-cols-[80px_1fr_80px] bg-zinc-900 px-3 py-2 text-xs text-zinc-400 uppercase tracking-wide">
                            <div>ID</div>
                            <div>Name</div>
                            <div>Pos</div>
                        </div>
                        {squad.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-zinc-500">No players found for this club.</div>
                        ) : (
                            squad.map((player) => (
                                <div
                                    key={player.id}
                                    className="grid grid-cols-[80px_1fr_80px] px-3 py-2 text-sm border-t border-zinc-900"
                                >
                                    <div className="text-zinc-400">{player.id}</div>
                                    <div className="text-zinc-200">{player.name}</div>
                                    <div className="text-zinc-300">{player.position}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
