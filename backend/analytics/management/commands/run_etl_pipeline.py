"""Management command to run the full ETL pipeline.

Orchestrates: Import -> ELO -> Train (optional) -> Reconcile

Usage examples:
    # Run import + elo + reconciliation (default)
    python manage.py run_etl_pipeline --year 2025

    # Full pipeline with model training
    python manage.py run_etl_pipeline --year 2025 --train --train-draft

    # With hyperparameter tuning (slow)
    python manage.py run_etl_pipeline --year 2025 --train --tuning

    # Skip reconciliation
    python manage.py run_etl_pipeline --year 2025 --no-reconcile

    # Force re-download and filter leagues
    python manage.py run_etl_pipeline --year 2025 --force --leagues LCK LPL
"""

from __future__ import annotations

import json
from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from analytics.etl.pipeline import run_etl_pipeline


class Command(BaseCommand):
    help = "Run the full ETL pipeline: Import -> ELO -> Train -> Reconcile."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--year",
            type=int,
            default=None,
            help="Year to import (default: current year).",
        )
        parser.add_argument(
            "--train",
            action="store_true",
            default=False,
            help="Train the match prediction model after import.",
        )
        parser.add_argument(
            "--train-draft",
            action="store_true",
            default=False,
            help="Train the draft prediction model after import.",
        )
        parser.add_argument(
            "--tuning",
            action="store_true",
            default=False,
            help="Enable hyperparameter tuning during training (slow).",
        )
        parser.add_argument(
            "--no-reconcile",
            action="store_true",
            default=False,
            help="Skip reconciliation checks after pipeline.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            default=False,
            help="Force re-download of CSV data.",
        )
        parser.add_argument(
            "--leagues",
            nargs="*",
            default=None,
            help="Filter by specific leagues.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write(self.style.MIGRATE_HEADING("Starting ETL Pipeline"))
        self.stdout.write("")

        results = run_etl_pipeline(
            year=options["year"],
            train=options["train"],
            train_draft=options["train_draft"],
            no_tuning=not options["tuning"],
            reconcile=not options["no_reconcile"],
            force_download=options["force"],
            leagues=options["leagues"],
        )

        # Print results
        self.stdout.write("")
        self.stdout.write("=" * 60)
        self.stdout.write(self.style.MIGRATE_HEADING("Pipeline Results"))
        self.stdout.write("=" * 60)

        for stage_name, stage_info in results.get("stages", {}).items():
            status = stage_info.get("status", "unknown")
            duration = stage_info.get("duration_s", 0)

            if status in ("success", "healthy"):
                icon = self.style.SUCCESS("OK")
            elif status in ("warnings", "partial_failure"):
                icon = self.style.WARNING("WARN")
            else:
                icon = self.style.ERROR("FAIL")

            self.stdout.write(f"  {icon} {stage_name:25s} ({duration:.1f}s)")

            # Show reconciliation summary if present
            if stage_name == "reconciliation" and "total_checks" in stage_info:
                self.stdout.write(
                    f"       {stage_info['passed']}/{stage_info['total_checks']} passed, "
                    f"{stage_info['warnings']} warnings, "
                    f"{stage_info['failed']} failed"
                )

        self.stdout.write("")
        final = results.get("final_status", "unknown")
        total_time = results.get("total_duration_s", 0)

        if final == "success":
            self.stdout.write(
                self.style.SUCCESS(f"Pipeline concluido com sucesso em {total_time:.1f}s.")
            )
        elif final == "partial_failure":
            self.stdout.write(
                self.style.WARNING(
                    f"Pipeline concluido com falhas parciais em {total_time:.1f}s. "
                    f"Estagios com falha: {', '.join(results.get('failed_stages', []))}"
                )
            )
        else:
            self.stdout.write(
                self.style.ERROR(f"Pipeline falhou em {total_time:.1f}s.")
            )
