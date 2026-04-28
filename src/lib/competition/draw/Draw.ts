import type { Club } from "@/schemas/club";
import type Rule from "../rule/Rule";
import type { Competition } from "@/schemas/competition";

export default abstract class Draw {
    
    protected rule: Rule;
    protected clubs: Club[];
    protected competition: Competition;

    constructor(rule: Rule, competition: Competition, clubs: Club[]) {
        this.rule = rule;
        this.clubs = clubs;
        this.competition = competition;
    }

    abstract generate(): void;

}