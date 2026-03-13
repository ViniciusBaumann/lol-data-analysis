# Datanalys

Plataforma de analytics para esports de League of Legends. Agrega dados de partidas profissionais, estatisticas de times e jogadores, e previsoes de resultados via machine learning.

## Requisitos

- [Docker](https://www.docker.com/) e Docker Compose
- [Node.js](https://nodejs.org/) 18+ (para o frontend)

## Instalacao

### 1. Clonar o repositorio

```bash
git clone <url-do-repositorio>
cd Datanalys
```

### 2. Configurar variaveis de ambiente

```bash
cp backend/.env.example backend/.env
```

Edite `backend/.env` se necessario. Para producao, copie `.env.prod.example` para `.env.prod`.

### 3. Subir o backend (Docker)

```bash
docker-compose up -d
```

| Servico    | Porta | Descricao            |
|------------|-------|----------------------|
| PostgreSQL | 5432  | Banco de dados       |
| Redis      | 6379  | Cache                |
| Backend    | 8000  | API Django           |

O entrypoint executa automaticamente migrations, coleta de arquivos estaticos e criacao do superusuario (se configurado no `.env`).

### 4. Instalar e rodar o frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend estara disponivel em `http://localhost:5173`.

---

## Processamento de dados com Pandas

O Datanalys utiliza **Pandas** como camada central de processamento de dados em todo o backend. Em vez de depender apenas do ORM do Django para agregacoes, o projeto carrega dados em DataFrames e usa operacoes vetorizadas para obter performance e clareza superiores.

### Onde o Pandas e utilizado

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PANDAS NO DATANALYS                                  │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  ETL & Import    │  │  Feature Eng.    │  │  Analytics & API     │  │
│  │                  │  │                  │  │                      │  │
│  │  pd.read_csv()   │  │  df.mean()       │  │  merge + groupby     │  │
│  │  groupby + bulk  │  │  df.rolling()    │  │  pivot_table         │  │
│  │  alias mapping   │  │  df.tail().mean  │  │  vectorized agg      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
│           │                     │                       │              │
│           ▼                     ▼                       ▼              │
│  import_oracle_data.py  prediction.py          views.py               │
│  auto_update.py         (52 features/time)     (matchups, duos)       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Reconciliacao de Dados (etl/reconciliation.py)                  │  │
│  │                                                                  │  │
│  │  DataFrame.from_records() → merge → compare vetorizado           │  │
│  │  pivot_table para simetria de gold diff                          │  │
│  │  groupby + size para exclusividade de objetivos                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1. ETL — Extract, Transform, Load (`import_oracle_data.py`, `auto_update.py`)

O pipeline de ingestao usa Pandas para ler e preparar os CSVs do Oracle's Elixir:

```python
# Leitura do CSV (300k+ linhas)
df = pd.read_csv(csv_path, low_memory=False)

# Filtragem vetorizada por liga
df = df[df["league"].str.upper().isin(["LCK", "LPL", "CBLOL", "LCS"])]

# Aplicacao de aliases (ex: "LTA S" → "CBLOL")
mapped = df["league"].map({"LTA S": "CBLOL"})
df.loc[mapped.notna(), "league"] = mapped[mapped.notna()]

# Agrupamento por partida para processamento em batch
grouped = df.groupby("gameid")
for gameid, game_df in grouped:
    team_rows = game_df[game_df["position"] == "team"]
    player_rows = game_df[game_df["position"] != "team"]
    # ... cria Match, TeamMatchStats, PlayerMatchStats
```

**Por que Pandas aqui:** CSVs do Oracle's Elixir tem 300k+ linhas com 100+ colunas. O `pd.read_csv()` com `groupby` e ordens de grandeza mais rapido que qualquer parser manual, e o `dropna()` + filtros vetorizados eliminam dados invalidos em uma unica operacao.

### 2. Feature Engineering — Predicoes ML (`prediction.py`)

O calculo de features para os modelos de ML usa DataFrames para computar 52 features por time de forma vetorizada:

```python
# Carrega ultimas N partidas do time em um DataFrame
df = pd.DataFrame(stats_records)

# Todas as medias de combate e objetivos em uma unica operacao
avg_cols = ["kills", "deaths", "towers", "dragons", "barons",
            "heralds", "voidgrubs", "inhibitors"]
averages = df[avg_cols].mean()

# Taxas de primeiro objetivo — vetorizado
first_blood_rate = df["first_blood"].mean()
first_tower_rate = df["first_tower"].mean()

# Forma recente com tail() — sem loops
win_rate_last3 = df["is_winner"].tail(3).mean()
win_rate_last5 = df["is_winner"].tail(5).mean()

# Momentum como diferenca de janelas
momentum = df["is_winner"].tail(5).mean() - df["is_winner"].tail(10).head(5).mean()

# Win rate por lado — filtro vetorizado
blue_wr = df.loc[df["side"] == "Blue", "is_winner"].mean()

# Diferenciais de early game — media com NaN handling nativo
avg_golddiffat10 = df["golddiffat10"].mean()  # ignora NaN automaticamente

# Stats por posicao — groupby resolve 25 features de uma vez
pos_features = player_df.groupby("position")[
    ["kda", "cs_per_min", "damage_per_min", "gold_per_min", "vision_score"]
].mean()
```

**Antes vs depois:**

| Metrica | Loops manuais | Pandas vetorizado |
|---------|--------------|-------------------|
| Linhas de codigo | ~130 | ~40 |
| Operacoes para 52 features | 52 loops individuais | 3 operacoes vetorizadas |
| Tratamento de NaN | Manual `if not None` | Nativo `skipna=True` |

### 3. Champion Matchups — Analise de Pareamentos (`views.py`)

A analise de matchups, sinergias e duos de campeoes usa Pandas `merge` + `groupby` para substituir loops O(n^2):

```python
# Carrega todos os player stats em um DataFrame
df = pd.DataFrame(PlayerMatchStats.objects.values(
    "match_id", "team_id", "champion", "position"))

# Merge com vencedores — uma unica operacao
winners = pd.DataFrame(
    Match.objects.values_list("id", "winner_id"),
    columns=["match_id", "winner_id"])
df = df.merge(winners, on="match_id")
df["won"] = df["team_id"] == df["winner_id"]

# Direct matchup: merge + groupby (antes: defaultdict + loop)
result = (
    opponents
    .groupby("champion")
    .agg(games=("won", "size"), wins=("won", "sum"))
    .assign(win_rate=lambda x: (x.wins / x.games * 100).round(1))
)

# Duos: self-merge substitui itertools.combinations O(n^2)
pairs = df.merge(df, on=["match_id", "team_id", "won"], suffixes=("_1", "_2"))
pairs = pairs[pairs["key_1"] < pairs["key_2"]]  # deduplicacao vetorizada
```

**Impacto de performance:**

| Operacao | Antes (Python loops) | Depois (Pandas) |
|----------|---------------------|-----------------|
| Direct matchup | O(n) loop + defaultdict | merge + groupby |
| Duo analysis | O(n^2) combinations | Self-merge O(n log n) |
| 10k+ partidas | ~8s | ~0.5s |

### 4. Reconciliacao de Dados (`etl/reconciliation.py`)

As 6 verificacoes de consistencia usam Pandas para comparacoes vetorizadas em vez de queries ORM individuais:

```python
# Consistencia de kills: team kills == sum(player kills)
df_team = pd.DataFrame.from_records(
    TeamMatchStats.objects.values("match_id", "team_id", "kills"))
df_player = pd.DataFrame.from_records(
    PlayerMatchStats.objects.values("match_id", "team_id", "kills"))

player_sums = df_player.groupby(["match_id", "team_id"])["kills"].sum()
merged = df_team.merge(player_sums, on=["match_id", "team_id"])
mismatches = merged[merged["kills_x"] != merged["kills_y"]]

# Simetria de gold diff: pivot_table + comparacao vetorizada
pivoted = df.pivot_table(index="match_id", columns="side", values="golddiffat10")
asymmetric = pivoted[abs(pivoted["Blue"] + pivoted["Red"]) > 50]
```

**Antes vs depois:**

| Check | Antes | Depois |
|-------|-------|--------|
| team_kills_consistency | N queries (1 por TeamMatchStats) | 2 queries + merge |
| winner_consistency | 5000 matches com prefetch + loop | 2 queries + merge + filter |
| gold_diff_symmetry | Dict manual + loop | pivot_table + vectorized |
| first_objective_exclusivity | 5 queries separadas | 1 query + groupby |

### 5. Head-to-Head (`prediction.py`)

O calculo de features H2H entre dois times usa DataFrames para eliminar o padrao N+1 query:

```python
# Antes: loop com 1 query por partida
for match in h2h_matches[:20]:
    t1_stats = TeamMatchStats.objects.filter(match_id=match.id, team_id=team1_id).first()
    if t1_stats and t1_stats.golddiffat15 is not None:
        gold_diffs.append(t1_stats.golddiffat15)

# Depois: 1 query + DataFrame
h2h_df = pd.DataFrame(h2h_matches.values("id", "winner_id", "game_length"))
win_rate = (h2h_df["winner_id"] == team1_id).mean()
avg_duration = h2h_df["game_length"].dropna().mean()
stats_df = pd.DataFrame(
    TeamMatchStats.objects.filter(match_id__in=ids, team_id=team1_id)
    .values("golddiffat15"))
avg_gold_diff = stats_df["golddiffat15"].dropna().mean()
```

---

## Pipeline ETL e ML

O Datanalys possui um pipeline de dados completo com ETL, calculo de metricas, treinamento de modelos e reconciliacao automatica de dados.

### Visao geral

```
                          ┌──────────────────────────────────────────────────────┐
                          │              PIPELINE ETL COMPLETO                    │
                          └──────────────────────────────────────────────────────┘

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

### Comando unico (pipeline orquestrado)

O comando `run_etl_pipeline` executa todos os estagios em sequencia com retry automatico:

```bash
# Pipeline basico: import + ELO + reconciliacao
docker-compose exec backend python manage.py run_etl_pipeline --year 2025

# Pipeline completo com treinamento de modelos
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --train --train-draft

# Com tuning de hiperparametros (lento, ~2-4h)
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --train --tuning

# Forcar re-download e filtrar ligas
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --force --leagues LCK LPL

# Pular reconciliacao
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --no-reconcile
```

**Opcoes do pipeline:**

| Flag | Descricao |
|------|-----------|
| `--year` | Ano dos dados (padrao: ano atual) |
| `--train` | Treinar modelo de partida apos import |
| `--train-draft` | Treinar modelo de draft apos import |
| `--tuning` | Habilitar tuning Optuna (lento) |
| `--no-reconcile` | Pular verificacoes de reconciliacao |
| `--force` | Forcar re-download do CSV |
| `--leagues` | Filtrar ligas especificas |

**Saida de exemplo:**

```
Starting ETL Pipeline

============================================================
Pipeline Results
============================================================
  OK   import                    (45.2s)
  OK   elo                       (12.8s)
  OK   reconciliation            (3.1s)
       15/17 passed, 2 warnings, 0 failed

Pipeline concluido com sucesso em 61.1s.
```

---

### Estagios individuais

Cada estagio tambem pode ser executado separadamente:

#### 1. Importar dados (Extract & Load)

Os dados vem do [Oracle's Elixir](https://oracleselixir.com/), que disponibiliza CSVs com todas as partidas profissionais de LoL.

```bash
# Importar dados de 2025 (baixa do Google Drive automaticamente)
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download

# Importar de um CSV local
docker-compose exec backend python manage.py import_oracle_data --year 2025 --file /app/data/2025_data.csv

# Importar todas as ligas (por padrao so importa LPL, LCK, CBLOL, LCS)
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download --all-leagues

# Filtrar ligas especificas
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download --leagues LCK LEC LPL

# Forcar re-download do CSV (apaga cache local)
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download --force
```

**Opcoes:**

| Flag | Descricao |
|------|-----------|
| `--year` | Ano dos dados (obrigatorio) |
| `--download` | Baixar CSV do Google Drive |
| `--file` | Caminho para CSV local |
| `--leagues` | Lista de ligas para filtrar |
| `--all-leagues` | Importar todas as ligas |
| `--force` | Apagar cache e re-baixar |

Os CSVs ficam salvos em `backend/data/`. O log de cada importacao fica registrado no banco (modelo `DataImportLog`).

#### 2. Calcular ratings ELO (Transform)

Apos importar os dados, calcule os ratings ELO dos times:

```bash
# Calcular ELO (incremental, mantem dados existentes)
docker-compose exec backend python manage.py calculate_elo

# Recalcular do zero
docker-compose exec backend python manage.py calculate_elo --reset

# Ajustar fator de decay entre splits (padrao: 0.75)
docker-compose exec backend python manage.py calculate_elo --reset --decay-factor 0.8
```

O algoritmo:
- ELO base: 1500 pontos
- K-factor: 40 nos primeiros 30 jogos, depois 32
- ELO separado para lado azul e vermelho
- Decay entre splits: `novo_elo = 1500 + decay * (elo_atual - 1500)`

#### 3. Treinar modelos de previsao (Enrich)

##### Modelo de partida (time vs time)

Treina 6 modelos LightGBM com ~220 features (calculadas via Pandas):

```bash
# Treinar com tuning de hiperparametros (Optuna, ~2-4h)
docker-compose exec backend python manage.py train_prediction_model

# Treinar sem tuning (usa defaults, ~10min)
docker-compose exec backend python manage.py train_prediction_model --no-tuning

# Limitar quantidade de partidas para treino rapido
docker-compose exec backend python manage.py train_prediction_model --no-tuning --matches 5000

# Forcar re-treino mesmo se modelos ja existem
docker-compose exec backend python manage.py train_prediction_model --force
```

**Modelos gerados:**

| Arquivo | Tipo | O que preve |
|---------|------|-------------|
| `winner.joblib` | Classificador | Probabilidade de vitoria do lado azul |
| `total_kills.joblib` | Regressor | Total de kills na partida |
| `total_towers.joblib` | Regressor | Total de torres |
| `total_dragons.joblib` | Regressor | Total de dragoes |
| `total_barons.joblib` | Regressor | Total de barons |
| `game_time.joblib` | Regressor | Duracao do jogo (minutos) |

##### Modelo de draft (composicao de campeoes)

Treina modelos baseados nos picks de campeoes:

```bash
# Treinar com tuning (~2-4h)
docker-compose exec backend python manage.py train_draft_model

# Treinar sem tuning (~10min)
docker-compose exec backend python manage.py train_draft_model --no-tuning

# Limitar partidas
docker-compose exec backend python manage.py train_draft_model --no-tuning --matches 5000
```

**Modelos gerados:**

| Arquivo | Tipo | O que preve |
|---------|------|-------------|
| `draft_winner.joblib` | Classificador | Probabilidade de vitoria pelo draft |
| `draft_total_kills.joblib` | Regressor | Kills estimadas pelo draft |
| `draft_total_towers.joblib` | Regressor | Torres estimadas |
| `draft_total_dragons.joblib` | Regressor | Dragoes estimados |
| `draft_total_barons.joblib` | Regressor | Barons estimados |

Todos os modelos sao salvos em `backend/ml_models/`. Os hiperparametros ficam em `best_params.json` e `draft_best_params.json`.

#### 4. Reconciliacao e qualidade de dados (Validate)

O sistema executa 17 verificacoes automaticas divididas em duas categorias, usando Pandas para comparacoes vetorizadas:

```bash
# Rodar todas as verificacoes
docker-compose exec backend python manage.py reconcile_data

# Saida detalhada com informacoes de cada check
docker-compose exec backend python manage.py reconcile_data --verbose

# Apenas verificacoes de consistencia
docker-compose exec backend python manage.py reconcile_data --only reconciliation

# Apenas verificacoes de qualidade
docker-compose exec backend python manage.py reconcile_data --only quality
```

##### Verificacoes de consistencia (reconciliation) — Pandas vetorizado

| Check | O que verifica | Tecnica Pandas |
|-------|---------------|----------------|
| `match_team_stats_count` | Cada partida tem exatamente 2 TeamMatchStats | ORM annotate |
| `match_player_stats_count` | Cada partida tem exatamente 10 PlayerMatchStats | ORM annotate |
| `team_kills_consistency` | Kills do time = soma dos kills dos jogadores | `merge` + compare |
| `winner_consistency` | Match.winner bate com TeamMatchStats.is_winner | `merge` + filter |
| `first_objective_exclusivity` | First blood/dragon/etc atribuido a no maximo 1 time | `groupby` + `size` |
| `gold_diff_symmetry` | Gold diff azul + gold diff vermelho = 0 (simetria) | `pivot_table` |

##### Verificacoes de qualidade (quality)

| Check | O que verifica |
|-------|---------------|
| `orphan_players` | Jogadores sem time ou sem estatisticas |
| `orphan_teams` | Times sem nenhuma partida |
| `negative_stats` | Valores negativos em kills, deaths, gold, etc |
| `anomalous_kda` | KDA impossivel (> 100) |
| `anomalous_game_length` | Duracao < 10 min ou > 90 min |
| `matches_without_date` | Partidas sem data registrada |
| `future_matches` | Partidas com data no futuro |
| `stale_leagues` | Ligas sem partidas nos ultimos 90 dias |
| `elo_integrity` | Ratings ELO correspondem a partidas reais |
| `ml_model_freshness` | Modelos ML existem e tem < 30 dias |
| `import_health` | Importacoes recentes foram bem-sucedidas |

Cada verificacao retorna um dos tres status:
- **PASS** -- dados consistentes
- **WARN** -- anomalia detectada, nao necessariamente erro
- **FAIL** -- inconsistencia que precisa de atencao

Os resultados ficam registrados no banco (modelo `DataReconciliationLog`) e disponiveis via API.

### Pipeline manual completo (copiar e colar)

```bash
# 1. Importar dados
docker-compose exec backend python manage.py import_oracle_data --year 2025 --download

# 2. Calcular ELO
docker-compose exec backend python manage.py calculate_elo --reset

# 3. Treinar modelo de partida
docker-compose exec backend python manage.py train_prediction_model --no-tuning

# 4. Treinar modelo de draft
docker-compose exec backend python manage.py train_draft_model --no-tuning

# 5. Verificar integridade dos dados
docker-compose exec backend python manage.py reconcile_data
```

Ou em um unico comando:

```bash
docker-compose exec backend python manage.py run_etl_pipeline --year 2025 --train --train-draft
```

Para re-treinar com dados novos, basta repetir o pipeline. O import e incremental (nao duplica partidas ja existentes).

---

## Atualizacao automatica de dados

O sistema pode importar dados novos automaticamente:

| Variavel | Padrao | Descricao |
|----------|--------|-----------|
| `AUTO_UPDATE_ORACLE_DATA` | `true` | Importa dados ao iniciar o servidor |
| `ENABLE_SCHEDULER` | `true` | Agenda importacao periodica |

Com o scheduler ativado, os dados sao atualizados automaticamente as **01:00** e **13:00** (horario de Sao Paulo). Apos cada importacao (auto-update ou agendada), a reconciliacao de dados e executada automaticamente.

Para desativar, no `backend/.env`:

```bash
AUTO_UPDATE_ORACLE_DATA=false
ENABLE_SCHEDULER=false
```

---

## API de saude dos dados

### Health check

```
GET /api/v1/analytics/data-health/
```

Retorna o status geral dos dados: contagens, ultima importacao e resultado da ultima reconciliacao.

```json
{
  "summary": {
    "total_matches": 12500,
    "total_teams": 85,
    "total_players": 420,
    "total_leagues": 6,
    "total_elo_ratings": 170
  },
  "latest_import": {
    "status": "completed",
    "year": 2025,
    "matches_created": 150,
    "started_at": "2025-03-13T01:00:00Z"
  },
  "reconciliation": {
    "status": "healthy",
    "total_checks": 17,
    "passed": 15,
    "warnings": 2,
    "failed": 0,
    "triggered_by": "scheduler",
    "results": { ... }
  }
}
```

Para disparar uma nova reconciliacao sob demanda:

```
GET /api/v1/analytics/data-health/?run=true
```

---

## Jogos ao vivo

O sistema acompanha partidas ao vivo do LoL Esports em tempo real:

- Polls da API do LoL Esports a cada 5-10 segundos
- Exibe draft, estatisticas ao vivo, kills, gold, objetivos
- Roda previsoes em tempo real conforme o draft e avanca
- Analise de series (fearless draft, momentum, pool de campeoes)
- Fallback via PandaScore API para dados de partidas encerradas (requer `PANDASCORE_API_KEY` no `.env`)

---

## API de previsao

### Previsao de partida

```
GET /api/v1/analytics/predict/?team1={id}&team2={id}&league={id}
```

Retorna probabilidade de vitoria, estimativas de kills, torres, dragoes, barons e duracao.

### Previsao de draft

```
POST /api/v1/analytics/draft-predict/
```

```json
{
  "blue_top": "Gnar",
  "blue_jng": "LeeSin",
  "blue_mid": "Azir",
  "blue_bot": "Jinx",
  "blue_sup": "Thresh",
  "red_top": "Camille",
  "red_jng": "Elise",
  "red_mid": "Viktor",
  "red_bot": "Aphelios",
  "red_sup": "Bard",
  "blue_team": 1,
  "red_team": 2
}
```

Os campos `blue_team` e `red_team` sao opcionais. Quando fornecidos, o modelo adiciona features de ELO, H2H e forma recente.

---

## Uso

- **Dashboard** (`/`) -- Visao geral com metricas, partidas recentes e top times
- **Ao Vivo** (`/live`) -- Partidas ao vivo com estatisticas em tempo real
- **Times** (`/teams`) -- Lista de times com taxa de vitoria e filtros por liga
- **Detalhe do Time** (`/teams/:id`) -- Estatisticas, historico e objetivos
- **Comparar Times** (`/compare`) -- Comparacao head-to-head
- **Draft** (`/draft`) -- Simulador de draft com previsao em tempo real
- **Matchups** (`/matchups`) -- Base de dados de matchups entre campeoes
- **Partidas** (`/matches`) -- Busca e filtro de partidas
- **Detalhe da Partida** (`/matches/:id`) -- Estatisticas completas
- **Configuracoes** (`/settings`) -- Importacao manual de dados

---

## Stack

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Backend    | Django 4.2 + Django REST Framework  |
| Dados      | Pandas 2.1 + NumPy                  |
| Frontend   | React 18 + TypeScript + Vite        |
| Banco      | PostgreSQL 16                       |
| Cache      | Redis 7                             |
| Estilo     | Tailwind CSS                        |
| Graficos   | Recharts                            |
| ML         | LightGBM, scikit-learn, Optuna      |
| Infra      | Docker Compose                      |

---

## Estrutura do projeto

```
Datanalys/
├── backend/
│   ├── analytics/              # App principal (modelos, views, ML)
│   │   ├── etl/                # Pipeline ETL e reconciliacao
│   │   │   ├── pipeline.py     # Orquestrador do pipeline
│   │   │   ├── reconciliation.py # Verificacoes de consistencia (Pandas)
│   │   │   └── quality.py      # Verificacoes de qualidade
│   │   ├── management/commands/
│   │   │   ├── import_oracle_data.py   # Import CSV via Pandas
│   │   │   ├── calculate_elo.py        # Calculo ELO (Transform)
│   │   │   ├── train_prediction_model.py # Treino ML (Enrich)
│   │   │   ├── train_draft_model.py    # Treino draft ML
│   │   │   ├── run_etl_pipeline.py     # Pipeline orquestrado
│   │   │   └── reconcile_data.py       # Reconciliacao manual
│   │   ├── prediction.py       # Feature eng. + inferencia (Pandas)
│   │   ├── prediction_features.py  # Features avancadas
│   │   ├── views.py            # API endpoints (Pandas matchups)
│   │   ├── live.py             # Jogos ao vivo
│   │   ├── auto_update.py      # Auto-import (Pandas ETL)
│   │   └── scheduler.py        # APScheduler (cron)
│   ├── accounts/               # Autenticacao
│   ├── ml_models/              # Modelos treinados (.joblib)
│   ├── data/                   # CSVs do Oracle's Elixir
│   └── django_rest_auth/       # Settings, URLs
├── frontend/
│   └── src/
│       ├── components/         # Componentes React
│       ├── pages/              # Paginas/rotas
│       ├── hooks/              # Custom hooks
│       ├── services/           # Camada de API
│       └── types/              # TypeScript types
├── docker-compose.yml          # Dev
├── docker-compose.prod.yml     # Producao
└── deploy.sh                   # Script de deploy
```

---

## Comandos uteis

```bash
# Parar todos os containers
docker-compose down

# Ver logs do backend
docker-compose logs -f backend

# Acessar o shell Django
docker-compose exec backend python manage.py shell

# Rodar migrations manualmente
docker-compose exec backend python manage.py migrate

# Pipeline ETL completo
docker-compose exec backend python manage.py run_etl_pipeline --year 2025

# Verificar saude dos dados
docker-compose exec backend python manage.py reconcile_data --verbose

# Build de producao do frontend
cd frontend && npm run build
```
