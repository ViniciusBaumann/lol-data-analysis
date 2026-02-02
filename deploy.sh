#!/bin/bash
# =============================================================================
# Datanalys - Production Deployment Script
# VPS Hostinger Ubuntu 22.04 LTS
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "=============================================="
echo "  Datanalys - Production Deployment"
echo "=============================================="
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user with sudo.${NC}"
fi

# Check if .env.prod exists
if [ ! -f ".env.prod" ]; then
    echo -e "${RED}Error: .env.prod file not found!${NC}"
    echo "Please copy .env.prod.example to .env.prod and update the values:"
    echo "  cp .env.prod.example .env.prod"
    echo "  nano .env.prod"
    exit 1
fi

# Load environment variables
source .env.prod

# Function to check if Docker is installed
check_docker() {
    echo -e "${YELLOW}[1/6] Checking Docker installation...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not found. Installing Docker...${NC}"
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        echo -e "${GREEN}Docker installed successfully!${NC}"
        echo -e "${YELLOW}Please log out and log back in, then run this script again.${NC}"
        exit 0
    fi
    echo -e "${GREEN}Docker is installed.${NC}"
}

# Function to check if Docker Compose is installed
check_docker_compose() {
    echo -e "${YELLOW}[2/6] Checking Docker Compose installation...${NC}"
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}Docker Compose not found. Installing...${NC}"
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
        echo -e "${GREEN}Docker Compose installed successfully!${NC}"
    fi
    echo -e "${GREEN}Docker Compose is installed.${NC}"
}

# Function to create necessary directories
create_directories() {
    echo -e "${YELLOW}[3/6] Creating necessary directories...${NC}"
    mkdir -p ./postgres_data
    mkdir -p ./redis_data
    mkdir -p ./static
    mkdir -p ./media
    mkdir -p ./logs/nginx
    echo -e "${GREEN}Directories created.${NC}"
}

# Function to stop existing containers
stop_containers() {
    echo -e "${YELLOW}[4/6] Stopping existing containers...${NC}"
    docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
    echo -e "${GREEN}Containers stopped.${NC}"
}

# Function to build and start containers
start_containers() {
    echo -e "${YELLOW}[5/6] Building and starting containers...${NC}"

    # Build images
    docker compose -f docker-compose.prod.yml build --no-cache

    # Start containers
    docker compose -f docker-compose.prod.yml up -d

    echo -e "${GREEN}Containers started.${NC}"
}

# Function to show status
show_status() {
    echo -e "${YELLOW}[6/6] Checking deployment status...${NC}"

    # Wait for services to be ready
    echo "Waiting for services to be ready..."
    sleep 10

    # Check container status
    docker compose -f docker-compose.prod.yml ps

    # Get VPS IP
    VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")

    echo ""
    echo -e "${GREEN}=============================================="
    echo "  Deployment Complete!"
    echo "=============================================="
    echo -e "${NC}"
    echo "Access your application at:"
    echo -e "  Frontend: ${GREEN}http://${VPS_IP}${NC}"
    echo -e "  API:      ${GREEN}http://${VPS_IP}/api/v1/${NC}"
    echo -e "  Admin:    ${GREEN}http://${VPS_IP}/admin/${NC}"
    echo -e "  Health:   ${GREEN}http://${VPS_IP}/api/v1/health/${NC}"
    echo ""
    echo "Useful commands:"
    echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
    echo "  Stop:          docker compose -f docker-compose.prod.yml down"
    echo "  Restart:       docker compose -f docker-compose.prod.yml restart"
    echo "  Backend logs:  docker compose -f docker-compose.prod.yml logs -f backend"
    echo "  Frontend logs: docker compose -f docker-compose.prod.yml logs -f frontend"
    echo ""
}

# Main execution
check_docker
check_docker_compose
create_directories
stop_containers
start_containers
show_status
