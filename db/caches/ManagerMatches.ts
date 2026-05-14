import { Manager } from "@/../db/models";
import db from "@/../db/db";
import { Match } from "@/../db/models/Match";

export default class ManagerMatches{

    private static instances: Map<number, ManagerMatches> = new Map();

    private manager: Manager;

    private allMatches: {[key: string]: Match[]} = {};

    private constructor(manager: Manager) {
        this.manager = manager;
    }

    protected dateChanged = new Set<string>();

    public static setDateChanged(date: string|Date){
        const dm = this.dateToKey(date)
        this.instances.forEach(instance => instance.setDateChanged(dm));
    }

    protected setDateChanged(dm: string){
        this.dateChanged.add(dm);
    }

    static deleteCache(){
        this.instances = new Map();
    }

    public static getInstance(manager: Manager): ManagerMatches {
        if (!this.instances.has(manager.id)) {
            this.instances.set(manager.id, new ManagerMatches(manager));
        }

        return this.instances.get(manager.id)!;
    }

    public async getAllMatches(): Promise<typeof this.allMatches>{
        if (Object.keys(this.allMatches).length > 0) {
            for (const dm of this.dateChanged){
                if (!this.allMatches.hasOwnProperty(dm)){
                    continue;
                }
                const matchIds = this.allMatches[dm].map(m => m.id);
                console.log(matchIds);
                this.allMatches[dm] = await db.table<Match>('match').where('id').anyOf(matchIds).toArray();
            }
            
            return this.allMatches;
        }

        const seasons = await this.manager.getSeasons();

        const rounds = await db.table('round').where('seasonId').anyOf(seasons.map(s => s.id)).toArray();
        
        const matches = await db.table<Match>('match').where('roundId').anyOf(rounds.map(r => r.id)).toArray();
        // const stages = await this.manager

        this.allMatches = {};
        matches.forEach(m => {
            const dm = ManagerMatches.dateToKey(m.date);
            // console.log(dm);
            if (!this.allMatches[dm]){
                this.allMatches[dm] = [];
            }
            this.allMatches[dm].push(m);
        });

                // console.log(this.allMatches);
        return this.allMatches;
    }

    public async getAllTodayMatches(date: string|Date): Promise<typeof this.allMatches[string]>{
        const dm = ManagerMatches.dateToKey(date);

        const matches = await this.getAllMatches();
        if (matches[dm]){
            return matches[dm];
        }

        return [];
    }

    protected static dateToKey(date: string|Date): string{
        const d = new Date(date);
        return `${d.getDate()}.${d.getMonth() + 1}`;
    }

}