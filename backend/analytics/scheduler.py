"""Scheduler module for periodic data updates.

Configures APScheduler to run the Oracle's Elixir data update
at 01:00 and 13:00 (Sao Paulo timezone) daily.
"""

import logging
import os
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone

logger = logging.getLogger(__name__)

# Timezone for scheduled jobs
SAO_PAULO_TZ = timezone("America/Sao_Paulo")

# Scheduler instance (singleton)
_scheduler = None


def get_scheduler():
    """Get or create the scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = BackgroundScheduler(timezone=SAO_PAULO_TZ)
    return _scheduler


def scheduled_update_job():
    """Job that runs the Oracle's Elixir data update + reconciliation."""
    from analytics.auto_update import auto_update_oracle_data

    logger.info("=" * 60)
    logger.info("Scheduled update started at %s", datetime.now(SAO_PAULO_TZ))
    logger.info("=" * 60)

    try:
        auto_update_oracle_data(force_download=True)
        logger.info("Scheduled update completed successfully")
    except Exception as e:
        logger.exception("Scheduled update failed: %s", e)

    # Run reconciliation after import
    try:
        from analytics.etl.pipeline import run_reconciliation
        log = run_reconciliation(triggered_by="scheduler")
        logger.info(
            "Scheduled reconciliation: %s (%d/%d passed)",
            log.status, log.passed_checks, log.total_checks,
        )
    except Exception as e:
        logger.exception("Scheduled reconciliation failed: %s", e)


def start_scheduler():
    """Start the background scheduler with the update jobs."""
    scheduler = get_scheduler()

    if scheduler.running:
        logger.info("Scheduler already running")
        return

    # Schedule at 01:00 (1 AM) Sao Paulo time
    scheduler.add_job(
        scheduled_update_job,
        CronTrigger(hour=1, minute=0, timezone=SAO_PAULO_TZ),
        id="oracle_update_01h",
        name="Oracle Data Update - 01:00",
        replace_existing=True,
    )

    # Schedule at 13:00 (1 PM) Sao Paulo time
    scheduler.add_job(
        scheduled_update_job,
        CronTrigger(hour=13, minute=0, timezone=SAO_PAULO_TZ),
        id="oracle_update_13h",
        name="Oracle Data Update - 13:00",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with jobs:")
    for job in scheduler.get_jobs():
        logger.info("  - %s: next run at %s", job.name, job.next_run_time)


def stop_scheduler():
    """Stop the scheduler gracefully."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
        _scheduler = None
