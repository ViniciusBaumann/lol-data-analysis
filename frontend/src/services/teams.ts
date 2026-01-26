import api from './api';
import { Team, TeamDetail, TeamStats, ObjectiveStats, Match, PaginatedResponse, FilterParams, LeagueStandings } from '@/types';

export async function getTeams(params?: { search?: string; leagues?: number; page?: number }): Promise<PaginatedResponse<Team>> {
  const { data } = await api.get('/teams/', { params });
  return data;
}

export async function getTeam(id: number): Promise<TeamDetail> {
  const { data } = await api.get(`/teams/${id}/`);
  return data;
}

export async function getTeamStats(id: number, filters?: FilterParams): Promise<TeamStats> {
  const { data } = await api.get(`/teams/${id}/stats/`, { params: filters });
  return data;
}

export async function getTeamMatches(id: number, params?: FilterParams & { page?: number }): Promise<PaginatedResponse<Match>> {
  const { data } = await api.get(`/teams/${id}/matches/`, { params });
  return data;
}

export async function getTeamObjectives(id: number, filters?: FilterParams): Promise<ObjectiveStats> {
  const { data } = await api.get(`/teams/${id}/objectives/`, { params: filters });
  return data;
}

export async function getStandings(params?: { league?: number; year?: number; split?: string; search?: string }): Promise<LeagueStandings[]> {
  const { data } = await api.get('/standings/', { params });
  return data;
}
