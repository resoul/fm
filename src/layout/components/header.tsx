import { Button } from "@/components/button";
import {
    PanelLeftClose,
    PanelLeftOpen,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    Search,
    Globe,
    HelpCircle,
    ChevronRight as ArrowRight,
} from "lucide-react";
import { useLayout } from "./use-layout";
import { NavbarMenu } from './navbar-menu';
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import Settings from "./menu/settings";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/../db/db";
import useCurrentDate from "@/hooks/useCurrentDate";
import { setShowTimeline } from "@/state/useEventStates";

type HeaderEntityData = {
    number?: number;
    name: string;
    subtitle: string;
    logoUrl?: string | undefined;
};

export function Header() {
    const { toggleSidebar, sidebarCollapsed } = useLayout();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const dateTime = useCurrentDate();
    const leagues = useLiveQuery(
        async () =>
            (await db.table('competition').toArray())
                .filter((competition) => competition.type === 'league')
                .sort((a, b) => a.id - b.id),
        []
    );

    const continueClick = () => {
        if (!dateTime){
            return;
        }
        dateTime.continue();
        setShowTimeline(true);
    };

    const leagueMatch = pathname.match(/^\/league\/(\d+)(?:\/|$)/);
    const leagueTeamMatch = pathname.match(/^\/league\/(\d+)\/team\/(\d+)(?:\/|$)/);
    const leaguePlayerMatch = pathname.match(/^\/league\/(\d+)\/team\/(\d+)\/player\/(\d+)(?:\/|$)/);
    const currentLeagueId = leagueMatch ? Number(leagueMatch[1]) : null;
    const currentClubId = leaguePlayerMatch
        ? Number(leaguePlayerMatch[2])
        : leagueTeamMatch
            ? Number(leagueTeamMatch[2])
            : null;
    const currentPlayerId = leaguePlayerMatch ? Number(leaguePlayerMatch[3]) : null;
    const isLeaguePage = currentLeagueId !== null;
    const isLeagueTeamPage = currentLeagueId !== null && currentClubId !== null;
    const isLeaguePlayerPage = currentLeagueId !== null && currentClubId !== null && currentPlayerId !== null;
    const leagueIdForTeams = leagueTeamMatch ? Number(leagueTeamMatch[1]) : null;

    const teamIdForPlayers = leaguePlayerMatch ? Number(leaguePlayerMatch[2]) : null;
    const leagueIdForPlayers = leaguePlayerMatch ? Number(leaguePlayerMatch[1]) : null;
    const matchesResultMatch = pathname.match(/^\/matches\/results\/(\d+)(?:\/|$)/);
    const matchesCompetitionId = matchesResultMatch ? Number(matchesResultMatch[1]) : null;
    const isMatchesResultsPage = matchesCompetitionId !== null;

    const leagueTeams = useLiveQuery(
        async () => {
            if (leagueIdForTeams === null) return [];

            const seasons = await db.table('season').where('competitionId').equals(leagueIdForTeams).toArray();
            if (seasons.length === 0) return [];

            const activeSeason =
                seasons.find((s) => s.isActive) ||
                [...seasons].sort((a, b) => (b.id || 0) - (a.id || 0))[0];

            const seasonClubs = await db.table('seasonClub').where('seasonId').equals(activeSeason.id).toArray();
            const clubs = await Promise.all(
                seasonClubs.map(async (sClub) => db.table('club').get(sClub.clubId))
            );

            return clubs
                .filter((club): club is { id: number; name: string } => Boolean(club))
                .sort((a, b) => a.name.localeCompare(b.name));
        },
        [leagueIdForTeams]
    );

    const teamPlayers = useLiveQuery(
        async () => {
            if (teamIdForPlayers === null) return [];
            const players = await db
                .table('person')
                .where('clubId')
                .equals(teamIdForPlayers)
                .and((p) => p.role === 'player')
                .toArray();

            return players.sort((a, b) => a.name.localeCompare(b.name));
        },
        [teamIdForPlayers]
    );

    const headerEntityData = useLiveQuery<HeaderEntityData>(
        async () => {
            if (isLeaguePlayerPage && currentLeagueId !== null && currentClubId !== null && currentPlayerId !== null) {
                const [player, club] = await Promise.all([
                    db.table('person').get(currentPlayerId),
                    db.table('club').get(currentClubId),
                ]);

                return {
                    number: player?.number ? Number(player.number) : undefined,
                    name: player?.name || `Player ${currentPlayerId}`,
                    subtitle: `${player?.position || '-'} - ${club?.name || '-'}`,
                    logoUrl: undefined,
                };
            }

            if (isLeagueTeamPage && currentLeagueId !== null && currentClubId !== null) {
                const [competition, club] = await Promise.all([
                    db.table('competition').get(currentLeagueId),
                    db.table('club').get(currentClubId),
                ]);

                return {
                    name: club?.name || `Club ${currentClubId}`,
                    subtitle: `League: ${competition?.name || '-'}`,
                    logoUrl: undefined,
                };
            }

            if (isLeaguePage && currentLeagueId !== null) {
                const competition = await db.table('competition').get(currentLeagueId);
                const seasons = await db.table('season').where('competitionId').equals(currentLeagueId).toArray();
                const activeSeason =
                    seasons.find((s) => s.isActive) ||
                    [...seasons].sort((a, b) => (b.id || 0) - (a.id || 0))[0];

                return {
                    name: competition?.name || `League ${currentLeagueId}`,
                    subtitle: `Season: ${activeSeason?.name || '-'}`,
                    logoUrl: undefined,
                };
            }

            if (isMatchesResultsPage && matchesCompetitionId !== null) {
                const competition = await db.table('competition').get(matchesCompetitionId);
                const seasons = await db.table('season').where('competitionId').equals(matchesCompetitionId).toArray();
                const activeSeason =
                    seasons.find((s) => s.isActive) ||
                    [...seasons].sort((a, b) => (b.id || 0) - (a.id || 0))[0];

                return {
                    name: `${competition?.name || `League ${matchesCompetitionId}`} Results`,
                    subtitle: `Season: ${activeSeason?.name || '-'}`,
                    logoUrl: undefined,
                };
            }

            return {
                number: 22,
                name: "YEHOR KLYMENCHUK",
                subtitle: "Defender (Left) / WB (L), DM - Metalist",
                logoUrl: undefined,
            };
        },
        [pathname, isLeaguePage, isLeagueTeamPage, isLeaguePlayerPage, isMatchesResultsPage, currentLeagueId, currentClubId, currentPlayerId, matchesCompetitionId]
    );

    const browseLeague = (direction: 'up' | 'down') => {
        if (!isLeaguePage || !leagues || leagues.length === 0 || currentLeagueId === null) return;

        const currentIndex = leagues.findIndex((league) => league.id === currentLeagueId);
        if (currentIndex === -1) return;

        const nextIndex =
            direction === 'up'
                ? (currentIndex - 1 + leagues.length) % leagues.length
                : (currentIndex + 1) % leagues.length;

        navigate(`/league/${leagues[nextIndex].id}`);
    };

    const browseLeagueTeam = (direction: 'up' | 'down') => {
        if (!isLeagueTeamPage || !leagueTeams || leagueTeams.length === 0 || currentClubId === null || currentLeagueId === null) return;

        const currentIndex = leagueTeams.findIndex((club) => club.id === currentClubId);
        if (currentIndex === -1) return;

        const nextIndex =
            direction === 'up'
                ? (currentIndex - 1 + leagueTeams.length) % leagueTeams.length
                : (currentIndex + 1) % leagueTeams.length;

        navigate(`/league/${currentLeagueId}/team/${leagueTeams[nextIndex].id}`);
    };

    const browseLeaguePlayer = (direction: 'up' | 'down') => {
        if (
            !isLeaguePlayerPage ||
            !teamPlayers ||
            teamPlayers.length === 0 ||
            currentPlayerId === null ||
            currentClubId === null ||
            leagueIdForPlayers === null
        ) return;

        const currentIndex = teamPlayers.findIndex((player) => player.id === currentPlayerId);
        if (currentIndex === -1) return;

        const nextIndex =
            direction === 'up'
                ? (currentIndex - 1 + teamPlayers.length) % teamPlayers.length
                : (currentIndex + 1) % teamPlayers.length;

        navigate(`/league/${leagueIdForPlayers}/team/${currentClubId}/player/${teamPlayers[nextIndex].id}`);
    };

    const browseEntities = (direction: 'up' | 'down') => {
        if (isMatchesResultsPage && matchesCompetitionId !== null && leagues && leagues.length > 0) {
            const currentIndex = leagues.findIndex((league) => league.id === matchesCompetitionId);
            if (currentIndex !== -1) {
                const nextIndex =
                    direction === 'up'
                        ? (currentIndex - 1 + leagues.length) % leagues.length
                        : (currentIndex + 1) % leagues.length;
                navigate(`/matches/results/${leagues[nextIndex].id}`);
                return;
            }
        }

        if (isLeaguePlayerPage) {
            browseLeaguePlayer(direction);
            return;
        }

        if (isLeagueTeamPage) {
            browseLeagueTeam(direction);
            return;
        }

        browseLeague(direction);
    };
    const canBrowseEntities = isLeaguePage || isMatchesResultsPage;

    if (!dateTime){
        return <>Loading...</>
    }

    return (
        <div className="flex flex-col">
            {/* Top bar */}
            <div className="flex items-stretch min-h-[52px] bg-background">
                {/* Left section */}
                <div className="flex items-center gap-1 px-2">
                    {/* Sidebar toggle */}
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={toggleSidebar}
                        className="hidden lg:inline-flex"
                    >
                        {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
                    </Button>

                    {/* Back / Forward */}
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={() => navigate(-1)}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        mode="icon"
                        size="sm"
                        onClick={() => navigate(1)}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>

                {/* Club identity */}
                <div className="flex items-center gap-2 px-3">
                    {/* Club logo */}
                    <div className="relative flex items-center justify-center size-9 rounded-md overflow-hidden bg-muted shrink-0">
                        {headerEntityData?.logoUrl ? (
                            <img src={headerEntityData?.logoUrl} alt="Club logo" className="size-full object-contain" />
                        ) : (
                            // Placeholder shield
                            <svg viewBox="0 0 32 36" className="size-7 text-yellow-500" fill="currentColor">
                                <path d="M16 2L3 8v10c0 8.5 5.5 16.5 13 19 7.5-2.5 13-10.5 13-19V8L16 2z" />
                                <path d="M16 6L7 11v7c0 5.8 3.7 11.2 9 13.4 5.3-2.2 9-7.6 9-13.4v-7L16 6z" fill="currentColor" opacity="0.3" />
                            </svg>
                        )}
                    </div>

                    {/* Up/Down arrow to browse entities */}
                    <div className="flex flex-col gap-0">
                        <button
                            onClick={() => browseEntities('up')}
                            disabled={!canBrowseEntities}
                            className="flex items-center justify-center h-4 w-5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronUp className="size-3.5" />
                        </button>
                        <button
                            onClick={() => browseEntities('down')}
                            disabled={!canBrowseEntities}
                            className="flex items-center justify-center h-4 w-5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronDown className="size-3.5" />
                        </button>
                    </div>

                    {/* Search icon */}
                    <button className="flex items-center justify-center size-7 text-muted-foreground hover:text-foreground transition-colors">
                        <Search className="size-4" />
                    </button>

                    {/* Name & subtitle */}
                    <div className="flex flex-col justify-center min-w-0">
                        <span className="text-sm font-bold text-foreground leading-tight tracking-wide truncate">
                            {headerEntityData?.number && (
                                <span className="text-muted-foreground font-normal mr-1">{headerEntityData?.number}.</span>
                            )}
                            {headerEntityData?.name || 'Football Manager'}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight truncate">
                            {headerEntityData?.subtitle || '-'}
                        </span>
                    </div>
                </div>

                {/* Spacer */}
                <div className="w-8" />

                {/* Right section */}
                <div className="flex items-center gap-1 px-2 ml-auto">
                    {/* Globe / online */}
                    <Button variant="ghost" mode="icon" size="sm">
                        <Globe className="size-4" />
                    </Button>

                    {/* Help */}
                    <Button variant="ghost" mode="icon" size="sm">
                        <HelpCircle className="size-4" />
                    </Button>

                    {/* FM badge */}
                    <Settings />
                    {/* <div className="px-2 py-0.5 text-xs font-bold text-muted-foreground rounded">
                        FM
                    </div> */}

                    {/* Divider */}
                    <div className="w-px h-7 bg-input mx-1" />

                    {/* Date / Time */}
                    <div className="flex flex-col items-end justify-center min-w-[90px]">
                        <span className="text-xs font-semibold text-foreground leading-tight">
                            <span className="mr-1">
                                {new Date(dateTime.date).toLocaleString('en-US', { weekday: 'short' })}
                            </span>
                            {dateTime.getLocaleTime()}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight">
                            {dateTime.getLocaleDate()}
                        </span>
                    </div>

                    {/* Continue button */}
                    <Button
                        onClick={continueClick}
                        size="sm"
                        className={cn(
                            "ms-2 gap-1.5 font-bold tracking-wider uppercase text-xs px-4 h-9",
                            "bg-teal-600 hover:bg-teal-500 text-white border-none"
                        )}
                    >
                        Continue
                        <ArrowRight className="size-3.5" />
                    </Button>
                </div>
            </div>

            {/* Bottom nav menu */}
            <NavbarMenu />
        </div>
    );
}
