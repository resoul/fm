import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/scroll-area';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '@/../db/db';
import { useManager } from '@/state/useManager';
import { Link } from 'react-router-dom';
import { CurrentDate } from '@/../db/models';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function SectionHeader({ title, chevron = true }: { title: string; chevron?: boolean }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <span className={cn('text-xs font-bold uppercase tracking-wider', chevron ? 'text-teal-400 cursor-pointer hover:text-teal-300' : 'text-zinc-400')}>
                {title} {chevron && <ChevronRight className="inline size-3" />}
            </span>
        </div>
    );
}

function TeamBadge({ color, size = 'sm' }: { color: string; size?: 'xs' | 'sm' }) {
    const s = size === 'xs' ? 'size-3' : 'size-4';
    return (
        <div className={cn(s, 'rounded-full shrink-0 flex items-center justify-center', color)}>
            <svg viewBox="0 0 32 36" className={cn(size === 'xs' ? 'size-2' : 'size-2.5', 'text-white/70')} fill="currentColor">
                <path d="M16 2L3 8v10c0 8.5 5.5 16.5 13 19 7.5-2.5 13-10.5 13-19V8L16 2z" />
            </svg>
        </div>
    );
}

function PlayerAvatar({ bg = 'bg-zinc-700' }: { bg?: string }) {
    return (
        <div className={cn('size-7 rounded-full shrink-0 flex items-center justify-center', bg)}>
            <svg viewBox="0 0 24 24" className="size-4 text-zinc-400" fill="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M12 14c-6 0-8 3-8 5v1h16v-1c0-2-2-5-8-5z" />
            </svg>
        </div>
    );
}

// ─── DATA ─────────────────────────────────────────────────────────────────────

const TITLE_HOLDER = { team: 'Man City', badge: 'bg-sky-400' };

const STAGES = 'League Phase';

const PAST_WINNERS = [
    { team: 'Man City', year: '2025/26', badge: 'bg-sky-400' },
    { team: 'Arsenal', year: '2024/25', badge: 'bg-red-600' },
    { team: 'Liverpool', year: '2023/24', badge: 'bg-red-600' },
    { team: 'Liverpool', year: '2022/23', badge: 'bg-red-600' },
    { team: 'R. Madrid', year: '2021/22', badge: 'bg-purple-100' },
    { team: 'Chelsea', year: '2020/21', badge: 'bg-blue-700' },
    { team: 'FC Bayern', year: '2019/20', badge: 'bg-red-700' },
];

interface PlayerStat {
    rank: string;
    name: string;
    club: string;
    value: number | string;
    badge: string;
}

const GOALS: PlayerStat[] = [
    { rank: '1st', name: 'V. Pavlidis', club: 'AZ', value: 4, badge: 'bg-red-500' },
    { rank: '=', name: 'Jakub Latos', club: 'Legia', value: 4, badge: 'bg-green-600' },
    { rank: '=', name: 'Adrian Petre', club: 'CFR Cluj', value: 4, badge: 'bg-red-800' },
];

const AVG_RATING: PlayerStat[] = [
    { rank: '1st', name: 'Domen Črnigoj', club: 'Qarabağ', value: 7.93, badge: 'bg-zinc-700' },
    { rank: '2nd', name: 'Dennis Politic', club: 'CFR Cluj', value: 7.82, badge: 'bg-red-800' },
    { rank: '3rd', name: 'Ramón Miérez', club: 'Osijek', value: 7.80, badge: 'bg-blue-600' },
];

const ASSISTS: PlayerStat[] = [
    { rank: '1st', name: 'Roger', club: 'CFR Cluj', value: 4, badge: 'bg-red-800' },
    { rank: '2nd', name: 'Mihael Žaper', club: 'Osijek', value: 4, badge: 'bg-blue-600' },
    { rank: '=', name: 'João Mário', club: 'Benfica', value: 4, badge: 'bg-red-600' },
];

