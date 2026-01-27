"""Management command to calculate ELO ratings per league with side tracking and split decay."""

from collections import defaultdict

from django.core.management.base import BaseCommand

from analytics.models import League, Match, Team, TeamEloRating


class Command(BaseCommand):
    help = "Calculate ELO ratings per league with side tracking and split decay."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete all existing ELO ratings before recalculating.",
        )
        parser.add_argument(
            "--decay-factor",
            type=float,
            default=0.75,
            help="Split decay factor (0-1). Fraction of deviation from 1500 kept across splits. Default: 0.75",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            deleted, _ = TeamEloRating.objects.all().delete()
            self.stdout.write(f"Deleted {deleted} existing ELO ratings.")

        decay_factor = options["decay_factor"]
        self.stdout.write(f"Split decay factor: {decay_factor}")

        matches = (
            Match.objects.filter(winner__isnull=False)
            .select_related("blue_team", "red_team", "winner", "league")
            .order_by("date", "id")
        )
        match_list = list(matches)
        self.stdout.write(f"Processing {len(match_list)} matches...")

        if not match_list:
            self.stderr.write(self.style.WARNING("No matches with a winner found."))
            return

        # In-memory trackers keyed by (team_id, league_id)
        elo: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_blue: dict[tuple, float] = defaultdict(lambda: 1500.0)
        elo_red: dict[tuple, float] = defaultdict(lambda: 1500.0)
        matches_played: dict[tuple, int] = defaultdict(int)
        side_matches_blue: dict[tuple, int] = defaultdict(int)
        side_matches_red: dict[tuple, int] = defaultdict(int)
        last_change: dict[tuple, float] = defaultdict(float)
        last_change_blue: dict[tuple, float] = defaultdict(float)
        last_change_red: dict[tuple, float] = defaultdict(float)
        last_match_date: dict[tuple, object] = {}

        # Split decay tracker: (team_id, league_id) -> (year, split)
        team_last_split: dict[tuple, tuple] = {}

        for match in match_list:
            blue_id = match.blue_team_id
            red_id = match.red_team_id
            league_id = match.league_id
            winner_id = match.winner_id

            blue_key = (blue_id, league_id)
            red_key = (red_id, league_id)

            # 1. Split decay BEFORE reading ELO
            current_split = (match.year, match.split) if match.split else None
            for key in (blue_key, red_key):
                if current_split and key in team_last_split and team_last_split[key] != current_split:
                    elo[key] = 1500.0 + decay_factor * (elo[key] - 1500.0)
                    elo_blue[key] = 1500.0 + decay_factor * (elo_blue[key] - 1500.0)
                    elo_red[key] = 1500.0 + decay_factor * (elo_red[key] - 1500.0)
                if current_split:
                    team_last_split[key] = current_split

            # 2. Global ELO update
            blue_elo_val = elo[blue_key]
            red_elo_val = elo[red_key]

            k_blue = 40 if matches_played[blue_key] < 30 else 32
            k_red = 40 if matches_played[red_key] < 30 else 32

            expected_blue = 1 / (1 + 10 ** ((red_elo_val - blue_elo_val) / 400))
            expected_red = 1 - expected_blue

            if winner_id == blue_id:
                actual_blue = 1.0
                actual_red = 0.0
            else:
                actual_blue = 0.0
                actual_red = 1.0

            delta_blue = k_blue * (actual_blue - expected_blue)
            delta_red = k_red * (actual_red - expected_red)

            elo[blue_key] = blue_elo_val + delta_blue
            elo[red_key] = red_elo_val + delta_red

            last_change[blue_key] = delta_blue
            last_change[red_key] = delta_red

            # 3. Side ELO update — simultaneous read (no asymmetry)
            blue_side_elo = elo_blue[blue_key]
            red_side_elo = elo_red[red_key]

            k_blue_side = 48 if side_matches_blue[blue_key] < 15 else 36
            k_red_side = 48 if side_matches_red[red_key] < 15 else 36

            expected_blue_side = 1 / (1 + 10 ** ((red_side_elo - blue_side_elo) / 400))
            expected_red_side = 1 - expected_blue_side

            delta_blue_side = k_blue_side * (actual_blue - expected_blue_side)
            delta_red_side = k_red_side * (actual_red - expected_red_side)

            # Update BOTH with pre-update values (avoids asymmetry)
            elo_blue[blue_key] = blue_side_elo + delta_blue_side
            elo_red[red_key] = red_side_elo + delta_red_side

            last_change_blue[blue_key] = delta_blue_side
            last_change_red[red_key] = delta_red_side

            side_matches_blue[blue_key] += 1
            side_matches_red[red_key] += 1

            # 4. Counters
            matches_played[blue_key] += 1
            matches_played[red_key] += 1

            if match.date:
                last_match_date[blue_key] = match.date
                last_match_date[red_key] = match.date

        # Bulk save results
        all_keys = set(elo.keys())
        existing = {
            (r.team_id, r.league_id): r
            for r in TeamEloRating.objects.filter(
                team_id__in={k[0] for k in all_keys},
                league_id__in={k[1] for k in all_keys},
            )
        }

        to_create = []
        to_update = []

        for key in all_keys:
            team_id, league_id = key
            data = {
                "elo_rating": round(elo[key], 2),
                "elo_rating_blue": round(elo_blue[key], 2),
                "elo_rating_red": round(elo_red[key], 2),
                "matches_played": matches_played[key],
                "last_change": round(last_change[key], 2),
                "last_change_blue": round(last_change_blue[key], 2),
                "last_change_red": round(last_change_red[key], 2),
                "last_match_date": last_match_date.get(key),
            }

            if key in existing:
                obj = existing[key]
                for attr, val in data.items():
                    setattr(obj, attr, val)
                to_update.append(obj)
            else:
                to_create.append(
                    TeamEloRating(team_id=team_id, league_id=league_id, **data)
                )

        if to_create:
            TeamEloRating.objects.bulk_create(to_create)
        if to_update:
            TeamEloRating.objects.bulk_update(
                to_update,
                [
                    "elo_rating", "elo_rating_blue", "elo_rating_red",
                    "matches_played", "last_change", "last_change_blue",
                    "last_change_red", "last_match_date",
                ],
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"ELO calculated for {len(all_keys)} (team, league) entries "
                f"({len(to_create)} created, {len(to_update)} updated)."
            )
        )

        # Show top 10 per league
        league_names = {
            lg.id: lg.name for lg in League.objects.filter(id__in={k[1] for k in all_keys})
        }
        team_names = {
            t.id: t.name for t in Team.objects.filter(id__in={k[0] for k in all_keys})
        }

        # Group keys by league
        by_league: dict[int, list[tuple]] = defaultdict(list)
        for key in all_keys:
            by_league[key[1]].append(key)

        for league_id, keys in sorted(by_league.items(), key=lambda x: league_names.get(x[0], "")):
            league_name = league_names.get(league_id, f"ID {league_id}")
            top = sorted(keys, key=lambda k: elo[k], reverse=True)[:10]
            self.stdout.write(f"\nTop 10 — {league_name}:")
            for i, key in enumerate(top, 1):
                tid = key[0]
                name = team_names.get(tid, f"ID {tid}")
                self.stdout.write(
                    f"  {i:2d}. {name:30s} ELO={elo[key]:.0f}  "
                    f"Blue={elo_blue[key]:.0f}  Red={elo_red[key]:.0f}  "
                    f"({matches_played[key]} matches, Δ={last_change[key]:+.1f})"
                )
