import type { IEvent } from "./IEvent";
import { queryClient } from "@/lib/queryClient";

export default class StartSeasonEvent implements IEvent {

    async dispatch(dateTime: Date) {
        if (dateTime.getTime() === new Date('2024-06-01T13:00:00').getTime()) {
            console.log("Season has started!");

            await this.createSeasonSchedule();

            queryClient.invalidateQueries({ queryKey: ['schedule'] });
        }
    }

    private async createSeasonSchedule() {
        const response = await fetch('/schedule/match', {
            method: 'POST',
        });

        if (!response.ok) {
            console.error('Failed to create season schedule:', response.statusText);
            return;
        }

        const result = await response.json();
        console.log('Season schedule created', result);
    }

}