import { ScrollArea } from '@/components/scroll-area';
import db from '@/../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

export function Page() {
  const { competitionId, clubId, playerId } = useParams();
  const parsedCompetitionId = useMemo(() => Number(competitionId), [competitionId]);
  const parsedClubId = useMemo(() => Number(clubId), [clubId]);
  const parsedPlayerId = useMemo(() => Number(playerId), [playerId]);

  const data = useLiveQuery(async () => {
    if (!Number.isFinite(parsedCompetitionId) || parsedCompetitionId <= 0) {
      return { error: 'Invalid competition id' } as const;
    }
    if (!Number.isFinite(parsedClubId) || parsedClubId <= 0) {
      return { error: 'Invalid club id' } as const;
    }
    if (!Number.isFinite(parsedPlayerId) || parsedPlayerId <= 0) {
      return { error: 'Invalid player id' } as const;
    }

    const [competition, club, player] = await Promise.all([
      db.table('competition').get(parsedCompetitionId),
      db.table('club').get(parsedClubId),
      db.table('person').get(parsedPlayerId),
    ]);

    if (!competition) return { error: `Competition ${parsedCompetitionId} not found` } as const;
    if (!club) return { error: `Club ${parsedClubId} not found` } as const;
    if (!player || player.clubId !== parsedClubId || player.role !== 'player') {
      return { error: `Player ${parsedPlayerId} not found in club ${parsedClubId}` } as const;
    }

    return {
      competitionName: competition.name,
      clubName: club.name,
      player,
    } as const;
  }, [parsedCompetitionId, parsedClubId, parsedPlayerId]);

  return (
    <div className="h-[calc(100vh-120px)] px-2.5 pb-2.5">
      <ScrollArea className="h-full">
        <div className="pr-2 pb-4 space-y-3">
          {data?.error ? (
            <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-4 text-sm text-red-300">{data.error}</div>
          ) : (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-2">
              <h1 className="text-lg font-semibold text-zinc-100">{data?.player?.name || 'Player'}</h1>
              <p className="text-sm text-zinc-300">Position: {data?.player?.position || '-'}</p>
              <p className="text-xs text-zinc-500">Club: {data?.clubName || '-'}</p>
              <p className="text-xs text-zinc-500">League: {data?.competitionName || '-'}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
