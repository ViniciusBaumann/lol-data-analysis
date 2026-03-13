"""Orquestrador do pipeline ETL completo.

Executa os estagios em ordem:
    1. Extract (download CSV do Oracle's Elixir)
    2. Transform & Load (importar para o banco)
    3. Calcular ELO
    4. Treinar modelos ML (opcional)
    5. Reconciliacao e qualidade de dados

Inclui retry com backoff, logging estruturado e persistencia do resultado.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from django.core.management import call_command
from django.utils import timezone

from analytics.models import DataReconciliationLog

logger = logging.getLogger(__name__)


class PipelineStageError(Exception):
    """Erro em um estagio do pipeline."""

    def __init__(self, stage: str, message: str):
        self.stage = stage
        super().__init__(f"[{stage}] {message}")


def _run_with_retry(
    fn,
    *args,
    retries: int = 2,
    backoff: float = 5.0,
    stage_name: str = "unknown",
    **kwargs,
) -> Any:
    """Execute a function with retry and exponential backoff."""
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt < retries:
                wait = backoff * attempt
                logger.warning(
                    "[%s] Tentativa %d/%d falhou: %s. Retry em %.0fs...",
                    stage_name, attempt, retries, exc, wait,
                )
                time.sleep(wait)
            else:
                logger.error(
                    "[%s] Todas as %d tentativas falharam.",
                    stage_name, retries,
                )
    raise PipelineStageError(stage_name, str(last_exc)) from last_exc


def run_reconciliation(triggered_by: str = "manual") -> DataReconciliationLog:
    """Run all reconciliation and quality checks, persist results."""
    from analytics.etl.quality import run_all_quality_checks
    from analytics.etl.reconciliation import run_all_reconciliation_checks

    log = DataReconciliationLog.objects.create(
        status="running",
        triggered_by=triggered_by,
    )

    try:
        reconciliation_results = run_all_reconciliation_checks()
        quality_results = run_all_quality_checks()

        all_results = reconciliation_results + quality_results

        passed = sum(1 for r in all_results if r["status"] == "passed")
        warnings = sum(1 for r in all_results if r["status"] == "warning")
        failed = sum(1 for r in all_results if r["status"] == "failed")

        if failed > 0:
            status = "errors"
        elif warnings > 0:
            status = "warnings"
        else:
            status = "healthy"

        log.status = status
        log.total_checks = len(all_results)
        log.passed_checks = passed
        log.warning_checks = warnings
        log.failed_checks = failed
        log.results = {
            "reconciliation": reconciliation_results,
            "quality": quality_results,
        }
        log.completed_at = timezone.now()
        log.save()

        logger.info(
            "Reconciliacao concluida: %s (%d/%d passed, %d warnings, %d failed)",
            status, passed, len(all_results), warnings, failed,
        )
        return log

    except Exception as exc:
        log.status = "failed"
        log.results = {"error": str(exc)}
        log.completed_at = timezone.now()
        log.save()
        logger.exception("Reconciliacao falhou: %s", exc)
        raise


def run_etl_pipeline(
    year: int | None = None,
    train: bool = False,
    train_draft: bool = False,
    no_tuning: bool = True,
    reconcile: bool = True,
    force_download: bool = False,
    leagues: list[str] | None = None,
) -> dict:
    """Execute the full ETL pipeline.

    Args:
        year: Year to import (default: current year).
        train: Whether to retrain the match prediction model.
        train_draft: Whether to retrain the draft model.
        no_tuning: Skip hyperparameter tuning during training.
        reconcile: Run reconciliation checks after pipeline.
        force_download: Force re-download of CSV.
        leagues: List of leagues to filter (default: uses command default).

    Returns:
        Dict with pipeline execution results per stage.
    """
    from datetime import datetime

    if year is None:
        year = datetime.now().year

    results: dict[str, Any] = {
        "started_at": timezone.now().isoformat(),
        "year": year,
        "stages": {},
    }

    total_start = time.monotonic()

    # ----- Stage 1: Import data -----
    stage = "import"
    logger.info("=" * 60)
    logger.info("PIPELINE STAGE 1: Import data (year=%d)", year)
    logger.info("=" * 60)
    t0 = time.monotonic()
    try:
        import_args = ["--year", str(year), "--download"]
        if force_download:
            import_args.append("--force")
        if leagues:
            import_args.extend(["--leagues"] + leagues)

        _run_with_retry(
            call_command,
            "import_oracle_data",
            *import_args,
            retries=3,
            backoff=10.0,
            stage_name=stage,
        )
        results["stages"][stage] = {
            "status": "success",
            "duration_s": round(time.monotonic() - t0, 1),
        }
    except PipelineStageError as exc:
        results["stages"][stage] = {
            "status": "failed",
            "error": str(exc),
            "duration_s": round(time.monotonic() - t0, 1),
        }
        logger.error("Pipeline abortado no estagio '%s': %s", stage, exc)
        results["completed_at"] = timezone.now().isoformat()
        results["total_duration_s"] = round(time.monotonic() - total_start, 1)
        results["final_status"] = "failed"
        return results

    # ----- Stage 2: Calculate ELO -----
    stage = "elo"
    logger.info("=" * 60)
    logger.info("PIPELINE STAGE 2: Calculate ELO")
    logger.info("=" * 60)
    t0 = time.monotonic()
    try:
        _run_with_retry(
            call_command,
            "calculate_elo",
            "--reset",
            retries=2,
            backoff=5.0,
            stage_name=stage,
        )
        results["stages"][stage] = {
            "status": "success",
            "duration_s": round(time.monotonic() - t0, 1),
        }
    except PipelineStageError as exc:
        results["stages"][stage] = {
            "status": "failed",
            "error": str(exc),
            "duration_s": round(time.monotonic() - t0, 1),
        }
        logger.error("Estagio '%s' falhou: %s (pipeline continua)", stage, exc)

    # ----- Stage 3: Train models (optional) -----
    if train:
        stage = "train_model"
        logger.info("=" * 60)
        logger.info("PIPELINE STAGE 3: Train prediction model")
        logger.info("=" * 60)
        t0 = time.monotonic()
        try:
            train_args = []
            if no_tuning:
                train_args.append("--no-tuning")
            _run_with_retry(
                call_command,
                "train_prediction_model",
                *train_args,
                retries=1,
                backoff=5.0,
                stage_name=stage,
            )
            results["stages"][stage] = {
                "status": "success",
                "duration_s": round(time.monotonic() - t0, 1),
            }
        except PipelineStageError as exc:
            results["stages"][stage] = {
                "status": "failed",
                "error": str(exc),
                "duration_s": round(time.monotonic() - t0, 1),
            }
            logger.error("Estagio '%s' falhou: %s (pipeline continua)", stage, exc)

    if train_draft:
        stage = "train_draft"
        logger.info("=" * 60)
        logger.info("PIPELINE STAGE 3b: Train draft model")
        logger.info("=" * 60)
        t0 = time.monotonic()
        try:
            train_args = []
            if no_tuning:
                train_args.append("--no-tuning")
            _run_with_retry(
                call_command,
                "train_draft_model",
                *train_args,
                retries=1,
                backoff=5.0,
                stage_name=stage,
            )
            results["stages"][stage] = {
                "status": "success",
                "duration_s": round(time.monotonic() - t0, 1),
            }
        except PipelineStageError as exc:
            results["stages"][stage] = {
                "status": "failed",
                "error": str(exc),
                "duration_s": round(time.monotonic() - t0, 1),
            }
            logger.error("Estagio '%s' falhou: %s (pipeline continua)", stage, exc)

    # ----- Stage 4: Reconciliation -----
    if reconcile:
        stage = "reconciliation"
        logger.info("=" * 60)
        logger.info("PIPELINE STAGE 4: Reconciliacao de dados")
        logger.info("=" * 60)
        t0 = time.monotonic()
        try:
            recon_log = run_reconciliation(triggered_by="pipeline")
            results["stages"][stage] = {
                "status": recon_log.status,
                "total_checks": recon_log.total_checks,
                "passed": recon_log.passed_checks,
                "warnings": recon_log.warning_checks,
                "failed": recon_log.failed_checks,
                "duration_s": round(time.monotonic() - t0, 1),
            }
        except Exception as exc:
            results["stages"][stage] = {
                "status": "failed",
                "error": str(exc),
                "duration_s": round(time.monotonic() - t0, 1),
            }
            logger.error("Estagio '%s' falhou: %s", stage, exc)

    # ----- Summary -----
    total_duration = round(time.monotonic() - total_start, 1)
    results["completed_at"] = timezone.now().isoformat()
    results["total_duration_s"] = total_duration

    failed_stages = [
        name for name, info in results["stages"].items()
        if info.get("status") == "failed"
    ]
    if failed_stages:
        results["final_status"] = "partial_failure"
        results["failed_stages"] = failed_stages
    else:
        results["final_status"] = "success"

    logger.info("=" * 60)
    logger.info(
        "PIPELINE COMPLETO em %.1fs — Status: %s",
        total_duration, results["final_status"],
    )
    logger.info("=" * 60)

    return results
