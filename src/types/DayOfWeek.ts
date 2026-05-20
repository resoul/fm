export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DayOfWeekArray = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday' ];

export const getIndexDay = (day: DayOfWeek): number => {
    return DayOfWeekArray.indexOf(day);
}