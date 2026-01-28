# ML Training Commands - Datanalys

## Prerequisites

Ensure Docker containers are running:
```bash
docker-compose up -d
```

## 1. Import Match Data

Import data from Oracle's Elixir CSV files for specific leagues.

### Import Hitpoint Masters (HM) - 2025
```bash
docker exec datanalys_backend python manage.py import_oracle_data \
    --year 2025 \
    --file data/2025_LoL_esports_match_data_from_OraclesElixir.csv \
    --leagues HM
```

### Import Multiple Leagues
```bash
docker exec datanalys_backend python manage.py import_oracle_data \
    --year 2025 \
    --file data/2025_LoL_esports_match_data_from_OraclesElixir.csv \
    --leagues LCK LPL CBLOL LCS
```

### Import All Leagues
```bash
docker exec datanalys_backend python manage.py import_oracle_data \
    --year 2025 \
    --file data/2025_LoL_esports_match_data_from_OraclesElixir.csv \
    --all-leagues
```

### Download and Import (from Google Drive)
```bash
docker exec datanalys_backend python manage.py import_oracle_data \
    --year 2025 \
    --download \
    --leagues HM
```

## 2. Calculate ELO Ratings

Calculates ELO ratings per league with side tracking (Blue/Red) and split decay.

### Standard Run
```bash
docker exec datanalys_backend python manage.py calculate_elo
```

### Reset All Ratings Before Recalculating
```bash
docker exec datanalys_backend python manage.py calculate_elo --reset
```

### Custom Decay Factor
```bash
docker exec datanalys_backend python manage.py calculate_elo --decay-factor 0.8
```

**Options:**
- `--reset`: Delete all existing ELO ratings before recalculating
- `--decay-factor`: Split decay factor (0-1). Default: 0.75

## 3. Train Prediction Models

Trains LightGBM models for match outcome prediction:
- **winner**: Win probability classifier
- **total_kills**: Total kills regressor
- **total_dragons**: Total dragons regressor
- **total_towers**: Total towers regressor
- **total_barons**: Total barons regressor
- **game_time**: Game duration regressor

### Quick Training (Default Parameters)
```bash
docker exec datanalys_backend python manage.py train_prediction_model --no-tune
```

### Full Training with Optuna Hyperparameter Tuning
```bash
docker exec datanalys_backend python manage.py train_prediction_model
```

### Custom Calibration Method
```bash
docker exec datanalys_backend python manage.py train_prediction_model \
    --calibration isotonic \
    --decay-factor 0.75
```

**Options:**
- `--no-tune`: Skip Optuna hyperparameter tuning; use default parameters
- `--calibration`: Calibration method for winner classifier (`sigmoid`, `isotonic`, `none`). Default: sigmoid
- `--decay-factor`: Split decay factor (0-1). Default: 0.75

**Output Files:**
- `/app/ml_models/winner.joblib`
- `/app/ml_models/total_kills.joblib`
- `/app/ml_models/total_dragons.joblib`
- `/app/ml_models/total_towers.joblib`
- `/app/ml_models/total_barons.joblib`
- `/app/ml_models/game_time.joblib`
- `/app/ml_models/best_params.json`

## 4. Train Draft Prediction Models

Trains LightGBM models for draft-based prediction (champion picks + team context):
- **draft_winner**: Win probability based on draft
- **draft_total_kills**: Predicted total kills
- **draft_total_towers**: Predicted total towers
- **draft_total_dragons**: Predicted total dragons
- **draft_total_barons**: Predicted total barons

### Quick Training (Default Parameters)
```bash
docker exec datanalys_backend python manage.py train_draft_model --no-tune
```

### Full Training with Optuna Hyperparameter Tuning
```bash
docker exec datanalys_backend python manage.py train_draft_model
```

**Options:**
- `--no-tune`: Skip Optuna hyperparameter tuning; use default parameters

**Output Files:**
- `/app/ml_models/draft_winner.joblib`
- `/app/ml_models/draft_total_kills.joblib`
- `/app/ml_models/draft_total_towers.joblib`
- `/app/ml_models/draft_total_dragons.joblib`
- `/app/ml_models/draft_total_barons.joblib`
- `/app/ml_models/draft_best_params.json`

## Complete Pipeline Example

Run the full pipeline for Hitpoint Masters (HM):

```bash
# 1. Import HM data for 2025
docker exec datanalys_backend python manage.py import_oracle_data \
    --year 2025 \
    --file data/2025_LoL_esports_match_data_from_OraclesElixir.csv \
    --leagues HM

# 2. Calculate ELO ratings (processes all leagues in database)
docker exec datanalys_backend python manage.py calculate_elo

# 3. Train prediction models (quick mode)
docker exec datanalys_backend python manage.py train_prediction_model --no-tune

# 4. Train draft prediction models (quick mode)
docker exec datanalys_backend python manage.py train_draft_model --no-tune
```

## Available Leagues in Data Files

### 2025 CSV
AL, ASI, Asia Master, CD, CT, DCup, EBL, EM, EWC, FST, HC, HLL, **HM**, HW, IC, KeSPA, LAS, LCK, LCKC, LCP, LEC, LFL, LFL2, LIT, LJL, LPL, LPLOL, LRN, LRS, LTA, LTA N, LTA S, LVP SL, MSI, NACL, NEXO, NLC, PCS, PRM, PRMP, RL, ROL, TCL, VCS, WLDs

### 2026 CSV
AL, CBLOL, CCWS, HLL, HW, LCK, LCKC, LCP, LCS, LEC, LFL, LIT, LPL, NLC, ROL, TCL

## Model Performance Metrics

### Prediction Model (train_prediction_model)
- **winner**: Accuracy, Brier Score, LogLoss
- **Regressors**: Mean Absolute Error (MAE)

### Draft Model (train_draft_model)
- **draft_winner**: Accuracy, Brier Score, LogLoss
- **Regressors**: Mean Absolute Error (MAE)

## Notes

- Models are trained on ALL data in the database, not per-league
- ELO ratings are calculated per (team, league) combination
- The `--no-tune` flag significantly speeds up training but may produce slightly less optimal models
- Use `--calibration isotonic` when you have 500+ calibration samples
- Split decay factor controls how much ELO rating resets between splits (0.75 = 75% of deviation from 1500 is kept)
