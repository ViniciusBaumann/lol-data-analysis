export interface ScheduledMatchTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
}

export interface ScheduledMatch {
  startTime: string;
  state: 'unstarted' | 'inProgress';
  type: string;
  blockName: string;
  match: {
    id: string;
    strategy: { type: string; count: number };
    teams: ScheduledMatchTeam[];
  };
}

export interface ScheduledEventsResponse {
  events: ScheduledMatch[];
  message?: string;
}

export interface ScheduleTeam {
  name: string;
  code: string;
  image: string;
  result: { outcome: string | null; gameWins: number } | null;
  db_id: number | null;
}

export interface ScheduleMatch {
  match_id: string;
  start_time: string;
  state: 'unstarted' | 'completed';
  block_name: string;
  strategy: { type: string; count: number };
  league: { name: string; slug: string; image: string };
  teams: ScheduleTeam[];
}

export interface ScheduleResponse {
  upcoming: ScheduleMatch[];
  live: ScheduleMatch[];
  completed: ScheduleMatch[];
}
