import { memo, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Radio, RefreshCw, Loader2, ChevronLeft } from 'lucide-react';
import { useLiveGameDetail } from '@/hooks/useLiveGameDetail';
import {
  GameScoreboard,
  SeriesHeader,
  SeriesTimeline,
  LiveDot,
  AwaitingStartPanel,
  LaneMatchupsPanel,
  PlayerChampionHistoryPanel,
  TeamContextPanel,
  SynergiesPanel,
  MatchPredictionPanel,
  ScheduleMatchView,
} from '@/components/live';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'agora';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
}

function boLabel(strategy: { type: string; count: number }): string {
  if (strategy.type === 'bestOf') return `Bo${strategy.count}`;
  return '';
}

// ---------------------------------------------------------------------------
// Page Header Component
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  game: ReturnType<typeof useLiveGameDetail>['game'];
  scheduleMatch: ReturnType<typeof useLiveGameDetail>['scheduleMatch'];
  lastUpdated: Date | null;
  loading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
}

const PageHeader = memo(function PageHeader({
  game,
  scheduleMatch,
  lastUpdated,
  loading,
  isRefreshing,
  refresh,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <Link
          to="/live"
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ChevronLeft size={14} />
          Partidas
        </Link>
        <div className="h-4 w-px bg-zinc-800" />
        {game && (
          <>
            {game.league.image && (
              <img src={game.league.image} alt="" className="h-5 w-5 object-contain opacity-80" />
            )}
            <span className="text-sm font-medium text-zinc-400">{game.league.name}</span>
            {game.block_name && (
              <span className="text-sm text-zinc-600">{game.block_name}</span>
            )}
            <span className="text-sm text-zinc-600">{boLabel(game.strategy)}</span>
            <div className="flex items-center gap-1.5">
              <LiveDot />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
            </div>
          </>
        )}
        {scheduleMatch && !game && (
          <>
            {scheduleMatch.league.image && (
              <img src={scheduleMatch.league.image} alt="" className="h-5 w-5 object-contain opacity-80" />
            )}
            <span className="text-sm font-medium text-zinc-400">{scheduleMatch.league.name}</span>
          </>
        )}
        {lastUpdated && (
          <span className="text-[10px] text-zinc-600">{timeAgo(lastUpdated)}</span>
        )}
      </div>
      {game && (
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors text-zinc-400 disabled:opacity-50"
        >
          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          Atualizar
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Game Content Component
// ---------------------------------------------------------------------------

interface GameContentProps {
  game: NonNullable<ReturnType<typeof useLiveGameDetail>['game']>;
}

const GameContent = memo(function GameContent({ game }: GameContentProps) {
  // State to track which completed game is selected (null = show live game)
  const [selectedGameNumber, setSelectedGameNumber] = useState<number | null>(null);

  const handleSelectGame = useCallback((gameNumber: number | null) => {
    setSelectedGameNumber(gameNumber);
  }, []);

  const hasSeries = game.series_games && game.series_games.length > 1;
  const hasPlayers = game.players && (game.players.blue.length > 0 || game.players.red.length > 0);
  const preds = game.prediction?.predictions ?? null;

  // Check if current game in series is completed
  const isCurrentGameCompleted = useMemo(() => {
    return game.series_games?.find(sg => sg.game_id === game.game_id)?.state === 'completed';
  }, [game.series_games, game.game_id]);

  // Only show live player tables if game is in progress
  const showLivePlayerTables = hasPlayers && !isCurrentGameCompleted;

  // Check if game is awaiting start (no draft and no live stats)
  const isAwaitingStart = !isCurrentGameCompleted && !game.draft && !game.live_stats;

  // When a completed game is selected, hide all live/analytics panels
  const isViewingCompletedGame = selectedGameNumber !== null;

  // Check if enrichment panels should show (only for live game view)
  const hasEnrichment = game.enrichment && !isCurrentGameCompleted && !isViewingCompletedGame;
  const hasLaneMatchups = game.enrichment?.lane_matchups && game.enrichment.lane_matchups.length > 0;
  const hasPlayerChampionHistory = game.enrichment?.lane_matchups?.some(
    mu => mu.blue_player_stats || mu.red_player_stats
  );
  const hasSynergies = game.enrichment?.synergies &&
    (game.enrichment.synergies.blue.length > 0 || game.enrichment.synergies.red.length > 0);
  const hasTeamContext = !!game.enrichment?.team_context;
  const showAnalyticsPanels = !isViewingCompletedGame && (hasLaneMatchups || hasPlayerChampionHistory || hasSynergies || hasTeamContext);

  return (
    <>
      {/* Series Header (for Bo3/Bo5) */}
      {hasSeries && <SeriesHeader game={game} />}

      {/* Series Timeline */}
      {hasSeries && (
        <SeriesTimeline
          games={game.series_games!}
          ddragonVersion={game.ddragon_version}
          selectedGameNumber={selectedGameNumber}
          onSelectGame={handleSelectGame}
        />
      )}

      {/* Only show live content when NOT viewing a completed game */}
      {!isViewingCompletedGame && (
        <>
          {/* Awaiting Start - Show spinner when no draft and no live stats */}
          {isAwaitingStart && <AwaitingStartPanel game={game} />}

          {/* Game content - only show when not awaiting start */}
          {!isAwaitingStart && (
            <>
              {/* Live Scoreboard (main content for live games) */}
              {!isCurrentGameCompleted && showLivePlayerTables && (
                <GameScoreboard game={game} ddragonVersion={game.ddragon_version} />
              )}

              {/* Match Prediction Panel (draft + predictions) */}
              {!isCurrentGameCompleted && game.draft && (
                <MatchPredictionPanel
                  draft={game.draft}
                  predictions={preds}
                  predictionMessage={game.prediction?.message}
                  matchPrediction={game.enrichment?.match_prediction}
                  teamContext={game.enrichment?.team_context}
                  blueTeam={game.blue_team}
                  redTeam={game.red_team}
                  ddragonVersion={game.ddragon_version}
                />
              )}

              {/* Analytics Enrichment */}
              {hasEnrichment && (
                <>
                  {/* Lane Matchups + Synergies (left) | Team Context (right) */}
                  {showAnalyticsPanels && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Left column: Lane Matchups + Player History + Synergies stacked */}
                      <div className="flex flex-col gap-4">
                        {hasLaneMatchups && (
                          <LaneMatchupsPanel matchups={game.enrichment!.lane_matchups!} />
                        )}
                        {hasPlayerChampionHistory && (
                          <PlayerChampionHistoryPanel matchups={game.enrichment!.lane_matchups!} />
                        )}
                        {hasSynergies && (
                          <SynergiesPanel synergies={game.enrichment!.synergies!} />
                        )}
                      </div>

                      {/* Right column: Team Context */}
                      {hasTeamContext && (
                        <TeamContextPanel
                          context={game.enrichment!.team_context!}
                          blueTeamCode={game.blue_team.code}
                          redTeamCode={game.red_team.code}
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {/* No stats message - only show if stats not enabled for this league */}
              {!isCurrentGameCompleted && !game.live_stats && !game.stats_enabled && game.draft && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <p className="text-xs text-zinc-600 text-center">
                    Placar ao vivo indisponivel para esta liga
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function LiveGameDetailPage() {
  const { matchId } = useParams<{ matchId: string }>();

  const {
    game,
    scheduleMatch,
    compareData,
    loading,
    scheduleLoading,
    compareLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
  } = useLiveGameDetail(matchId);

  const isLoadingAny = loading || scheduleLoading;
  const showScheduleView = !game && scheduleMatch && !scheduleLoading;

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <PageHeader
        game={game}
        scheduleMatch={scheduleMatch}
        lastUpdated={lastUpdated}
        loading={loading}
        isRefreshing={isRefreshing}
        refresh={refresh}
      />

      {/* Loading */}
      {isLoadingAny && !game && !scheduleMatch && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
          <span className="ml-2 text-sm text-zinc-500">Carregando...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && !game && !scheduleMatch && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Scheduled Match View */}
      {showScheduleView && (
        <ScheduleMatchView
          match={scheduleMatch}
          compareData={compareData}
          compareLoading={compareLoading}
        />
      )}

      {/* Not found */}
      {!isLoadingAny && !error && !game && !scheduleMatch && (
        <div className="text-center py-20 text-zinc-600">
          <Radio size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium">Partida nao encontrada</p>
          <p className="text-sm mt-1">A partida pode ter finalizado.</p>
          <Link to="/live" className="text-emerald-400 text-sm mt-3 inline-block hover:underline">
            Voltar para Ao Vivo
          </Link>
        </div>
      )}

      {/* Game Detail */}
      {game && <GameContent game={game} />}
    </div>
  );
}
