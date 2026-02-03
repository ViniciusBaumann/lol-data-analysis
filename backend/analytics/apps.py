import logging
import os
import threading
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AnalyticsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "analytics"
    verbose_name = "Analytics LoL"

    def ready(self):
        """Called when Django starts. Trigger auto-update and scheduler if enabled."""
        # Only run in the main process (not in management commands or migrations)
        # Check RUN_MAIN to avoid running twice with auto-reloader
        if os.environ.get("RUN_MAIN") != "true":
            return

        # Check if auto-update is enabled (default: enabled)
        auto_update = os.environ.get("AUTO_UPDATE_ORACLE_DATA", "true").lower()
        if auto_update not in ("true", "1", "yes"):
            logger.info("Oracle data auto-update disabled (AUTO_UPDATE_ORACLE_DATA=%s)", auto_update)
            return

        # Run the update in a background thread to not block server startup
        thread = threading.Thread(target=self._run_auto_update, daemon=True)
        thread.start()
        logger.info("Started Oracle data auto-update background thread")

        # Start the scheduler for periodic updates (01:00 and 13:00 Sao Paulo time)
        scheduler_enabled = os.environ.get("ENABLE_SCHEDULER", "true").lower()
        if scheduler_enabled in ("true", "1", "yes"):
            self._start_scheduler()
        else:
            logger.info("Scheduler disabled (ENABLE_SCHEDULER=%s)", scheduler_enabled)

    def _run_auto_update(self):
        """Download and import the latest Oracle's Elixir data."""
        import time
        from pathlib import Path

        # Wait a bit for Django to fully initialize
        time.sleep(3)

        try:
            from analytics.auto_update import auto_update_oracle_data
            auto_update_oracle_data()
        except Exception as e:
            logger.exception("Auto-update failed: %s", e)

    def _start_scheduler(self):
        """Start the APScheduler for periodic data updates."""
        try:
            from analytics.scheduler import start_scheduler
            start_scheduler()
            logger.info("Scheduler started: updates at 01:00 and 13:00 (Sao Paulo time)")
        except Exception as e:
            logger.exception("Failed to start scheduler: %s", e)
