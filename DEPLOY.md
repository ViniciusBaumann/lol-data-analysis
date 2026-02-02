# Datanalys - Guia de Deploy VPS Hostinger

Este guia descreve como fazer deploy do Datanalys em um VPS Hostinger com Ubuntu 22.04 LTS usando Docker.

## Requisitos do VPS

- **OS**: Ubuntu 22.04 LTS
- **RAM**: Mínimo 2GB (recomendado 4GB)
- **CPU**: 2 vCPUs
- **Disco**: 20GB+
- **Portas abertas**: 80 (HTTP), 22 (SSH)

## Arquitetura

```
                    +-------------+
                    |   Internet  |
                    +------+------+
                           |
                           | :80
                           v
                    +------+------+
                    |    Nginx    |
                    |   (Proxy)   |
                    +------+------+
                           |
          +----------------+----------------+
          |                                 |
          v                                 v
   +------+------+                   +------+------+
   |  Frontend   |                   |   Backend   |
   |   (React)   |                   |  (Django)   |
   |    :80      |                   |    :8000    |
   +-------------+                   +------+------+
                                            |
                           +----------------+----------------+
                           |                                 |
                           v                                 v
                    +------+------+                   +------+------+
                    | PostgreSQL  |                   |    Redis    |
                    |    :5432    |                   |    :6379    |
                    +-------------+                   +-------------+
```

## Passo a Passo

### 1. Conectar ao VPS via SSH

```bash
ssh root@SEU_IP_VPS
```

### 2. Atualizar o Sistema

```bash
apt update && apt upgrade -y
```

### 3. Criar Usuário (Opcional, mas recomendado)

```bash
adduser datanalys
usermod -aG sudo datanalys
su - datanalys
```

### 4. Clonar o Repositório

```bash
cd ~
git clone https://seu-repositorio/datanalys.git
cd datanalys
```

### 5. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.prod.example .env.prod

# Editar configurações
nano .env.prod
```

**Configurações importantes no `.env.prod`:**

```bash
# Gerar uma nova SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(50))"

# Atualizar no .env.prod:
SECRET_KEY=sua-chave-secreta-gerada
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,SEU_IP_VPS
CORS_ALLOWED_ORIGINS=http://SEU_IP_VPS,http://localhost

# Definir senhas seguras
DB_PASSWORD=senha_segura_banco_aqui
ADMIN_PASSWORD=senha_segura_admin_aqui
```

### 6. Atualizar IP no Nginx (se necessário)

Se precisar configurar CORS específico, edite `nginx/nginx.prod.conf`:

```bash
nano nginx/nginx.prod.conf
```

### 7. Executar Deploy

```bash
# Dar permissão de execução ao script
chmod +x deploy.sh

# Executar deploy
./deploy.sh
```

### 8. Verificar Deploy

```bash
# Ver status dos containers
docker compose -f docker-compose.prod.yml ps

# Ver logs
docker compose -f docker-compose.prod.yml logs -f

# Testar health check
curl http://localhost/api/v1/health/
```

## Comandos Úteis

### Gerenciamento de Containers

```bash
# Parar todos os containers
docker compose -f docker-compose.prod.yml down

# Reiniciar todos os containers
docker compose -f docker-compose.prod.yml restart

# Reiniciar um serviço específico
docker compose -f docker-compose.prod.yml restart backend

# Ver logs em tempo real
docker compose -f docker-compose.prod.yml logs -f

# Ver logs de um serviço específico
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Banco de Dados

```bash
# Acessar shell do PostgreSQL
docker compose -f docker-compose.prod.yml exec db psql -U datanalys -d datanalys

# Fazer backup do banco
docker compose -f docker-compose.prod.yml exec db pg_dump -U datanalys datanalys > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker compose -f docker-compose.prod.yml exec -T db psql -U datanalys datanalys < backup.sql
```

### Django Admin

