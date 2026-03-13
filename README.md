# Datanalys

Plataforma de analytics para esports de League of Legends. Agrega dados de partidas profissionais, estatisticas de times e jogadores, e previsoes de resultados via machine learning.

## Requisitos

- [Docker](https://www.docker.com/) e Docker Compose
- [Node.js](https://nodejs.org/) 18+ (para o frontend)

## Instalacao

```bash
git clone <url-do-repositorio>
cd Datanalys
cp backend/.env.example backend/.env   # edite se necessario
docker-compose up -d                    # PostgreSQL:5432, Redis:6379, Backend:8000
cd frontend && npm install && npm run dev  # http://localhost:5173
```

O entrypoint do Docker executa migrations, coleta estaticos e cria superusuario automaticamente.

---

## Stack

| Camada   | Tecnologia                         |
|----------|------------------------------------|
| Backend  | Django 4.2 + Django REST Framework |
| Dados    | Pandas 2.1 + NumPy                |
| Frontend | React 18 + TypeScript + Vite       |
| Banco    | PostgreSQL 16                      |
| Cache    | Redis 7                            |
| Estilo   | Tailwind CSS + Recharts            |
| ML       | LightGBM, scikit-learn, Optuna     |
| Infra    | Docker Compose                     |

---

## Pipeline ETL e ML

```
  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
  │  1. EXTRACT │    │ 2. TRANSFORM │    │   3. ENRICH  │    │ 4. RECONCILIATE  │
  │  & LOAD     │───>│   & CALC     │───>│   (ML Train) │───>│   & VALIDATE     │
  │             │    │              │    │  (opcional)  │    │                  │
  │ Oracle's    │    │ Calcular ELO │    │ LightGBM     │    │ 17 verificacoes  │
  │ Elixir CSV  │    │ por liga     │    │ 6+5 modelos  │    │ automaticas      │
  │ Pandas I/O  │    │              │    │ Pandas feat. │    │ Pandas vectoriz. │
  └─────────────┘    └──────────────┘    └──────────────┘    └──────────────────┘
        │                   │                   │                      │
        ▼                   ▼                   ▼                      ▼
   DataImportLog      TeamEloRating       ml_models/*.joblib   DataReconciliationLog
```

### Comando unico

```bash
# Pipeline basico: import + ELO + reconciliacao
docker-compose exec backend python manage.py run_etl_pipeline --year 2025

# Pipeline completo com treinamento
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --train --train-draft

# Com tuning Optuna (~2-4h)
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --train --tuning
```

| Flag | Descricao |
|------|-----------|
| `--year` | Ano dos dados (padrao: atual) |
| `--train` | Treinar modelo de partida |
| `--train-draft` | Treinar modelo de draft |
| `--tuning` | Habilitar tuning Optuna |
| `--no-reconcile` | Pular verificacoes |
| `--force` | Forcar re-download do CSV |
| `--leagues` | Filtrar ligas especificas |

### Estagios individuais

```bash
# 1. Import — dados do Oracle's Elixir (CSV 300k+ linhas via Pandas)
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download

# 2. ELO — ratings por time (K=40→32, decay entre splits, ELO por lado)
docker-compose exec backend python manage.py calculate_elo --reset

# 3. ML partida — 6 modelos LightGBM (~220 features via Pandas)
docker-compose exec backend python manage.py train_prediction_model --no-tuning

# 4. ML draft — 5 modelos baseados em picks de campeoes
docker-compose exec backend python manage.py train_draft_model --no-tuning

# 5. Reconciliacao — 17 checks automaticos
docker-compose exec backend python manage.py reconcile_data --verbose
```

### Modelos gerados (`backend/ml_models/`)

| Modelo | Tipo | Preve |
|--------|------|-------|
| `winner.joblib` | Classificador | Probabilidade de vitoria lado azul |
| `total_kills/towers/dragons/barons.joblib` | Regressores | Totais da partida |
| `game_time.joblib` | Regressor | Duracao do jogo |
| `draft_winner.joblib` | Classificador | Vitoria pelo draft |
| `draft_total_*.joblib` | Regressores | Estimativas pelo draft |

---

## Processamento de dados com Pandas

O backend usa **Pandas** como camada central de processamento, substituindo loops e queries ORM por operacoes vetorizadas.

| Area | Arquivo | Operacoes Pandas |
|------|---------|-----------------|
| ETL & Import | `import_oracle_data.py` | `read_csv`, `groupby`, filtros vetorizados, alias mapping |
| Feature Engineering | `prediction.py` | `df.mean()`, `tail().mean()`, `groupby("position").mean()` — 52 features/time |
| Champion Matchups | `views.py` | `merge` + `groupby` + `agg` — substitui loops O(n^2) por self-merge |
| Reconciliacao | `etl/reconciliation.py` | `from_records`, `merge`, `pivot_table`, `groupby` + `size` |
| Head-to-Head | `prediction.py` | DataFrame bulk load elimina padrao N+1 query |

### Reconciliacao — 17 verificacoes automaticas

**Consistencia (6 checks — Pandas vetorizado):**

| Check | Verifica | Tecnica |
|-------|----------|---------|
| `match_team_stats_count` | 2 TeamMatchStats por partida | ORM annotate |
| `match_player_stats_count` | 10 PlayerMatchStats por partida | ORM annotate |
| `team_kills_consistency` | Kills time = soma jogadores | `merge` + compare |
| `winner_consistency` | Match.winner = TeamMatchStats.is_winner | `merge` + filter |
| `first_objective_exclusivity` | First blood/dragon/etc em no max 1 time | `groupby` + `size` |
| `gold_diff_symmetry` | Gold diff azul + vermelho = 0 | `pivot_table` |

**Qualidade (11 checks):** orphans, negativos, KDA anomalo, duracao anomala, datas invalidas, ligas inativas, integridade ELO, freshness ML, saude de imports.

Status de cada check: **PASS** / **WARN** / **FAIL**. Resultados persistidos em `DataReconciliationLog`.

---

## Atualizacao automatica

| Variavel | Padrao | Descricao |
|----------|--------|-----------|
| `AUTO_UPDATE_ORACLE_DATA` | `true` | Importa dados ao iniciar o servidor |
| `ENABLE_SCHEDULER` | `true` | Importacao periodica (01:00 e 13:00 SP) |

Apos cada importacao, a reconciliacao roda automaticamente.

---

## API

### Saude dos dados

```
GET /api/v1/analytics/data-health/          # status geral + ultima reconciliacao
GET /api/v1/analytics/data-health/?run=true  # dispara reconciliacao sob demanda
```

### Previsao de partida

```
GET /api/v1/analytics/predict/?team1={id}&team2={id}&league={id}
```

Retorna probabilidade de vitoria, kills, torres, dragoes, barons e duracao estimados.

### Previsao de draft

```
POST /api/v1/analytics/draft-predict/
Body: { "blue_top": "Gnar", "blue_jng": "LeeSin", ..., "red_sup": "Bard", "blue_team": 1, "red_team": 2 }
```

`blue_team`/`red_team` sao opcionais — quando fornecidos, adiciona features de ELO, H2H e forma recente.

### Jogos ao vivo

- Polls da API do LoL Esports a cada 5-10s com draft, kills, gold, objetivos
- Previsoes em tempo real conforme o draft avanca
- Analise de series (fearless draft, momentum, pool de campeoes)
- Fallback via PandaScore API (requer `PANDASCORE_API_KEY`)

---

## Paginas

| Rota | Descricao |
|------|-----------|
| `/` | Dashboard com metricas e partidas recentes |
| `/live` | Partidas ao vivo em tempo real |
| `/teams` | Lista de times com filtros por liga |
| `/teams/:id` | Estatisticas e historico do time |
| `/compare` | Comparacao head-to-head |
| `/draft` | Simulador de draft com previsao |
| `/matchups` | Matchups entre campeoes |
| `/matches` | Busca e filtro de partidas |
| `/matches/:id` | Estatisticas completas da partida |
| `/settings` | Importacao manual de dados |

---

## Estrutura do projeto

```
Datanalys/
├── backend/
│   ├── analytics/                # App principal
│   │   ├── etl/                  # Pipeline ETL e reconciliacao (Pandas)
│   │   ├── management/commands/  # Import, ELO, treino, pipeline, reconciliacao
│   │   ├── prediction.py         # Feature engineering + inferencia (Pandas)
│   │   ├── views.py              # API endpoints (Pandas matchups)
│   │   ├── live.py               # Jogos ao vivo
│   │   ├── auto_update.py        # Auto-import
│   │   └── scheduler.py          # APScheduler (cron)
│   ├── accounts/                 # Autenticacao
│   ├── ml_models/                # Modelos treinados (.joblib)
│   ├── data/                     # CSVs do Oracle's Elixir
│   └── django_rest_auth/         # Settings, URLs
├── frontend/src/
│   ├── components/               # Componentes React
│   ├── pages/                    # Paginas/rotas
│   ├── hooks/                    # Custom hooks
│   ├── services/                 # Camada de API
│   └── types/                    # TypeScript types
├── docker-compose.yml            # Dev
├── docker-compose.prod.yml       # Producao
└── deploy.sh                     # Script de deploy
```

---

## Comandos uteis

```bash
docker-compose down                                          # parar containers
docker-compose logs -f backend                               # logs do backend
docker-compose exec backend python manage.py shell           # shell Django
docker-compose exec backend python manage.py migrate         # migrations
docker-compose exec backend python manage.py run_etl_pipeline --year 2025  # pipeline ETL
docker-compose exec backend python manage.py reconcile_data --verbose      # verificar dados
cd frontend && npm run build                                 # build producao
```
