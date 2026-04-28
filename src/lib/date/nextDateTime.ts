export default function nextDateTime(currentDateTime: Date, hoursToAdd?: number): Date {

    hoursToAdd = hoursToAdd ?? 1;

    const nextDate = new Date(currentDateTime);
    nextDate.setHours(nextDate.getHours() + hoursToAdd);

    return nextDate;
}