import api from './api';
import { LiveGamesResponse, ScheduleResponse, LiveGame } from '@/types';

export async function getLiveGames(minimal = false): Promise<LiveGamesResponse> {
  try {
    const res = await api.get<LiveGamesResponse>('/live/', {
      params: minimal ? { minimal: 'true' } : undefined,
    });
    if (!res.data?.games?.length) {
      console.warn('[live] getLiveGames: nenhum jogo ao vivo encontrado');
    }
    return res.data;
  } catch (err) {
    console.error('[live] getLiveGames falhou:', err);
    throw err;
  }
}

export async function getLiveMatchDetail(matchId: string): Promise<LiveGame> {
  try {
    const res = await api.get<LiveGame>(`/live/${matchId}/`);
    const g = res.data;
    if (!g.draft) console.warn(`[live] match ${matchId}: draft nao encontrado`);
    if (!g.live_stats) console.warn(`[live] match ${matchId}: live_stats nao encontrado`);
    if (!g.players) console.warn(`[live] match ${matchId}: players nao encontrado`);
    if (!g.prediction) console.warn(`[live] match ${matchId}: prediction nao encontrado`);
    if (!g.enrichment) console.warn(`[live] match ${matchId}: enrichment nao encontrado`);
    if (g.series_games) {
      for (const sg of g.series_games) {
        if (sg.state === 'completed') {
          if (!sg.final_stats) console.warn(`[live] match ${matchId} G${sg.number}: final_stats nulo (snapshot pode nao existir)`);
          if (!sg.draft) console.warn(`[live] match ${matchId} G${sg.number}: draft nulo em jogo completado`);
          if (!sg.players) console.warn(`[live] match ${matchId} G${sg.number}: players nulo em jogo completado`);
        }
      }
    }
    return g;
  } catch (err) {
    console.error(`[live] getLiveMatchDetail(${matchId}) falhou:`, err);
    throw err;
  }
}

export async function getSchedule(): Promise<ScheduleResponse> {
  try {
    const res = await api.get<ScheduleResponse>('/schedule/');
    return res.data;
  } catch (err) {
    console.error('[live] getSchedule falhou:', err);
    throw err;
  }
}
