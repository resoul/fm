import { ScrollArea } from '@/components/scroll-area';
import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

type PersonRow = {
  id: number;
  name: string;
  role: string;
  clubId: number;
  position: string | null;
  number?: string | number | null;
};

export function Page() {
  const { competitionId, clubId } = useParams();
  const parsedCompetitionId = useMemo(() => Number(competitionId), [competitionId]);
  const parsedClubId = useMemo(() => Number(clubId), [clubId]);

  const data = useLiveQuery(async () => {
    if (!Number.isFinite(parsedCompetitionId) || parsedCompetitionId <= 0) {
      return { error: 'Invalid competition id' } as const;
    }

    if (!Number.isFinite(parsedClubId) || parsedClubId <= 0) {
      return { error: 'Invalid club id' } as const;
    }

    const [competition, club] = await Promise.all([
      db.table('competition').get(parsedCompetitionId),
      db.table('club').get(parsedClubId),
    ]);

    if (!competition) return { error: `Competition ${parsedCompetitionId} not found` } as const;
    if (!club) return { error: `Club ${parsedClubId} not found` } as const;

    const players = await db
      .table('person')
      .where('clubId')
      .equals(parsedClubId)
      .and((p: PersonRow) => p.role === 'player')
      .toArray();

    return {
      competitionName: competition.name,
      clubName: club.name,
      players: players.sort((a, b) => a.name.localeCompare(b.name)),
    } as const;
  }, [parsedCompetitionId, parsedClubId]);

  return (
    <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
      <ScrollArea className="h-full">
        <div className="pr-2 pb-4 space-y-3">
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4">
            <h1 className="text-lg font-semibold text-zinc-100">{data?.clubName || 'Team'}</h1>
            <p className="text-xs text-zinc-500">League: {data?.competitionName || '-'}</p>
          </div>

          {data?.error ? (
            <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-4 text-sm text-red-300">{data.error}</div>
          ) : (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 overflow-hidden">
              <div className="grid grid-cols-[80px_1fr_100px] bg-zinc-900 px-3 py-2 text-xs text-zinc-400 uppercase tracking-wide">
                <div>ID</div>
                <div>Name</div>
                <div>Pos</div>
              </div>
              {(data?.players || []).length === 0 ? (
                <div className="px-3 py-3 text-sm text-zinc-500">No players found for this team.</div>
              ) : (
                (data?.players || []).map((player) => (
                  <Link
                    key={player.id}
                    to={`/league/${parsedCompetitionId}/team/${parsedClubId}/player/${player.id}`}
                    className="grid grid-cols-[80px_1fr_100px] px-3 py-2 text-sm border-t border-zinc-800/70 hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="text-zinc-400">{player.id}</div>
                    <div className="text-zinc-200">{player.name}</div>
                    <div className="text-zinc-300">{player.position || '-'}</div>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
