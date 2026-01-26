from rest_framework import serializers

from .models import (
    DataImportLog,
    League,
    Match,
    Player,
    PlayerMatchStats,
    Team,
    TeamMatchStats,
)


class LeagueSerializer(serializers.ModelSerializer):
    """Serializer for League model with all fields."""

    total_matches = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = League
        fields = "__all__"


class TeamMinSerializer(serializers.ModelSerializer):
    """Minimal team serializer for nested representations."""

    class Meta:
        model = Team
        fields = ["id", "name", "short_name"]


class PlayerSerializer(serializers.ModelSerializer):
    """Serializer for Player model."""

    class Meta:
        model = Player
        fields = ["id", "name", "oe_playerid", "position", "team", "created_at"]


class TeamListSerializer(serializers.ModelSerializer):
    """Serializer for Team list view with computed stats."""

    leagues = LeagueSerializer(many=True, read_only=True)
    total_matches = serializers.SerializerMethodField()
    win_rate = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "slug",
            "short_name",
            "oe_teamid",
            "leagues",
            "created_at",
            "total_matches",
            "win_rate",
        ]

    def get_total_matches(self, obj: Team) -> int:
        """Return total number of matches this team has played."""
        return obj.match_stats.count()

    def get_win_rate(self, obj: Team) -> float:
        """Return win rate as a percentage rounded to 1 decimal place."""
        total = obj.match_stats.count()
        if total == 0:
            return 0.0
        wins = obj.match_stats.filter(is_winner=True).count()
        return round((wins / total) * 100, 1)


class TeamDetailSerializer(TeamListSerializer):
    """Serializer for Team detail view, includes nested players."""

    players = PlayerSerializer(many=True, read_only=True)

    class Meta(TeamListSerializer.Meta):
        fields = TeamListSerializer.Meta.fields + ["players"]


class TeamMatchStatsSerializer(serializers.ModelSerializer):
    """Serializer for TeamMatchStats with team name."""

    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = TeamMatchStats
        fields = "__all__"

    def to_representation(self, instance: TeamMatchStats) -> dict:
        """Add team_name to the representation."""
        data = super().to_representation(instance)
        data["team_name"] = instance.team.name
        return data


class PlayerMatchStatsSerializer(serializers.ModelSerializer):
    """Serializer for PlayerMatchStats with player and team names."""

    player_name = serializers.CharField(source="player.name", read_only=True)
    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = PlayerMatchStats
        fields = "__all__"


class MatchListSerializer(serializers.ModelSerializer):
    """Serializer for Match list view with nested team and league info."""

    league = LeagueSerializer(read_only=True)
    blue_team = TeamMinSerializer(read_only=True)
    red_team = TeamMinSerializer(read_only=True)
    winner = TeamMinSerializer(read_only=True)

    class Meta:
        model = Match
        fields = [
            "id",
            "gameid",
            "league",
            "year",
            "split",
            "patch",
            "date",
            "blue_team",
            "red_team",
            "winner",
            "game_length",
            "playoffs",
        ]


class MatchDetailSerializer(MatchListSerializer):
    """Serializer for Match detail view with full stats."""

    team_stats = TeamMatchStatsSerializer(many=True, read_only=True)
    player_stats = PlayerMatchStatsSerializer(many=True, read_only=True)

    class Meta(MatchListSerializer.Meta):
        fields = MatchListSerializer.Meta.fields + ["team_stats", "player_stats"]


class DataImportLogSerializer(serializers.ModelSerializer):
    """Serializer for DataImportLog model."""

    class Meta:
        model = DataImportLog
        fields = "__all__"
