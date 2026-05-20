import type { Stage } from "@/../db/models";

export default abstract class AbstractDraw {
    public size: number = 0;
    public drawResult: { homeClubId: number, awayClubId: number }[][] = [];
    public numberOfRounds: number = 0;
    protected stage: Stage;

    constructor(stage: Stage) {
        this.stage = stage;
    }

    abstract draw(): Promise<void>;
}