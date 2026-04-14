import { db } from '../db';

export const continentsData = [
    { name: 'Africa', code: 'AF' },
    { name: 'Asia', code: 'AS' },
    { name: 'Europe', code: 'EU' },
    { name: 'North America', code: 'NA' },
    { name: 'South America', code: 'SA' },
    { name: 'Oceania', code: 'OC' },
];

let continentId = 1;

export const continentsCreate = async () => continentsData.map(
    async continent => await db.continent.create({ ...continent, id: continentId++ }
));
