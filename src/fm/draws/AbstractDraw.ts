import type { Club } from "@/../db/models";

export default abstract class AbstractDraw {
    protected clubs: Club[] = [];
    public size: number = 0;
    public drawResult: { homeClubId: number, awayClubId: number }[][] = [];
    public numberOfRounds: number = 0;

    constructor(clubs: Club[]) {
        this.clubs = clubs;
        this.size = this.clubs.length;
        this.numberOfRounds = (this.size - 1) * 2;
        this.draw();
    }

    abstract draw(): void;
}