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
        """Called when Django starts. Trigger auto-update if enabled."""
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
