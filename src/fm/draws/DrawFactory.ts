import { Stage, StageEnum } from "@/../db/models";
import GroupDraw from "./GroupDraw";
import type AbstractDraw from "./AbstractDraw";

export default class DrawFactory{

    static async getDraw(stage: Stage): Promise<AbstractDraw>{
        const season = await stage.getSeason();
        const clubs = await season.getClubs();
        // if (stage.type == StageEnum.group){
            return new GroupDraw(clubs);
        // }
    }

}