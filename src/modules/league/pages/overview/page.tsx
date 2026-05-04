import { ScrollArea } from '@/components/scroll-area';
import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

interface LeagueTableRow {
  club: { id: number; name: string; color?: string };
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export function Page() {
  const { competitionId } = useParams();
  const parsedCompetitionId = useMemo(() => Number(competitionId), [competitionId]);

  const data = useLiveQuery(async () => {
    if (!Number.isFinite(parsedCompetitionId) || parsedCompetitionId <= 0) {
      return { error: 'Invalid competition id' } as const;
    }

    const competition = await db.table('competition').get(parsedCompetitionId);
    if (!competition) {
      return { error: `Competition ${parsedCompetitionId} not found` } as const;
    }

    const seasons = await db.table('season').where('competitionId').equals(parsedCompetitionId).toArray();
    if (seasons.length === 0) {
      return { competitionName: competition.name, table: [] as LeagueTableRow[] } as const;
    }

    const activeSeason =
      seasons.find((s) => s.isActive) ||
      [...seasons].sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    const seasonId = activeSeason.id;
    const [seasonClubs, rounds] = await Promise.all([
      db.table('seasonClub').where('seasonId').equals(seasonId).toArray(),
      db.table('round').where('seasonId').equals(seasonId).toArray(),
    ]);

    const roundIds = rounds.map((r) => r.id);
    const playedMatches = roundIds.length
      ? await db
          .table('match')
          .where('roundId')
          .anyOf(roundIds)
          .filter((m) => m.status === 'played')
          .toArray()
      : [];

    const rows = await Promise.all(
      seasonClubs.map(async (sClub) => {
        const club = await db.table('club').get(sClub.clubId);
        if (!club) return null;

        const row: LeagueTableRow = {
          club,
          p: 0,
          w: 0,
          d: 0,
          l: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          pts: 0,
        };

        const clubMatches = playedMatches.filter(
          (m) => m.homeClubId === club.id || m.awayClubId === club.id
        );

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

    const table = rows
      .filter((r): r is LeagueTableRow => r !== null)
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

    return {
      competitionName: competition.name,
      seasonName: activeSeason.name,
      table,
    } as const;
  }, [parsedCompetitionId]);

  return (
    <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
      <ScrollArea className="h-full">
        <div className="pr-2 pb-4 space-y-3">
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4">
            <h1 className="text-lg font-semibold text-zinc-100">{data?.competitionName || 'League'}</h1>
            <p className="text-xs text-zinc-500">Season: {data?.seasonName || '-'}</p>
          </div>

          {data?.error ? (
            <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-4 text-sm text-red-300">{data.error}</div>
          ) : (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500">
                    <th className="text-left py-2 w-12">POS</th>
                    <th className="text-left py-2">TEAM</th>
                    <th className="text-right py-2 w-12">PLD</th>
                    <th className="text-right py-2 w-12">W</th>
                    <th className="text-right py-2 w-12">D</th>
                    <th className="text-right py-2 w-12">L</th>
                    <th className="text-right py-2 w-12">GF</th>
                    <th className="text-right py-2 w-12">GA</th>
                    <th className="text-right py-2 w-12">GD</th>
                    <th className="text-right py-2 w-12">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.table?.map((row, idx) => (
                    <tr key={row.club.id} className="border-t border-zinc-800/70 text-zinc-200 hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2">{idx + 1}</td>
                      <td className="py-2">
                        <Link to={`/league/${parsedCompetitionId}/team/${row.club.id}`} className="hover:text-teal-300 transition-colors">
                          {row.club.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right">{row.p}</td>
                      <td className="py-2 text-right">{row.w}</td>
                      <td className="py-2 text-right">{row.d}</td>
                      <td className="py-2 text-right">{row.l}</td>
                      <td className="py-2 text-right">{row.gf}</td>
                      <td className="py-2 text-right">{row.ga}</td>
                      <td className="py-2 text-right">{row.gd}</td>
                      <td className="py-2 text-right font-semibold">{row.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