const POTM: PlayerStat[] = [
    { rank: '1st', name: 'Domen Črnigoj', club: 'Qarabağ', value: 3, badge: 'bg-zinc-700' },
    { rank: '2nd', name: 'Željko Gavrić', club: 'Ferencváros', value: 2, badge: 'bg-green-700' },
    { rank: '=', name: 'Darius Olaru', club: 'Maccabi Tel-Aviv', value: 2, badge: 'bg-yellow-500' },
];

const SHUTOUTS: PlayerStat[] = [
    { rank: '1st', name: 'Jeroen Zoet', club: 'Slovan Bratislava', value: 7, badge: 'bg-blue-400' },
    { rank: '2nd', name: 'Ondřej Kolář', club: 'Slavia Prague', value: 4, badge: 'bg-red-600' },
    { rank: '3rd', name: 'Avdo Spahić', club: 'Sarajevo', value: 3, badge: 'bg-red-700' },
];

const YELLOW_CARDS: PlayerStat[] = [
    { rank: '1st', name: 'M. Camara', club: 'Young Boys', value: 5, badge: 'bg-yellow-500' },
    { rank: '=', name: 'Renan Guedes', club: 'Sheriff Tiraspol', value: 3, badge: 'bg-yellow-600' },
    { rank: '3rd', name: 'Iwan Roberts', club: 'TNS', value: 2, badge: 'bg-green-600' },
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function StandingsTable() {
    const manager = useManager(state => state.manager);
    const seasonId = 1;

    const table = useLiveQuery(
        async () => {
            const [seasonClubs, rounds] = await Promise.all([
                db.table('seasonClub').where('seasonId').equals(seasonId).toArray(),
                db.table('round').where('seasonId').equals(seasonId).toArray(),
            ]);

            const roundIds = rounds.map((r) => r.id);
            const allMatches = roundIds.length
                ? await db.table('match').where('roundId').anyOf(roundIds).filter((m) => m.status === 'played').toArray()
                : [];

            const rows = await Promise.all(
                seasonClubs.map(async (sClub) => {
                    const club = await db.table('club').get(sClub.clubId);
                    if (!club) return null;

                    const row = { club, p: 0, w: 0, d: 0, l: 0, gd: 0, pts: 0, gf: 0, ga: 0 };
                    const clubMatches = allMatches.filter((m) => m.homeClubId === club.id || m.awayClubId === club.id);

                    for (const match of clubMatches) {
                        const isHome = match.homeClubId === club.id;
                        const homeG = match.homeGoals || 0;
                        const awayG = match.awayGoals || 0;
                        const diff = homeG - awayG;
                        row.p += 1;
                        if (diff === 0) {
                            row.d += 1;
                            row.pts += 1;
                        } else if ((isHome && diff > 0) || (!isHome && diff < 0)) {
                            row.w += 1;
                            row.pts += 3;
                        } else {
                            row.l += 1;
                        }
                        row.gf += isHome ? homeG : awayG;
                        row.ga += isHome ? awayG : homeG;
                    }

                    row.gd = row.gf - row.ga;
                    return row;
                })
            );

            return rows
                .filter((r): r is NonNullable<typeof r> => r !== null)
                .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
                .map((r, i) => ({ ...r, pos: `${i + 1}` }));
        },
        [seasonId]
    );

    if (!table) {
        return <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3 text-zinc-500 text-xs">Loading table...</div>;
    }

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            {/* Title holder */}
            <div className="flex items-center gap-2 mb-3">
                <TeamBadge color={TITLE_HOLDER.badge} size="sm" />
                <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Title Holders</p>
                    <p className="text-xs text-zinc-200 font-semibold">{TITLE_HOLDER.team}</p>
                </div>
            </div>

            {/* Stage selector */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Stages &gt;</span>
                <select className="flex-1 bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 rounded px-2 py-1 outline-none">
                    <option>{STAGES}</option>
                </select>
            </div>

            {/* League table */}
            <table className="w-full text-xs">
                <thead>
                    <tr className="text-zinc-600 text-[10px]">
                        <th className="text-left py-0.5 w-8">POS</th>
                        <th className="text-left py-0.5 w-4">INF</th>
                        <th className="text-left py-0.5">TEAM</th>
                        <th className="text-right py-0.5 w-4">P</th>
                        <th className="text-right py-0.5 w-4">W</th>
                        <th className="text-right py-0.5 w-4">D</th>
                        <th className="text-right py-0.5 w-4">L</th>
                        <th className="text-right py-0.5 w-6">GD</th>
                        <th className="text-right py-0.5 w-7">PTS</th>
                    </tr>
                </thead>
                <tbody>
                    {table.map((row) => (
                        <tr
                            key={row.club.id}
                            className={cn(
                                'cursor-pointer hover:bg-zinc-800/30 transition-colors',
                                row.club.id === manager?.clubId && 'bg-zinc-800/50'
                            )}
                        >
                            <td className="py-px text-zinc-500 text-[10px]">{row.pos}</td>
                            <td className="py-px">
                                <TeamBadge color={row.club.color ?? 'bg-zinc-700'} size="xs" />
                            </td>
                            <td className="py-px">
                                <span
                                    className={cn(
                                        'truncate text-[11px]',
                                        row.club.id === manager?.clubId ? 'text-teal-400 font-medium' : 'text-zinc-300'
                                    )}
                                >
                                    {row.club.name}
                                </span>
                            </td>
                            <td className="py-px text-right text-zinc-600 text-[10px]">{row.p}</td>
                            <td className="py-px text-right text-zinc-600 text-[10px]">{row.w}</td>
                            <td className="py-px text-right text-zinc-600 text-[10px]">{row.d}</td>
                            <td className="py-px text-right text-zinc-600 text-[10px]">{row.l}</td>
                            <td className="py-px text-right text-zinc-600 text-[10px]">{row.gd}</td>
                            <td className="py-px text-right text-zinc-500 text-[10px] font-medium">{row.pts}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function MatchesResults() {
    const seasonId = 1;
    const fixtures = useLiveQuery(
        async () => {
            const rounds = await db.table('round').where('seasonId').equals(seasonId).toArray();
            const roundIds = rounds.map((r) => r.id);
            const dateTime = await CurrentDate.getDateTime();
            if (roundIds.length === 0) return [];

            const matches = await db
                .table('match')
                .where('roundId')
                .anyOf(roundIds)
                .filter((m) => new Date(m.date) >= new Date(dateTime.date))
                .toArray();

            matches.sort((a, b) => a.date.localeCompare(b.date));
            const next = matches.slice(0, 9);

            return await Promise.all(
                next.map(async (m) => {
                    const [home, away] = await Promise.all([
                        db.table('club').get(m.homeClubId),
                        db.table('club').get(m.awayClubId),
                    ]);
                    return {
                        id: m.id,
                        home: home?.name ?? 'Unknown',
                        away: away?.name ?? 'Unknown',
                        homeBadge: home?.color ?? 'bg-zinc-700',
                        awayBadge: away?.color ?? 'bg-zinc-700',
                    };
                })
            );
        },
        [seasonId]
    );

    if (!fixtures) {
        return <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3 text-zinc-500 text-xs">Loading matches...</div>;
    }

    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <SectionHeader title="Matches/Results" />
                <div className="flex items-center gap-1">
                    <button className="size-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
                        <ChevronLeft className="size-3.5" />
                    </button>
                    <button className="size-6 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
                        <ChevronRight className="size-3.5" />
                    </button>
                </div>
            </div>

            <p className="text-xs text-zinc-300 font-semibold mb-1">Tuesday 15th September 2026</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">League Phase - Kick Off 20:00</p>

            <div className="space-y-0">
                {fixtures.map((m, i) => (
                    <div
                        key={i}
                        className={cn(
                            'grid grid-cols-[1fr_30px_1fr] gap-1 py-1 px-1 text-xs cursor-pointer hover:bg-zinc-800/40 transition-colors rounded',
                            i === 0 && 'bg-zinc-800/50'
                        )}
                    >
                        <div className="flex items-center gap-1.5">
                            <TeamBadge color={m.homeBadge} size="xs" />
                            <span className="text-zinc-300 truncate">{m.home}</span>
                        </div>
                        <span className="text-zinc-500 text-center text-[10px]">vs</span>
                        <div className="flex items-center justify-end gap-1.5">
                            <span className="text-zinc-300 truncate text-right">{m.away}</span>
                            <TeamBadge color={m.awayBadge} size="xs" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PastWinners() {
    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            <SectionHeader title="Past Winners" />
            <div className="space-y-1.5">
                {PAST_WINNERS.map((w, i) => (
                    <div key={i} className="flex items-center gap-2 hover:bg-zinc-800/40 cursor-pointer transition-colors rounded px-1 py-0.5">
                        <TeamBadge color={w.badge} size="sm" />
                        <span className="text-xs text-zinc-300 flex-1">{w.team}</span>
                        <span className="text-[10px] text-zinc-500">{w.year}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PlayerStatBlock({ title, stats, showValue = true }: { title: string; stats: PlayerStat[]; showValue?: boolean }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-2">
                {title} <ChevronRight className="inline size-2.5" />
            </p>
            <div className="space-y-1">
                {stats.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 hover:bg-zinc-800/30 cursor-pointer transition-colors rounded px-0.5 py-0.5">
                        <span className="text-[10px] text-zinc-500 w-5 shrink-0">{s.rank}</span>
                        <PlayerAvatar />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-zinc-300 truncate leading-tight">{s.name}</p>
                            <p className="text-[10px] text-zinc-500 truncate leading-tight">{s.club}</p>
                        </div>
                        <TeamBadge color={s.badge} size="xs" />
                        {showValue && (
                            <span className="text-xs text-zinc-300 font-bold w-6 text-right shrink-0">{s.value}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function PlayerStatsPanel() {
    return (
        <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
            <SectionHeader title="Player Stats" />
            <div className="grid grid-cols-3 gap-4 mb-4">
                <PlayerStatBlock title="Goals" stats={GOALS} />
                <PlayerStatBlock title="Average Rating" stats={AVG_RATING} />
                <PlayerStatBlock title="Assists" stats={ASSISTS} />
            </div>
            <div className="grid grid-cols-3 gap-4">
                <PlayerStatBlock title="Player of Match" stats={POTM} />
                <PlayerStatBlock title="Shutouts" stats={SHUTOUTS} />
                <PlayerStatBlock title="Yellow Cards" stats={YELLOW_CARDS} />
            </div>
        </div>
    );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export function Page() {
    const leagues = useLiveQuery(
        async () => (await db.table('competition').toArray()).filter((c) => c.type === 'league'),
        []
    );

    return (
        <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
            <ScrollArea className="h-full">
                <div className="pr-2 space-y-2 pb-4">
                    <div className="border border-zinc-700/60 rounded-lg bg-zinc-900/80 p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-teal-400 mb-2">Leagues</p>
                        <div className="flex flex-wrap gap-2">
                            {(leagues || []).map((league) => (
                                <Link
                                    key={league.id}
                                    to={`/league/${league.id}`}
                                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors"
                                >
                                    {league.name} (id: {league.id})
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Top row — 3-column layout */}
                    <div className="grid grid-cols-[280px_1fr_200px] gap-2">
                        {/* Left: Standings */}
                        <StandingsTable />

                        {/* Center: Matches / Results */}
                        <MatchesResults />

                        {/* Right: Past Winners */}
                        <PastWinners />
                    </div>

                    {/* Bottom: Player Stats */}
                    <PlayerStatsPanel />
                </div>
            </ScrollArea>
        </div>
    );
}
