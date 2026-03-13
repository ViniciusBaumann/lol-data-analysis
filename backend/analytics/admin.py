from django.contrib import admin

from .models import (
    DataImportLog,
    DataReconciliationLog,
    League,
    Match,
    Player,
    PlayerMatchStats,
    Team,
    TeamEloRating,
    TeamMatchStats,
)


@admin.register(League)
class LeagueAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "slug")
    list_filter = ("region",)
    search_fields = ("name",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "short_name", "oe_teamid")
    search_fields = ("name", "short_name")
    prepopulated_fields = {"slug": ("name",)}
    filter_horizontal = ("leagues",)


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("name", "position", "team")
    list_filter = ("position",)
    search_fields = ("name",)
    raw_id_fields = ("team",)


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("gameid", "league", "blue_team", "red_team", "winner", "date", "year")
    list_filter = ("year", "league", "playoffs")
    search_fields = ("gameid",)
    raw_id_fields = ("blue_team", "red_team", "winner")


@admin.register(TeamMatchStats)
class TeamMatchStatsAdmin(admin.ModelAdmin):
    list_display = ("match", "team", "side", "is_winner", "kills", "deaths")
    list_filter = ("is_winner", "side")
    raw_id_fields = ("match", "team")


@admin.register(PlayerMatchStats)
class PlayerMatchStatsAdmin(admin.ModelAdmin):
    list_display = ("match", "player", "champion", "kills", "deaths", "assists")
    list_filter = ("position",)
    search_fields = ("player__name", "champion")
    raw_id_fields = ("match", "player", "team")


@admin.register(TeamEloRating)
class TeamEloRatingAdmin(admin.ModelAdmin):
    list_display = (
        "team", "league", "elo_rating", "elo_rating_blue", "elo_rating_red",
        "matches_played", "last_change", "last_change_blue", "last_change_red",
        "last_match_date",
    )
    list_filter = ("league", "matches_played")
    search_fields = ("team__name", "team__short_name")
    raw_id_fields = ("team", "league")
    ordering = ("-elo_rating",)


@admin.register(DataImportLog)
class DataImportLogAdmin(admin.ModelAdmin):
    list_display = ("year", "status", "matches_created", "started_at")
    list_filter = ("status", "year")
    readonly_fields = ("started_at",)


@admin.register(DataReconciliationLog)
class DataReconciliationLogAdmin(admin.ModelAdmin):
    list_display = (
        "status", "triggered_by", "total_checks", "passed_checks",
        "warning_checks", "failed_checks", "started_at",
    )
    list_filter = ("status", "triggered_by")
    readonly_fields = ("started_at", "results")
