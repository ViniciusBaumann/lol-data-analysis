import { useState, useEffect, useCallback, useRef } from 'react';
import { ChampionInfo, DraftPredictionResponse, Team } from '@/types';
import { getChampions, getDraftPrediction } from '@/services/draft';
import { getTeams } from '@/services/teams';

const SLOTS = [
  'blue_top', 'blue_jng', 'blue_mid', 'blue_bot', 'blue_sup',
  'red_top', 'red_jng', 'red_mid', 'red_bot', 'red_sup',
] as const;

export type DraftSlot = (typeof SLOTS)[number];

type DraftState = Record<DraftSlot, string | null>;

const EMPTY_DRAFT: DraftState = {
  blue_top: null, blue_jng: null, blue_mid: null, blue_bot: null, blue_sup: null,
  red_top: null, red_jng: null, red_mid: null, red_bot: null, red_sup: null,
};

export function useDraft() {
  const [draft, setDraft] = useState<DraftState>({ ...EMPTY_DRAFT });
  const [champions, setChampions] = useState<ChampionInfo[]>([]);
  const [championsLoading, setChampionsLoading] = useState(false);
  const [prediction, setPrediction] = useState<DraftPredictionResponse | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const predictAbort = useRef<AbortController | null>(null);

  // Team selection
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [blueTeamId, setBlueTeamId] = useState<number | null>(null);
  const [redTeamId, setRedTeamId] = useState<number | null>(null);

  // Load champion list on mount
  useEffect(() => {
    setChampionsLoading(true);
    getChampions()
      .then(setChampions)
      .catch(() => setChampions([]))
      .finally(() => setChampionsLoading(false));
  }, []);

  // Load teams list on mount
  useEffect(() => {
    setTeamsLoading(true);
    getTeams()
      .then((res) => setTeams(res.results))
      .catch(() => setTeams([]))
      .finally(() => setTeamsLoading(false));
  }, []);

  const setSlot = useCallback((key: DraftSlot, champion: string) => {
    setDraft((prev) => ({ ...prev, [key]: champion }));
  }, []);

  const clearSlot = useCallback((key: DraftSlot) => {
    setDraft((prev) => ({ ...prev, [key]: null }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraft({ ...EMPTY_DRAFT });
    setBlueTeamId(null);
    setRedTeamId(null);
    setPrediction(null);
    setError(null);
  }, []);

  const isComplete = SLOTS.every((slot) => draft[slot] !== null);

  // Selected champion names (for disabling duplicates)
  const selectedChampions = new Set(
    Object.values(draft).filter((v): v is string => v !== null)
  );

  // Auto-predict when all 10 slots are filled
  useEffect(() => {
    if (!isComplete) {
      setPrediction(null);
      return;
    }

    // Cancel previous request
    if (predictAbort.current) {
      predictAbort.current.abort();
    }
    const controller = new AbortController();
    predictAbort.current = controller;

    setPredictionLoading(true);
    setError(null);

    const draftPayload: Record<string, string> = {};
    for (const slot of SLOTS) {
      draftPayload[slot] = draft[slot]!;
    }

    getDraftPrediction(draftPayload, blueTeamId, redTeamId)
      .then((res) => {
        if (!controller.signal.aborted) {
          setPrediction(res);
          if (res.message && !res.predictions) {
            setError(res.message);
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            'Failed to fetch draft prediction'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPredictionLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.blue_top, draft.blue_jng, draft.blue_mid, draft.blue_bot, draft.blue_sup,
    draft.red_top, draft.red_jng, draft.red_mid, draft.red_bot, draft.red_sup,
    blueTeamId, redTeamId,
  ]);

  return {
    draft,
    setSlot,
    clearSlot,
    clearDraft,
    isComplete,
    champions,
    championsLoading,
    selectedChampions,
    prediction,
    predictionLoading,
    error,
    teams,
    teamsLoading,
    blueTeamId,
    redTeamId,
    setBlueTeamId,
    setRedTeamId,
  };
}
