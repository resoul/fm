import { Stage, StageEnum } from "@/../db/models";
import GroupDraw from "./GroupDraw";
import type AbstractDraw from "./AbstractDraw";
import CupDraw from "./CupDraw";

export default class DrawFactory{

    static async getDraw(stage: Stage): Promise<AbstractDraw>{

        if (stage.type == StageEnum.group){
            return new GroupDraw(stage);
        } else {
            return new CupDraw(stage);
        }
    }

}