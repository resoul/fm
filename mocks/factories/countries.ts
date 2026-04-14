import { db } from '../db';

const countriesData = [
    { name: 'Albania', code: 'AL', continent: 'Europe' },
    { name: 'Andorra', code: 'AD', continent: 'Europe' },
    { name: 'Armenia', code: 'AM', continent: 'Europe' },
    { name: 'Austria', code: 'AT', continent: 'Europe' },
    { name: 'Azerbaijan', code: 'AZ', continent: 'Europe' },
    { name: 'Belarus', code: 'BY', continent: 'Europe' },
    { name: 'Belgium', code: 'BE', continent: 'Europe' },
    { name: 'Bosnia and Herzegovina', code: 'BA', continent: 'Europe' },
    { name: 'Bulgaria', code: 'BG', continent: 'Europe' },
    { name: 'Croatia', code: 'HR', continent: 'Europe' },
    { name: 'Cyprus', code: 'CY', continent: 'Europe' },
    { name: 'Czech Republic', code: 'CZ', continent: 'Europe' },
    { name: 'Denmark', code: 'DK', continent: 'Europe' },
    { name: 'England', code: 'GB-ENG', continent: 'Europe' },
    { name: 'Estonia', code: 'EE', continent: 'Europe' },
    { name: 'Finland', code: 'FI', continent: 'Europe' },
    { name: 'France', code: 'FR', continent: 'Europe' },
    { name: 'Georgia', code: 'GE', continent: 'Europe' },
    { name: 'Germany', code: 'DE', continent: 'Europe' },
    { name: 'Greece', code: 'GR', continent: 'Europe' },
    { name: 'Hungary', code: 'HU', continent: 'Europe' },
    { name: 'Iceland', code: 'IS', continent: 'Europe' },
    { name: 'Ireland', code: 'IE', continent: 'Europe' },
    { name: 'Italy', code: 'IT', continent: 'Europe' },
    { name: 'Kosovo', code: 'XK', continent: 'Europe' },
    { name: 'Latvia', code: 'LV', continent: 'Europe' },
    { name: 'Liechtenstein', code: 'LI', continent: 'Europe' },
    { name: 'Lithuania', code: 'LT', continent: 'Europe' },
    { name: 'Luxembourg', code: 'LU', continent: 'Europe' },
    { name: 'Malta', code: 'MT', continent: 'Europe' },
    { name: 'Moldova', code: 'MD', continent: 'Europe' },
    { name: 'Monaco', code: 'MC', continent: 'Europe' },
    { name: 'Montenegro', code: 'ME', continent: 'Europe' },
    { name: 'Netherlands', code: 'NL', continent: 'Europe' },
    { name: 'North Macedonia', code: 'MK', continent: 'Europe' },
    { name: 'Northern Ireland', code: 'GB-NIR', continent: 'Europe' },
    { name: 'Norway', code: 'NO', continent: 'Europe' },
    { name: 'Poland', code: 'PL', continent: 'Europe' },
    { name: 'Portugal', code: 'PT', continent: 'Europe' },
    { name: 'Romania', code: 'RO', continent: 'Europe' },
    { name: 'Russia', code: 'RU', continent: 'Europe' },
    { name: 'San Marino', code: 'SM', continent: 'Europe' },
    { name: 'Scotland', code: 'GB-SCT', continent: 'Europe' },
    { name: 'Serbia', code: 'RS', continent: 'Europe' },
    { name: 'Slovakia', code: 'SK', continent: 'Europe' },
    { name: 'Slovenia', code: 'SI', continent: 'Europe' },
    { name: 'Spain', code: 'ES', continent: 'Europe' },
    { name: 'Sweden', code: 'SE', continent: 'Europe' },
    { name: 'Switzerland', code: 'CH', continent: 'Europe' },
    { name: 'Turkey', code: 'TR', continent: 'Europe' },
    { name: 'Ukraine', code: 'UA', continent: 'Europe' },
    { name: 'Wales', code: 'GB-WLS', continent: 'Europe' },
    { name: 'Brazil', code: 'BR', continent: 'South America' },
    { name: 'Argentina', code: 'AR', continent: 'South America' },
    { name: 'Uruguay', code: 'UY', continent: 'South America' },
    { name: 'Colombia', code: 'CO', continent: 'South America' },
    { name: 'Chile', code: 'CL', continent: 'South America' },
    { name: 'United States', code: 'US', continent: 'North America' },
    { name: 'Mexico', code: 'MX', continent: 'North America' },
    { name: 'Canada', code: 'CA', continent: 'North America' },
    { name: 'Japan', code: 'JP', continent: 'Asia' },
    { name: 'South Korea', code: 'KR', continent: 'Asia' },
    { name: 'China', code: 'CN', continent: 'Asia' },
    { name: 'India', code: 'IN', continent: 'Asia' },
    { name: 'Saudi Arabia', code: 'SA', continent: 'Asia' },
    { name: 'Turkey', code: 'TR', continent: 'Europe' },
    { name: 'Nigeria', code: 'NG', continent: 'Africa' },
    { name: 'Egypt', code: 'EG', continent: 'Africa' },
    { name: 'South Africa', code: 'ZA', continent: 'Africa' },
    { name: 'Morocco', code: 'MA', continent: 'Africa' },
    { name: 'Ghana', code: 'GH', continent: 'Africa' },
    { name: 'Australia', code: 'AU', continent: 'Oceania' },
    { name: 'New Zealand', code: 'NZ', continent: 'Oceania' },
];

export const countriesCreate = async () => {
    const continents = db.continent.findMany();
    let countryId = 1;

    countriesData.forEach(async (country) => {
        const continent = continents.find((item) => item.name === country.continent);

        if (!continent) {
            throw new Error(`Continent not found for country ${country.name}`);
        }

        await db.country.create({
            id: countryId++,
            name: country.name,
            code: country.code,
            continentId: continent.id,
        });
    });
};
