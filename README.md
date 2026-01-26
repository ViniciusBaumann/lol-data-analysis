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

Copie o arquivo de exemplo e ajuste conforme necessario:

```bash
cp backend/.env.example backend/.env
```

### 3. Subir o backend (Docker)

```bash
docker-compose up -d
```

Isso inicia tres servicos:

| Servico    | Porta | Descricao            |
|------------|-------|----------------------|
| PostgreSQL | 5432  | Banco de dados       |
| Redis      | 6379  | Cache                |
| Backend    | 8000  | API Django           |

O entrypoint do container executa automaticamente as migrations, coleta de arquivos estaticos e criacao do superusuario (se configurado no `.env`).

### 4. Instalar e rodar o frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend estara disponivel em `http://localhost:5173`.

## Importar dados

Para importar os dados de partidas do Oracle's Elixir, acesse o endpoint de import via API:

```
GET http://localhost:8000/api/v1/analytics/import/
```

Os arquivos CSV ficam em `backend/data/`.

## Uso

- **Dashboard** (`/`) — Visao geral com metricas, partidas recentes e top times
- **Times** (`/teams`) — Lista de times com taxa de vitoria e filtros por liga
- **Detalhe do Time** (`/teams/:id`) — Estatisticas, historico e objetivos de um time
- **Comparar Times** (`/compare`) — Comparacao head-to-head entre dois times
- **Partidas** (`/matches`) — Busca e filtro de partidas por liga, ano e split
- **Detalhe da Partida** (`/matches/:id`) — Estatisticas completas de uma partida
- **Previsao** — Previsao de resultado via ML: `GET /api/v1/analytics/predict/?team1={id}&team2={id}`

## Stack

| Camada   | Tecnologia                          |
|----------|-------------------------------------|
| Backend  | Django 4.2 + Django REST Framework  |
| Frontend | React 18 + TypeScript + Vite        |
| Banco    | PostgreSQL 16                       |
| Estilo   | Tailwind CSS                        |
| Graficos | Recharts                            |
| ML       | scikit-learn, XGBoost               |
| Infra    | Docker Compose                      |

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

# Build de producao do frontend
cd frontend && npm run build
```
