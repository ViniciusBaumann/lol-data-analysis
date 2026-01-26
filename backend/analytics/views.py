import logging
from collections import defaultdict

import requests as http_requests
from django.core.management import call_command
from django.db.models import Avg, Count, IntegerField, Q, Sum
from django.db.models.functions import Cast
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

LEAGUE_SLUG_TO_ESPORTS_ID = {
    "lck": "98767991310872058",
    "lpl": "98767991314006698",
    "lec": "98767991302996019",
    "lcs": "98767991299243165",
    "lta-norte": "113475181289872818",
    "lta-sul": "113475181441048986",
    "cblol": "98767991332355509",
    "pcs": "104366947775790222",
    "ljl": "98767991349978712",
    "lco": "105709090213554609",
    "worlds": "98767975604431411",
    "msi": "98767991325878492",
    "vcs": "107898214974993351",
    "lck-cl": "98767991335774713",
}

LOL_ESPORTS_API_KEY = "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z"
LOL_ESPORTS_BASE_URL = "https://esports-api.lolesports.com/persisted/gw"

from .models import (
    DataImportLog,
    League,
    Match,
    Player,
    PlayerMatchStats,
    Team,
    TeamMatchStats,
)
from .serializers import (
    DataImportLogSerializer,
    LeagueSerializer,
    MatchDetailSerializer,
    MatchListSerializer,
    PlayerSerializer,
    TeamDetailSerializer,
    TeamListSerializer,
    TeamMinSerializer,
)


def _apply_match_filters(queryset, params):
    """Apply common match-related filters to a TeamMatchStats queryset.

    Args:
        queryset: A TeamMatchStats queryset to filter.
        params: Request query parameters containing optional filters.

    Returns:
        Filtered queryset.
    """
    league = params.get("league")
    year = params.get("year")
    split = params.get("split")
    patch = params.get("patch")
    date_from = params.get("date_from")
    date_to = params.get("date_to")

    if league:
        queryset = queryset.filter(match__league_id=league)
    if year:
        queryset = queryset.filter(match__year=year)
    if split:
        queryset = queryset.filter(match__split__iexact=split)
    if patch:
        queryset = queryset.filter(match__patch=patch)
    if date_from:
        queryset = queryset.filter(match__date__gte=date_from)
    if date_to:
        queryset = queryset.filter(match__date__lte=date_to)

    return queryset


def _apply_match_filters_on_match(queryset, params):
    """Apply common filters directly on a Match queryset.

    Args:
        queryset: A Match queryset to filter.
        params: Request query parameters containing optional filters.

    Returns:
        Filtered queryset.
    """
    league = params.get("league")
    year = params.get("year")
    split = params.get("split")
    patch = params.get("patch")
    date_from = params.get("date_from")
    date_to = params.get("date_to")

    if league:
        queryset = queryset.filter(league_id=league)
    if year:
        queryset = queryset.filter(year=year)
    if split:
        queryset = queryset.filter(split__iexact=split)
    if patch:
        queryset = queryset.filter(patch=patch)
    if date_from:
        queryset = queryset.filter(date__gte=date_from)
    if date_to:
        queryset = queryset.filter(date__lte=date_to)

    return queryset


class LeagueViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing and retrieving leagues."""

    queryset = League.objects.all()
    serializer_class = LeagueSerializer
    permission_classes = [AllowAny]
    search_fields = ["name"]

    def get_queryset(self):
        year = self.request.query_params.get("year")
        match_filter = Q(matches__year=int(year)) if year else Q()
        qs = League.objects.annotate(
            total_matches=Count("matches", filter=match_filter)
        ).order_by("-total_matches")
        if year:
            qs = qs.filter(total_matches__gt=0)
        return qs


    @action(detail=True, methods=["get"], url_path="schedule")
    def schedule(self, request, pk=None):
        """Return upcoming/live matches from LoL Esports Schedule API."""
        league = self.get_object()
        esports_id = LEAGUE_SLUG_TO_ESPORTS_ID.get(league.slug)

        if not esports_id:
            return Response({"events": []})

        try:
            resp = http_requests.get(
                f"{LOL_ESPORTS_BASE_URL}/getSchedule",
                params={"hl": "pt-BR", "leagueId": esports_id},
                headers={"x-api-key": LOL_ESPORTS_API_KEY},
                timeout=10,
            )
            resp.raise_for_status()
            api_data = resp.json()
        except Exception:
            logger.exception("Failed to fetch LoL Esports schedule for %s", league.slug)
            return Response({"events": []})

        schedule = api_data.get("data", {}).get("schedule", {})
        raw_events = schedule.get("events", [])

        events = []
        for ev in raw_events:
            state = ev.get("state", "")
            if state not in ("unstarted", "inProgress"):
                continue

            match_data = ev.get("match", {})
            teams_raw = match_data.get("teams", [])

            # Skip events with TBD / unannounced teams
            has_tbd = False
            for t in teams_raw:
                name = t.get("name", "").strip()
                code = t.get("code", "").strip()
                if not name or name.upper() == "TBD" or not code or code.upper() == "TBD":
                    has_tbd = True
                    break
            if has_tbd:
                continue

            teams = []
            for t in teams_raw:
                teams.append({
                    "name": t.get("name", ""),
                    "code": t.get("code", ""),
                    "image": t.get("image", ""),
                    "result": t.get("result"),
                })

            events.append({
                "startTime": ev.get("startTime", ""),
                "state": state,
                "type": ev.get("type", "match"),
                "blockName": ev.get("blockName", ""),
                "match": {
                    "id": match_data.get("id", ""),
                    "strategy": match_data.get("strategy", {}),
                    "teams": teams,
                },
            })

        events.sort(key=lambda e: e["startTime"], reverse=True)

        return Response({"events": events})


class TeamViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing and retrieving teams with stats."""

    queryset = Team.objects.prefetch_related("leagues", "players")
    permission_classes = [AllowAny]
    search_fields = ["name", "short_name"]
    filterset_fields = ["leagues"]

    def get_serializer_class(self):
        """Return detail serializer for retrieve action, list serializer otherwise."""
        if self.action == "retrieve":
            return TeamDetailSerializer
        return TeamListSerializer

    @action(detail=True, methods=["get"], url_path="stats")
    def stats(self, request, pk=None):
        """Return aggregated stats for a specific team.

        Accepts query params: league, year, split, patch, date_from, date_to.
        """
        team = self.get_object()
        team_stats = TeamMatchStats.objects.filter(team=team).select_related("match")
        team_stats = _apply_match_filters(team_stats, request.query_params)

        total_matches = team_stats.count()
        if total_matches == 0:
            return Response(
                {
                    "team": TeamMinSerializer(team).data,
                    "total_matches": 0,
                    "message": "No matches found for the given filters.",
                }
            )

        wins = team_stats.filter(is_winner=True).count()
        losses = total_matches - wins

        # Aggregate combat and objective averages
        aggregates = team_stats.aggregate(
            avg_kills=Avg("kills"),
            avg_deaths=Avg("deaths"),
            avg_assists=Avg("assists"),
            avg_gold=Avg("total_gold"),
            avg_dragons=Avg("dragons"),
            avg_barons=Avg("barons"),
            avg_towers=Avg("towers"),
            avg_heralds=Avg("heralds"),
            avg_voidgrubs=Avg("voidgrubs"),
            avg_inhibitors=Avg("inhibitors"),
            avg_golddiffat10=Avg("golddiffat10"),
            avg_golddiffat15=Avg("golddiffat15"),
            avg_xpdiffat10=Avg("xpdiffat10"),
            avg_xpdiffat15=Avg("xpdiffat15"),
            first_blood_count=Sum(Cast("first_blood", IntegerField())),
            first_dragon_count=Sum(Cast("first_dragon", IntegerField())),
            first_herald_count=Sum(Cast("first_herald", IntegerField())),
            first_baron_count=Sum(Cast("first_baron", IntegerField())),
            first_tower_count=Sum(Cast("first_tower", IntegerField())),
            first_inhibitor_count=Sum(Cast("first_inhibitor", IntegerField())),
        )

        # Side stats
        blue_stats = team_stats.filter(side="Blue")
        blue_total = blue_stats.count()
        blue_wins = blue_stats.filter(is_winner=True).count()

        red_stats = team_stats.filter(side="Red")
        red_total = red_stats.count()
        red_wins = red_stats.filter(is_winner=True).count()

        # Average game length and over/under stats from related matches
        match_ids = list(team_stats.values_list("match_id", flat=True))
        matches_qs = Match.objects.filter(id__in=match_ids)
        avg_game_length = matches_qs.aggregate(
            avg_length=Avg("game_length")
        )["avg_length"]

        # Over/under: combined stats from BOTH teams per match
        match_totals = (
            TeamMatchStats.objects.filter(match_id__in=match_ids)
            .values("match_id")
            .annotate(
                total_kills=Sum("kills"),
                total_towers=Sum("towers"),
            )
        )
        kills_over_25 = sum(1 for m in match_totals if (m["total_kills"] or 0) > 25)
        towers_over_10 = sum(1 for m in match_totals if (m["total_towers"] or 0) > 10)

        # Recent form
        recent_stats = team_stats.order_by("-match__date")
        form_last5_qs = recent_stats[:5]
        form_last10_qs = recent_stats[:10]

        form_last5_list = list(form_last5_qs.values_list("is_winner", flat=True))
        form_last10_list = list(form_last10_qs.values_list("is_winner", flat=True))

        form_last5 = (
            round((sum(form_last5_list) / len(form_last5_list)) * 100, 1)
            if form_last5_list
            else 0.0
        )
        form_last10 = (
            round((sum(form_last10_list) / len(form_last10_list)) * 100, 1)
            if form_last10_list
            else 0.0
        )

        def _safe_rate(count, total):
            """Calculate percentage rate safely."""
            if not count or total == 0:
                return 0.0
            return round((count / total) * 100, 1)

        data = {
            "team": TeamMinSerializer(team).data,
            "total_matches": total_matches,
            "wins": wins,
            "losses": losses,
            "win_rate": round((wins / total_matches) * 100, 1),
            "avg_kills": round(aggregates["avg_kills"] or 0, 1),
            "avg_deaths": round(aggregates["avg_deaths"] or 0, 1),
            "avg_assists": round(aggregates["avg_assists"] or 0, 1),
            "avg_gold": round(aggregates["avg_gold"] or 0, 1),
            "avg_dragons": round(aggregates["avg_dragons"] or 0, 1),
            "avg_barons": round(aggregates["avg_barons"] or 0, 1),
            "avg_towers": round(aggregates["avg_towers"] or 0, 1),
            "avg_heralds": round(aggregates["avg_heralds"] or 0, 1),
            "avg_voidgrubs": round(aggregates["avg_voidgrubs"] or 0, 1),
            "avg_inhibitors": round(aggregates["avg_inhibitors"] or 0, 1),
            "first_blood_rate": _safe_rate(aggregates["first_blood_count"], total_matches),
            "first_dragon_rate": _safe_rate(aggregates["first_dragon_count"], total_matches),
            "first_herald_rate": _safe_rate(aggregates["first_herald_count"], total_matches),
            "first_baron_rate": _safe_rate(aggregates["first_baron_count"], total_matches),
            "first_tower_rate": _safe_rate(aggregates["first_tower_count"], total_matches),
            "first_inhibitor_rate": _safe_rate(aggregates["first_inhibitor_count"], total_matches),
            "kills_over_25_rate": _safe_rate(kills_over_25, total_matches),
            "towers_over_10_rate": _safe_rate(towers_over_10, total_matches),
            "avg_golddiffat10": round(aggregates["avg_golddiffat10"] or 0, 1),
            "avg_golddiffat15": round(aggregates["avg_golddiffat15"] or 0, 1),
            "avg_xpdiffat10": round(aggregates["avg_xpdiffat10"] or 0, 1),
            "avg_xpdiffat15": round(aggregates["avg_xpdiffat15"] or 0, 1),
            "blue_wins": blue_wins,
            "blue_total": blue_total,
            "blue_win_rate": round((blue_wins / blue_total) * 100, 1) if blue_total else 0.0,
            "red_wins": red_wins,
            "red_total": red_total,
            "red_win_rate": round((red_wins / red_total) * 100, 1) if red_total else 0.0,
            "avg_game_length": round(avg_game_length, 1) if avg_game_length else None,
            "form_last5": form_last5,
            "form_last10": form_last10,
        }

        return Response(data)

    @action(detail=True, methods=["get"], url_path="matches")
    def matches(self, request, pk=None):
        """Return paginated match history for a specific team."""
        team = self.get_object()
        matches = Match.objects.filter(
            Q(blue_team=team) | Q(red_team=team)
        ).select_related("league", "blue_team", "red_team", "winner")
        matches = _apply_match_filters_on_match(matches, request.query_params)
        matches = matches.order_by("-date")

        page = self.paginate_queryset(matches)
        if page is not None:
            serializer = MatchListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = MatchListSerializer(matches, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], url_path="objectives")
    def objectives(self, request, pk=None):
        """Return objective averages and first objective rates for a team."""
        team = self.get_object()
        team_stats = TeamMatchStats.objects.filter(team=team).select_related("match")
        team_stats = _apply_match_filters(team_stats, request.query_params)

        total_matches = team_stats.count()
        if total_matches == 0:
            return Response(
                {
                    "team": TeamMinSerializer(team).data,
                    "total_matches": 0,
                    "message": "No matches found for the given filters.",
                }
            )

        aggregates = team_stats.aggregate(
            avg_dragons=Avg("dragons"),
            avg_barons=Avg("barons"),
            avg_towers=Avg("towers"),
            avg_heralds=Avg("heralds"),
            avg_voidgrubs=Avg("voidgrubs"),
            avg_inhibitors=Avg("inhibitors"),
            first_blood_count=Sum(Cast("first_blood", IntegerField())),
            first_dragon_count=Sum(Cast("first_dragon", IntegerField())),
            first_herald_count=Sum(Cast("first_herald", IntegerField())),
            first_baron_count=Sum(Cast("first_baron", IntegerField())),
            first_tower_count=Sum(Cast("first_tower", IntegerField())),
            first_inhibitor_count=Sum(Cast("first_inhibitor", IntegerField())),
        )

        def _safe_rate(count, total):
            """Calculate percentage rate safely."""
            if not count or total == 0:
                return 0.0
            return round((count / total) * 100, 1)

        data = {
            "team": TeamMinSerializer(team).data,
            "total_matches": total_matches,
            "avg_dragons": round(aggregates["avg_dragons"] or 0, 1),
            "avg_barons": round(aggregates["avg_barons"] or 0, 1),
            "avg_towers": round(aggregates["avg_towers"] or 0, 1),
            "avg_heralds": round(aggregates["avg_heralds"] or 0, 1),
            "avg_voidgrubs": round(aggregates["avg_voidgrubs"] or 0, 1),
            "avg_inhibitors": round(aggregates["avg_inhibitors"] or 0, 1),
            "first_blood_rate": _safe_rate(aggregates["first_blood_count"], total_matches),
            "first_dragon_rate": _safe_rate(aggregates["first_dragon_count"], total_matches),
            "first_herald_rate": _safe_rate(aggregates["first_herald_count"], total_matches),
            "first_baron_rate": _safe_rate(aggregates["first_baron_count"], total_matches),
            "first_tower_rate": _safe_rate(aggregates["first_tower_count"], total_matches),
            "first_inhibitor_rate": _safe_rate(aggregates["first_inhibitor_count"], total_matches),
        }

        return Response(data)


class MatchViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing and retrieving matches."""

    queryset = Match.objects.select_related(
        "league", "blue_team", "red_team", "winner"
    )
    permission_classes = [AllowAny]
    filterset_fields = ["league", "year", "split", "playoffs"]
    search_fields = ["gameid", "blue_team__name", "red_team__name"]
    ordering_fields = ["date", "game_length", "year"]
    ordering = ["-date"]

    def get_serializer_class(self):
        """Return detail serializer for retrieve action, list serializer otherwise."""
        if self.action == "retrieve":
            return MatchDetailSerializer
        return MatchListSerializer

    def get_queryset(self):
        """Prefetch related stats for detail view."""
        queryset = super().get_queryset()
        if self.action == "retrieve":
            queryset = queryset.prefetch_related(
                "team_stats",
                "team_stats__team",
                "player_stats",
                "player_stats__player",
                "player_stats__team",
            )
        return queryset


class PlayerViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing and retrieving players."""

    queryset = Player.objects.select_related("team")
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]
    search_fields = ["name"]
    filterset_fields = ["position", "team"]


class CompareView(APIView):
    """API view for comprehensive team comparison across multiple data ranges."""

    permission_classes = [AllowAny]

    def _compute_rates(self, qs, team):
        """Compute aggregate rates and averages from a TeamMatchStats queryset.

        Args:
            qs: TeamMatchStats queryset filtered to a specific team.
            team: The Team instance (needed for most_kills computation).

        Returns:
            Dict with total, rates, and averages.
        """
        total = qs.count()
        if total == 0:
            return {
                "total": 0,
                "wins": 0,
                "losses": 0,
                "win_rate": 0.0,
                "first_blood_rate": 0.0,
                "first_tower_rate": 0.0,
                "first_dragon_rate": 0.0,
                "first_herald_rate": 0.0,
                "first_baron_rate": 0.0,
                "first_inhibitor_rate": 0.0,
                "most_kills_rate": 0.0,
                "avg_kills": 0.0,
                "avg_towers": 0.0,
                "avg_dragons": 0.0,
                "avg_barons": 0.0,
                "avg_inhibitors": 0.0,
                "avg_game_length": None,
            }

        wins = qs.filter(is_winner=True).count()
        agg = qs.aggregate(
            first_blood_count=Sum(Cast("first_blood", IntegerField())),
            first_tower_count=Sum(Cast("first_tower", IntegerField())),
            first_dragon_count=Sum(Cast("first_dragon", IntegerField())),
            first_herald_count=Sum(Cast("first_herald", IntegerField())),
            first_baron_count=Sum(Cast("first_baron", IntegerField())),
            first_inhibitor_count=Sum(Cast("first_inhibitor", IntegerField())),
            avg_kills=Avg("kills"),
            avg_towers=Avg("towers"),
            avg_dragons=Avg("dragons"),
            avg_barons=Avg("barons"),
            avg_inhibitors=Avg("inhibitors"),
        )

        match_ids = list(qs.values_list("match_id", flat=True))

        # Average game length
        avg_gl = Match.objects.filter(id__in=match_ids).aggregate(
            avg=Avg("game_length")
        )["avg"]

        # Most kills rate: % of matches where team had more kills than opponent
        all_match_stats = (
            TeamMatchStats.objects.filter(match_id__in=match_ids)
            .values("match_id", "team_id", "kills")
        )
        kills_by_match = defaultdict(dict)
        for s in all_match_stats:
            kills_by_match[s["match_id"]][s["team_id"]] = s["kills"]

        most_kills_count = 0
        for mid, teams_data in kills_by_match.items():
            team_k = teams_data.get(team.id, 0)
            opp_k = sum(v for tid, v in teams_data.items() if tid != team.id)
            if team_k > opp_k:
                most_kills_count += 1

        def _rate(count):
            if not count:
                return 0.0
            return round((count / total) * 100, 1)

        return {
            "total": total,
            "wins": wins,
            "losses": total - wins,
            "win_rate": round((wins / total) * 100, 1),
            "first_blood_rate": _rate(agg["first_blood_count"]),
            "first_tower_rate": _rate(agg["first_tower_count"]),
            "first_dragon_rate": _rate(agg["first_dragon_count"]),
            "first_herald_rate": _rate(agg["first_herald_count"]),
            "first_baron_rate": _rate(agg["first_baron_count"]),
            "first_inhibitor_rate": _rate(agg["first_inhibitor_count"]),
            "most_kills_rate": _rate(most_kills_count),
            "avg_kills": round(agg["avg_kills"] or 0, 1),
            "avg_towers": round(agg["avg_towers"] or 0, 1),
            "avg_dragons": round(agg["avg_dragons"] or 0, 1),
            "avg_barons": round(agg["avg_barons"] or 0, 1),
            "avg_inhibitors": round(agg["avg_inhibitors"] or 0, 1),
            "avg_game_length": round(avg_gl, 1) if avg_gl else None,
        }

    def _build_match_detail(self, stat, match, opponent_name, opp_stat):
        """Build per-match detail dict from a TeamMatchStats instance."""
        most_kills = stat.kills > (opp_stat.kills if opp_stat else 0)
        return {
            "match_id": match.id,
            "date": match.date.isoformat() if match.date else None,
            "opponent": opponent_name,
            "is_winner": stat.is_winner,
            "first_blood": stat.first_blood,
            "first_tower": stat.first_tower,
            "first_dragon": stat.first_dragon,
            "first_herald": stat.first_herald,
            "first_baron": stat.first_baron,
            "first_inhibitor": stat.first_inhibitor,
            "most_kills": most_kills,
            "kills": stat.kills,
            "towers": stat.towers,
            "dragons": stat.dragons,
            "barons": stat.barons,
            "inhibitors": stat.inhibitors,
            "game_length": match.game_length,
        }

    def _build_recent(self, team, year):
        """Build recent form data for a team.

        Returns last5/last10 aggregate rates and per-match details.
        """
        recent_qs = (
            TeamMatchStats.objects.filter(team=team, match__year=year)
            .select_related(
                "match", "match__blue_team", "match__red_team", "match__league"
            )
            .order_by("-match__date")
        )

        last10_list = list(recent_qs[:10])
        last5_list = last10_list[:5]

        # Compute aggregate rates
        last5_ids = [s.id for s in last5_list]
        last10_ids = [s.id for s in last10_list]

        last5_stats = self._compute_rates(
            TeamMatchStats.objects.filter(id__in=last5_ids), team
        )
        last10_stats = self._compute_rates(
            TeamMatchStats.objects.filter(id__in=last10_ids), team
        )

        # Pre-fetch opponent stats for all recent matches
        last10_match_ids = [s.match_id for s in last10_list]
        opp_stats_qs = (
            TeamMatchStats.objects.filter(match_id__in=last10_match_ids)
            .exclude(team=team)
        )
        opp_stats_map = {s.match_id: s for s in opp_stats_qs}

        # Per-match details
        matches = []
        for stat in last10_list:
            match = stat.match
            opponent = (
                match.red_team
                if match.blue_team_id == team.id
                else match.blue_team
            )
            opp_stat = opp_stats_map.get(stat.match_id)
            matches.append(
                self._build_match_detail(stat, match, opponent.name, opp_stat)
            )

        return {
            "last5": last5_stats,
            "last10": last10_stats,
            "matches": matches,
        }

    def get(self, request):
        """Compare two teams across overall, recent form, and past faceoffs.

        Query params:
            team1: ID of the first team (required).
            team2: ID of the second team (required).
            year: Optional year filter (defaults to most recent year).
            split: Optional split filter (defaults to most recent split).
        """
        team1_id = request.query_params.get("team1")
        team2_id = request.query_params.get("team2")

        if not team1_id or not team2_id:
            return Response(
                {"error": "Both 'team1' and 'team2' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            team1 = Team.objects.get(pk=team1_id)
            team2 = Team.objects.get(pk=team2_id)
        except Team.DoesNotExist:
            return Response(
                {"error": "One or both teams not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Determine year and split
        year = request.query_params.get("year")
        split = request.query_params.get("split")

        if not year:
            latest = (
                Match.objects.order_by("-year")
                .values_list("year", flat=True)
                .first()
            )
            year = latest or 2025
        else:
            year = int(year)

        if not split:
            latest_split = (
                Match.objects.filter(year=year)
                .exclude(split="")
                .order_by("-date")
                .values_list("split", flat=True)
                .first()
            )
            split = latest_split or ""

        # ---- OVERALL ----
        # Split scope
        t1_split_qs = TeamMatchStats.objects.filter(
            team=team1, match__year=year
        )
        t2_split_qs = TeamMatchStats.objects.filter(
            team=team2, match__year=year
        )
        if split:
            t1_split_qs = t1_split_qs.filter(match__split__iexact=split)
            t2_split_qs = t2_split_qs.filter(match__split__iexact=split)

        # Season scope (full year)
        t1_season_qs = TeamMatchStats.objects.filter(
            team=team1, match__year=year
        )
        t2_season_qs = TeamMatchStats.objects.filter(
            team=team2, match__year=year
        )

        overall = {
            "split": {
                "label": f"{split} {year}" if split else str(year),
                "team1": self._compute_rates(t1_split_qs, team1),
                "team2": self._compute_rates(t2_split_qs, team2),
            },
            "season": {
                "label": str(year),
                "team1": self._compute_rates(t1_season_qs, team1),
                "team2": self._compute_rates(t2_season_qs, team2),
            },
        }

        # ---- RECENT FORM ----
        recent = {
            "team1": self._build_recent(team1, year),
            "team2": self._build_recent(team2, year),
        }

        # ---- PAST FACEOFFS ----
        h2h_matches = (
            Match.objects.filter(
                (Q(blue_team=team1) & Q(red_team=team2))
                | (Q(blue_team=team2) & Q(red_team=team1))
            )
            .select_related("blue_team", "red_team", "winner", "league")
            .order_by("-date")
        )

        h2h_match_ids = list(h2h_matches.values_list("id", flat=True))

        t1_h2h_qs = TeamMatchStats.objects.filter(
            match_id__in=h2h_match_ids, team=team1
        )
        t2_h2h_qs = TeamMatchStats.objects.filter(
            match_id__in=h2h_match_ids, team=team2
        )

        # Pre-fetch all stats for faceoff matches
        all_h2h_stats = TeamMatchStats.objects.filter(
            match_id__in=h2h_match_ids
        ).select_related("team")
        stats_by_match = defaultdict(dict)
        for s in all_h2h_stats:
            stats_by_match[s.match_id][s.team_id] = s

        faceoff_matches = []
        for match in h2h_matches:
            t1_stat = stats_by_match.get(match.id, {}).get(team1.id)
            t2_stat = stats_by_match.get(match.id, {}).get(team2.id)
            if t1_stat and t2_stat:
                t1_most_kills = t1_stat.kills > t2_stat.kills
                t2_most_kills = t2_stat.kills > t1_stat.kills
                faceoff_matches.append(
                    {
                        "match_id": match.id,
                        "date": match.date.isoformat() if match.date else None,
                        "league": match.league.name if match.league else "",
                        "team1": {
                            "is_winner": t1_stat.is_winner,
                            "first_blood": t1_stat.first_blood,
                            "first_tower": t1_stat.first_tower,
                            "first_dragon": t1_stat.first_dragon,
                            "first_herald": t1_stat.first_herald,
                            "first_baron": t1_stat.first_baron,
                            "first_inhibitor": t1_stat.first_inhibitor,
                            "most_kills": t1_most_kills,
                            "kills": t1_stat.kills,
                            "towers": t1_stat.towers,
                            "dragons": t1_stat.dragons,
                            "barons": t1_stat.barons,
                            "inhibitors": t1_stat.inhibitors,
                            "game_length": match.game_length,
                        },
                        "team2": {
                            "is_winner": t2_stat.is_winner,
                            "first_blood": t2_stat.first_blood,
                            "first_tower": t2_stat.first_tower,
                            "first_dragon": t2_stat.first_dragon,
                            "first_herald": t2_stat.first_herald,
                            "first_baron": t2_stat.first_baron,
                            "first_inhibitor": t2_stat.first_inhibitor,
                            "most_kills": t2_most_kills,
                            "kills": t2_stat.kills,
                            "towers": t2_stat.towers,
                            "dragons": t2_stat.dragons,
                            "barons": t2_stat.barons,
                            "inhibitors": t2_stat.inhibitors,
                            "game_length": match.game_length,
                        },
                    }
                )

        faceoffs = {
            "total": len(h2h_match_ids),
            "team1_wins": h2h_matches.filter(winner=team1).count(),
            "team2_wins": h2h_matches.filter(winner=team2).count(),
            "team1": self._compute_rates(t1_h2h_qs, team1),
            "team2": self._compute_rates(t2_h2h_qs, team2),
            "matches": faceoff_matches,
        }

        data = {
            "team1_info": TeamMinSerializer(team1).data,
            "team2_info": TeamMinSerializer(team2).data,
            "year": year,
            "split": split,
            "overall": overall,
            "recent": recent,
            "faceoffs": faceoffs,
        }

        return Response(data)


class DashboardView(APIView):
    """API view returning dashboard overview data."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Return dashboard summary statistics.

        Query params:
            year: Optional year filter for matches.
        """
        year = request.query_params.get("year")

        match_qs = Match.objects.all()
        if year:
            match_qs = match_qs.filter(year=year)

        total_matches = match_qs.count()
        total_teams = Team.objects.count()
        total_players = Player.objects.count()
        total_leagues = League.objects.count()

        # Recent matches
        recent_matches = (
            match_qs.select_related("league", "blue_team", "red_team", "winner")
            .order_by("-date")[:10]
        )
        recent_serializer = MatchListSerializer(recent_matches, many=True)

        # Top teams by win rate (minimum 10 matches)
        team_stats_qs = TeamMatchStats.objects.all()
        if year:
            team_stats_qs = team_stats_qs.filter(match__year=year)

        team_aggregates = (
            team_stats_qs.values("team__id", "team__name", "team__short_name")
            .annotate(
                total_matches=Count("id"),
                wins=Count("id", filter=Q(is_winner=True)),
            )
            .filter(total_matches__gte=10)
        )

        top_teams = []
        for entry in team_aggregates:
            win_rate = round((entry["wins"] / entry["total_matches"]) * 100, 1)
            top_teams.append(
                {
                    "id": entry["team__id"],
                    "name": entry["team__name"],
                    "short_name": entry["team__short_name"],
                    "total_matches": entry["total_matches"],
                    "wins": entry["wins"],
                    "win_rate": win_rate,
                }
            )
        top_teams.sort(key=lambda x: x["win_rate"], reverse=True)
        top_teams = top_teams[:10]

        # Side stats
        side_stats_qs = team_stats_qs.filter(is_winner=True)
        blue_wins = side_stats_qs.filter(side="Blue").count()
        red_wins = side_stats_qs.filter(side="Red").count()

        # League distribution
        league_distribution = (
            match_qs.values("league__name")
            .annotate(match_count=Count("id"))
            .order_by("-match_count")
        )
        league_dist_list = [
            {
                "league_name": entry["league__name"],
                "match_count": entry["match_count"],
            }
            for entry in league_distribution
        ]

        data = {
            "total_matches": total_matches,
            "total_teams": total_teams,
            "total_players": total_players,
            "total_leagues": total_leagues,
            "recent_matches": recent_serializer.data,
            "top_teams": top_teams,
            "side_stats": {
                "blue_wins": blue_wins,
                "red_wins": red_wins,
                "total": blue_wins + red_wins,
            },
            "league_distribution": league_dist_list,
        }

        return Response(data)


class StandingsView(APIView):
    """API view returning team standings grouped by league."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Return team standings grouped by league.

        Query params:
            year: Optional year filter.
            split: Optional split filter.
            search: Optional team name search.
            league: Optional league ID filter.
        """
        year = request.query_params.get("year")
        split = request.query_params.get("split")
        search = request.query_params.get("search")
        league_id = request.query_params.get("league")

        qs = TeamMatchStats.objects.select_related("match__league", "team")

        if year:
            qs = qs.filter(match__year=year)
        if split:
            qs = qs.filter(match__split__iexact=split)
        if league_id:
            qs = qs.filter(match__league_id=league_id)

        standings_qs = (
            qs.values(
                "match__league__id",
                "match__league__name",
                "team__id",
                "team__name",
                "team__short_name",
            )
            .annotate(
                total_matches=Count("id"),
                wins=Count("id", filter=Q(is_winner=True)),
            )
            .filter(total_matches__gte=1)
        )

        leagues_map = {}
        for entry in standings_qs:
            lid = entry["match__league__id"]
            lname = entry["match__league__name"]

            if lid not in leagues_map:
                leagues_map[lid] = {
                    "league": {"id": lid, "name": lname},
                    "teams": [],
                }

            total = entry["total_matches"]
            wins_count = entry["wins"]
            losses = total - wins_count
            win_rate = round((wins_count / total) * 100, 1) if total > 0 else 0.0

            team_name = entry["team__name"]
            if search:
                search_lower = search.lower()
                team_short = entry["team__short_name"] or ""
                if (
                    search_lower not in team_name.lower()
                    and search_lower not in team_short.lower()
                ):
                    continue

            leagues_map[lid]["teams"].append(
                {
                    "id": entry["team__id"],
                    "name": team_name,
                    "short_name": entry["team__short_name"],
                    "total_matches": total,
                    "wins": wins_count,
                    "losses": losses,
                    "win_rate": win_rate,
                }
            )

        result = []
        for league_data in leagues_map.values():
            league_data["teams"].sort(key=lambda x: (-x["win_rate"], -x["wins"]))
            if league_data["teams"]:
                result.append(league_data)

        result.sort(key=lambda x: -len(x["teams"]))

        return Response(result)


class ImportView(APIView):
    """API view to trigger data import from Oracle's Elixir."""

    permission_classes = [AllowAny]

    def post(self, request):
        """Trigger a data import for a given year.

        Request body:
            year (int): The year to import data for.
            download (bool): Whether to download the CSV file. Defaults to True.
        """
        year = request.data.get("year")
        if not year:
            return Response(
                {"error": "'year' field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year = int(year)
        except (TypeError, ValueError):
            return Response(
                {"error": "'year' must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        download = request.data.get("download", True)
        if isinstance(download, str):
            download = download.lower() in ("true", "1", "yes")

        try:
            args = [str(year)]
            if not download:
                args.append("--no-download")
            call_command("import_oracle_data", *args)
        except Exception as e:
            return Response(
                {"error": f"Import failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Fetch the most recent import log for this year
        import_log = (
            DataImportLog.objects.filter(year=year).order_by("-started_at").first()
        )

        if import_log:
            serializer = DataImportLogSerializer(import_log)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(
            {"message": f"Import for year {year} completed but no log entry was found."},
            status=status.HTTP_200_OK,
        )


class FilterOptionsView(APIView):
    """API view returning available filter values (years, leagues, splits)."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Return distinct years, leagues, and splits available in match data.

        Cascading logic:
        - years: always all distinct years
        - leagues: filtered by year (if provided)
        - splits: filtered by year and league (if provided)
        """
        year = request.query_params.get("year")
        league_id = request.query_params.get("league")

        # Years: always return all
        years = sorted(
            Match.objects.values_list("year", flat=True).distinct(), reverse=True
        )

        # Leagues: scoped to year if provided
        league_qs = Match.objects.all()
        if year:
            league_qs = league_qs.filter(year=int(year))
        league_ids = league_qs.values_list("league_id", flat=True).distinct()
        leagues = list(
            League.objects.filter(id__in=league_ids).values("id", "name").order_by("name")
        )

        # Splits: scoped to year + league if provided
        split_qs = Match.objects.all()
        if year:
            split_qs = split_qs.filter(year=int(year))
        if league_id:
            split_qs = split_qs.filter(league_id=int(league_id))
        splits = sorted(
            split_qs.exclude(split="").values_list("split", flat=True).distinct()
        )

        return Response({"years": years, "leagues": leagues, "splits": splits})


class PredictView(APIView):
    """API view to predict the outcome of a match between two teams."""

    permission_classes = [AllowAny]

    def get(self, request):
        """Return predictions for a matchup between two teams.

        Query params:
            team1 (int): ID of the first team (required).
            team2 (int): ID of the second team (required).
        """
        from .prediction import predict_match

        team1_id = request.query_params.get("team1")
        team2_id = request.query_params.get("team2")

        if not team1_id or not team2_id:
            return Response(
                {"error": "Both 'team1' and 'team2' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            team1_id = int(team1_id)
            team2_id = int(team2_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "'team1' and 'team2' must be valid integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = predict_match(team1_id, team2_id)

        if "error" in result:
            return Response(result, status=status.HTTP_404_NOT_FOUND)

        return Response(result)