```bash
# Acessar shell do Django
docker compose -f docker-compose.prod.yml exec backend python manage.py shell

# Criar superusuário manualmente
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

# Executar migrations manualmente
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

### Atualização

```bash
# Parar containers
docker compose -f docker-compose.prod.yml down

# Atualizar código
git pull origin main

# Rebuild e reiniciar
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

## Estrutura de Arquivos

```
datanalys/
├── backend/
│   ├── Dockerfile.prod          # Dockerfile do backend
│   ├── entrypoint.prod.sh       # Script de inicialização
│   └── ...
├── frontend/
│   ├── Dockerfile.prod          # Dockerfile do frontend
│   ├── nginx.conf               # Nginx config do container frontend
│   └── ...
├── nginx/
│   └── nginx.prod.conf          # Nginx proxy reverso principal
├── docker-compose.prod.yml      # Composição dos serviços
├── .env.prod.example            # Template de variáveis de ambiente
├── .env.prod                    # Variáveis de ambiente (não commitado)
├── deploy.sh                    # Script de deploy
└── DEPLOY.md                    # Este arquivo
```

## URLs da Aplicação

| Endpoint | URL | Descrição |
|----------|-----|-----------|
| Frontend | `http://SEU_IP/` | Interface web React |
| API | `http://SEU_IP/api/v1/` | API REST |
| Admin | `http://SEU_IP/admin/` | Django Admin |
| Health | `http://SEU_IP/api/v1/health/` | Health check |
| Health (Nginx) | `http://SEU_IP/health` | Health check simples |

## Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose -f docker-compose.prod.yml logs backend

# Verificar se há erros de permissão
ls -la postgres_data/
ls -la static/
```

### Erro de conexão com banco de dados

```bash
# Verificar se o PostgreSQL está rodando
docker compose -f docker-compose.prod.yml ps db

# Verificar logs do banco
docker compose -f docker-compose.prod.yml logs db
```

### Frontend não carrega

```bash
# Verificar build do frontend
docker compose -f docker-compose.prod.yml logs frontend

# Reconstruir frontend
docker compose -f docker-compose.prod.yml build frontend --no-cache
docker compose -f docker-compose.prod.yml up -d frontend
```

### API retorna erro 502

```bash
# Verificar se o backend está rodando
docker compose -f docker-compose.prod.yml ps backend

# Ver logs do backend
docker compose -f docker-compose.prod.yml logs backend

# Reiniciar backend
docker compose -f docker-compose.prod.yml restart backend
```

### Limpar e Reiniciar Tudo

```bash
# CUIDADO: Remove volumes (dados do banco serão perdidos)
docker compose -f docker-compose.prod.yml down -v

# Limpar imagens não usadas
docker system prune -a

# Rebuild completo
./deploy.sh
```

## Segurança

### Firewall (UFW)

```bash
# Instalar UFW se não estiver instalado
sudo apt install ufw

# Configurar regras básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Ativar firewall
sudo ufw enable
```

### Fail2ban (Proteção contra brute force)

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Monitoramento

### Ver uso de recursos

```bash
# Uso de CPU e memória por container
docker stats

# Uso de disco
df -h
du -sh postgres_data/
```

### Logs do sistema

```bash
# Logs do Docker
journalctl -u docker

# Logs do Nginx (no container)
docker compose -f docker-compose.prod.yml exec nginx cat /var/log/nginx/access.log
docker compose -f docker-compose.prod.yml exec nginx cat /var/log/nginx/error.log
```

## Backup Automático (Opcional)

Criar script de backup em `/opt/datanalys-backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR=/opt/backups/datanalys
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup do banco
cd /home/datanalys/datanalys
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U datanalys datanalys > $BACKUP_DIR/db_$DATE.sql

# Compactar
gzip $BACKUP_DIR/db_$DATE.sql

# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
```

Adicionar ao crontab:

```bash
crontab -e
# Adicionar linha para backup diário às 3h:
0 3 * * * /opt/datanalys-backup.sh
```
