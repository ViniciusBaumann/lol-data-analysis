"""Management command to run data reconciliation and quality checks.

Usage examples:
    # Run all checks
    python manage.py reconcile_data

    # Run only reconciliation (consistency) checks
    python manage.py reconcile_data --only reconciliation

    # Run only quality checks
    python manage.py reconcile_data --only quality

    # Verbose output with details
    python manage.py reconcile_data --verbose
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandParser

from analytics.etl.pipeline import run_reconciliation
from analytics.etl.quality import run_all_quality_checks
from analytics.etl.reconciliation import run_all_reconciliation_checks


class Command(BaseCommand):
    help = "Run data reconciliation and quality checks."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--only",
            choices=["reconciliation", "quality"],
            default=None,
            help="Run only a specific category of checks.",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            default=False,
            help="Show detailed output including check details.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        only = options["only"]
        verbose = options["verbose"]

        if only is None:
            # Run full reconciliation with persistence
            self.stdout.write("Running full reconciliation and quality checks...\n")
            log = run_reconciliation(triggered_by="manual")

            self.stdout.write(f"\nStatus: {log.get_status_display()}")
            self.stdout.write(f"Total checks: {log.total_checks}")
            self.stdout.write(
                self.style.SUCCESS(f"  Passed : {log.passed_checks}")
            )
            if log.warning_checks:
                self.stdout.write(
                    self.style.WARNING(f"  Warnings: {log.warning_checks}")
                )
            if log.failed_checks:
                self.stdout.write(
                    self.style.ERROR(f"  Failed : {log.failed_checks}")
                )

            if verbose:
                self._print_details(log.results.get("reconciliation", []))
                self._print_details(log.results.get("quality", []))
            else:
                self._print_summary(log.results.get("reconciliation", []))
                self._print_summary(log.results.get("quality", []))

        elif only == "reconciliation":
            self.stdout.write("Running reconciliation checks...\n")
            results = run_all_reconciliation_checks()
            if verbose:
                self._print_details(results)
            else:
                self._print_summary(results)

        elif only == "quality":
            self.stdout.write("Running quality checks...\n")
            results = run_all_quality_checks()
            if verbose:
                self._print_details(results)
            else:
                self._print_summary(results)

    def _print_summary(self, results: list[dict]) -> None:
        for r in results:
            status = r["status"]
            name = r["name"]
            msg = r["message"]
            if status == "passed":
                self.stdout.write(f"  {self.style.SUCCESS('PASS')} {name}: {msg}")
            elif status == "warning":
                self.stdout.write(f"  {self.style.WARNING('WARN')} {name}: {msg}")
            else:
                self.stdout.write(f"  {self.style.ERROR('FAIL')} {name}: {msg}")

    def _print_details(self, results: list[dict]) -> None:
        for r in results:
            status = r["status"]
            name = r["name"]
            msg = r["message"]

            if status == "passed":
                self.stdout.write(f"\n  {self.style.SUCCESS('PASS')} {name}")
            elif status == "warning":
                self.stdout.write(f"\n  {self.style.WARNING('WARN')} {name}")
            else:
                self.stdout.write(f"\n  {self.style.ERROR('FAIL')} {name}")

            self.stdout.write(f"    {msg}")

            details = r.get("details")
            if details:
                import json
                detail_str = json.dumps(details, indent=4, default=str, ensure_ascii=False)
                for line in detail_str.split("\n"):
                    self.stdout.write(f"    {line}")
