# Production Deployment & Publishing Guide

This guide provides end-to-end instructions for deploying, containerizing, securing, and maintaining the **Local Connectivity Chit-Fund Platform** in production environments.

---

## Table of Contents
1. [Prerequisites & System Architecture](#1-prerequisites--system-architecture)
2. [Local & VM Deployment](#2-local--vm-deployment)
3. [Docker & Docker Compose Deployment](#3-docker--docker-compose-deployment)
4. [Process Management with PM2](#4-process-management-with-pm2)
5. [Nginx Reverse Proxy & SSL / TLS Termination](#5-nginx-reverse-proxy--ssl--tls-termination)
6. [Database Backup, Persistence & WAL Maintenance](#6-database-backup-persistence--wal-maintenance)
7. [Security Hardening & Production Checklist](#7-security-hardening--production-checklist)
8. [Monitoring & Health Probes](#8-monitoring--health-probes)

---

## 1. Prerequisites & System Architecture

The platform is designed with a **Zero-External-Dependency** philosophy, executing entirely on standard Node.js native runtimes without needing third-party binary addons.

- **Runtime:** Node.js `>= 22.0.0` (LTS or current, verified on Node `v24.x`)
- **Memory:** 512 MB RAM minimum (1 GB recommended)
- **Disk:** 10 GB SSD for high-write WAL SQLite logging
- **OS:** Linux (Ubuntu 22.04 LTS / 24.04 LTS, Debian 12, Alpine Linux) or Windows Server

```
                    Internet
                       │
             ┌─────────▼─────────┐
             │ Nginx (Port 443)  │  <-- SSL / TLS (Let's Encrypt), Rate Limiting
             └─────────┬─────────┘
                       │ Reverse Proxy (HTTP 1.1)
             ┌─────────▼─────────┐
             │ Node.js Server    │  <-- Express-free Native HTTP Engine
             │   (Port 3000)     │
             └─────────┬─────────┘
                       │ Embedded In-Process IPC
             ┌─────────▼─────────┐
             │ SQLite3 WAL Mode  │  <-- data/chitfund.db (20 Normalized Tables)
             └───────────────────┘
```

---

## 2. Local & VM Deployment

### Step 1: Clone Repository
```bash
git clone <repository-url> local-chit-fund-platform
cd local-chit-fund-platform
```

### Step 2: Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `PORT=3000` and `DB_PATH=./data/chitfund.db` are set.

### Step 3: Run Database Seed (Initial Install Only)
```bash
node src/seed/seedData.js
```

### Step 4: Run Test Verification
Confirm all 35 tests pass prior to launching:
```bash
node --test tests/*.test.js
```

### Step 5: Start Server
```bash
node src/server.js
```

---

## 3. Docker & Docker Compose Deployment

The fastest way to deploy to any cloud provider (AWS EC2, DigitalOcean Droplet, GCP Compute Engine, Azure VM, or Linode) is via Docker.

### Running with Docker Compose (Recommended)
```bash
# Build and run containers in background
docker compose up -d --build

# View real-time logs
docker compose logs -f chit-fund-app

# Check container status & health
docker compose ps
```

The database is persisted in the Docker volume `chitfund_data` at `/usr/src/app/data/chitfund.db`.

### Running Standalone Docker
```bash
# Build Docker image
docker build -t chit-fund-platform:1.0.0 .

# Run container with volume mount
docker run -d \
  --name chit-fund \
  -p 3000:3000 \
  -v $(pwd)/data:/usr/src/app/data \
  --restart unless-stopped \
  chit-fund-platform:1.0.0
```

---

## 4. Process Management with PM2

For bare-metal or VM hosting (e.g., Ubuntu server), PM2 provides background process daemonization, log rotation, and automatic restart on server reboots.

### Step 1: Install PM2 Globally
```bash
npm install -g pm2
```

### Step 2: Start with Ecosystem File
```bash
pm2 start ecosystem.config.cjs --env production
```

### Step 3: Configure Startup Persistence
```bash
# Save active process list
pm2 save

# Generate systemd startup hook
pm2 startup systemd
```

### Useful PM2 Commands:
- View status: `pm2 status`
- Monitor metrics: `pm2 monit`
- View live logs: `pm2 logs chit-fund-platform`
- Restart zero-downtime: `pm2 restart chit-fund-platform`

---

## 5. Nginx Reverse Proxy & SSL / TLS Termination

To run the application under a public domain with HTTPS (e.g. `https://chitfund.yourdomain.com`):

### Nginx Virtual Host Configuration (`/etc/nginx/sites-available/chitfund.conf`)

```nginx
server {
    listen 80;
    server_name chitfund.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chitfund.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/chitfund.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chitfund.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:;" always;

    # Static Assets Caching
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # API and Dynamic Requests
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for auction bidding
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

### Enable SSL with Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/chitfund.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d chitfund.yourdomain.com
```

---

## 6. Database Backup, Persistence & WAL Maintenance

SQLite in Write-Ahead Logging (`WAL`) mode allows concurrent reads during writes. To maintain database health:

### Automated Backup Script (`scripts/backup.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/chitfund"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_FILE="/usr/src/app/data/chitfund.db"

mkdir -p "$BACKUP_DIR"

# SQLite safe online backup via VACUUM INTO
node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('$DB_FILE');
  db.exec(\"VACUUM INTO '$BACKUP_DIR/chitfund_$TIMESTAMP.db'\");
  console.log('Online backup created successfully: chitfund_$TIMESTAMP.db');
"

# Compress backup
gzip -9 "$BACKUP_DIR/chitfund_$TIMESTAMP.db"

# Retain backups for 30 days
find "$BACKUP_DIR" -type f -name "chitfund_*.db.gz" -mtime +30 -delete
```

Add to cron (`crontab -e`):
```cron
# Run daily online backup at 02:00 AM UTC
0 2 * * * /bin/bash /usr/src/app/scripts/backup.sh >> /var/log/chitfund_backup.log 2>&1
```

---

## 7. Security Hardening & Production Checklist

- [x] **Zero External Vulnerabilities:** Native Node.js built-ins eliminate npm supply chain risks (e.g. malicious dependencies).
- [x] **DPDP Act 2023 Masking:** Aadhaar number stored with only last 4 digits (`XXXX-XXXX-XXXX`).
- [x] **Password Protection:** PBKDF2 with 10,000 iterations, 64-byte salt, SHA-512.
- [x] **Maker-Checker Segregation:** Finance Admin cannot approve a payout they initiated as Operations Maker.
- [x] **Statutory Financial Controls:** 30% statutory max bid discount cap enforced by DB constraints and application validation.
- [x] **Immutable Ledger Invariant:** Double-entry journal balance $\sum \text{Debits} = \sum \text{Credits}$ enforced on every commit.

---

## 8. Monitoring & Health Probes

### Health Check Endpoint
The platform exposes `/api/localities` as an unauthenticated HTTP GET endpoint.
```bash
curl -f -s http://localhost:3000/api/localities > /dev/null && echo "HEALTHY" || echo "UNHEALTHY"
```

### Log Inspection
All HTTP requests, errors, and audit events print structured timestamped entries:
```
[2026-10-25T06:14:22.100Z] POST /api/auth/login 200 (4.2ms)
[2026-10-25T06:14:25.800Z] POST /api/host/verify-cash 200 (6.1ms)
```
