import AbstractDraw from "./AbstractDraw";

export default class GroupDraw extends AbstractDraw{

    draw(){
        const firstLegRounds = this.size - 1;
        const firstLegPairs: { homeClubId: number; awayClubId: number }[][] = [];

        const rotatingClubs = this.clubs.map(c => c.id);
        if (this.size < 2 || this.size % 2 !== 0) rotatingClubs.push(0);
        const fixedClubId = rotatingClubs[0];

        for (let round = 0; round < firstLegRounds; round++) {
            const roundOrder = [fixedClubId, ...rotatingClubs.slice(1)];
            const roundPairs: { homeClubId: number; awayClubId: number }[] = [];

            for (let i = 0; i < this.size / 2; i++) {
                const leftClubId = roundOrder[i];
                const rightClubId = roundOrder[this.size - 1 - i];
                const swapHomeAway = round % 2 !== 0;
                const homeClubId = swapHomeAway ? rightClubId : leftClubId;
                const awayClubId = swapHomeAway ? leftClubId : rightClubId;
                roundPairs.push({ homeClubId, awayClubId });
            }

            firstLegPairs.push(roundPairs);

            const lastClubId = rotatingClubs.pop();
            if (lastClubId !== undefined) {
                rotatingClubs.splice(1, 0, lastClubId);
            }
        }

        this.drawResult = [...firstLegPairs];
        for (const x in firstLegPairs){
            const roundResult: {homeClubId: number, awayClubId: number}[] = [];
            firstLegPairs[x].forEach(pair => {
                roundResult.push({homeClubId: pair.awayClubId, awayClubId: pair.homeClubId});
            });
            this.drawResult.push(roundResult);
        }
    }

}