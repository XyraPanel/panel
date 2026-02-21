#!/usr/bin/env bash
# XyraPanel — bare-metal installer (Ubuntu 22.04 / 24.04)
# bash <(curl -fsSL https://raw.githubusercontent.com/XyraPanel/panel/main/scripts/install.sh)

set -euo pipefail

RESET=$'\033[0m'; BOLD=$'\033[1m'; DIM=$'\033[2m'
RB=$'\033[91m'; RED=$'\033[31m'; WHITE=$'\033[97m'
GRAY=$'\033[90m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
DIVIDER="${DIM}$(printf '─%.0s' {1..58})${RESET}"

log_info()    { echo -e "  ${GRAY}ℹ${RESET}  $*"; }
log_success() { echo -e "  ${GREEN}✔${RESET}  $*"; }
log_warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
log_error()   { echo -e "  ${RB}✖${RESET}  $*" >&2; exit 1; }
log_start()   { echo -e "  ${GRAY}◌${RESET}  ${DIM}$*${RESET}"; }
log_step()    { echo -e "\n${RED}${BOLD}▶${RESET}${BOLD} $*${RESET}"; }

REPO_URL="https://github.com/XyraPanel/panel"
INSTALL_DIR="/opt/xyrapanel"
PANEL_USER="xyrapanel"
NODE_VERSION="22"
PG_VERSION="16"

[[ $EUID -ne 0 ]] && log_error "Run as root or with sudo."
[[ -f /etc/os-release ]] && { source /etc/os-release; [[ "$ID" != "ubuntu" ]] && log_warn "Targets Ubuntu — proceeding anyway."; }
TOTAL_RAM_MB=$(awk '/MemTotal/{printf "%d",$2/1024}' /proc/meminfo)
(( TOTAL_RAM_MB < 512 )) && log_error "Insufficient RAM: ${TOTAL_RAM_MB}MB (min 512MB)."

# banner
echo -e "
${RB}${BOLD}██╗  ██╗ ██╗   ██╗ ██████╗  █████╗ ██████╗  █████╗ ███╗   ██╗███████╗██╗${RESET}  ${DIM}Production Installer${RESET}
${RB}${BOLD}╚██╗██╔╝ ╚██╗ ██╔╝ ██╔══██╗██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔════╝██║${RESET}  ${DIM}by @26bz & contributors${RESET}
${RB}${BOLD} ╚███╔╝   ╚████╔╝  ██████╔╝███████║██████╔╝███████║██╔██╗ ██║█████╗  ██║${RESET}
${RB}${BOLD} ██╔██╗    ╚██╔╝   ██╔══██╗██╔══██║██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║${RESET}
${RB}${BOLD}██╔╝ ██╗    ██║    ██║  ██║██║  ██║██║     ██║  ██║██║ ╚████║███████╗███████╗${RESET}
${RB}${BOLD}╚═╝  ╚═╝    ╚═╝    ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝${RESET}
$DIVIDER"

log_step "Configuration"; echo

prompt() {
  local var="$1" msg="$2" default="$3" secret="${4:-false}"
  [[ "$secret" == "true" ]] \
    && { read -rsp "  ${GRAY}•${RESET} ${WHITE}${msg}${RESET} ${DIM}[hidden]${RESET}: " input; echo; } \
    || read -rp "  ${GRAY}•${RESET} ${WHITE}${msg}${RESET} ${DIM}[${default}]${RESET}: " input
  printf -v "$var" '%s' "${input:-$default}"
}

prompt DOMAIN            "Domain"             "panel.example.com"
prompt ADMIN_EMAIL       "Admin email"        "admin@example.com"
prompt ADMIN_PASSWORD    "Admin password"     "changeme"                true
prompt ADMIN_USERNAME    "Admin username"     "admin"
prompt ADMIN_NAME        "Admin display name" "Admin"
prompt DB_PASSWORD       "Database password"  "$(openssl rand -hex 16)" true
prompt LETSENCRYPT_EMAIL "Let's Encrypt email" "$ADMIN_EMAIL"

BETTER_AUTH_SECRET=$(openssl rand -base64 32)
SEED_SECRET=$(openssl rand -base64 32)

echo -e "\n$DIVIDER"
log_info "Domain     ${GRAY}•${RESET} ${WHITE}${DOMAIN}${RESET}"
log_info "Admin      ${GRAY}•${RESET} ${WHITE}${ADMIN_EMAIL}${RESET} ${DIM}(${ADMIN_USERNAME})${RESET}"
log_info "Install to ${GRAY}•${RESET} ${WHITE}${INSTALL_DIR}${RESET}"
echo -e "$DIVIDER\n"
read -rp "  ${BOLD}Proceed with installation? [Y/n]:${RESET} " CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && { log_info "Aborted."; exit 0; }

# ensure swap exists before any heavy operations
if [[ ! -f /swapfile ]]; then
  if (( TOTAL_RAM_MB < 1536 )); then SWAP_SIZE=2G
  elif (( TOTAL_RAM_MB < 3072 )); then SWAP_SIZE=1G
  else SWAP_SIZE=512M; fi
  log_start "Creating ${SWAP_SIZE} swapfile"
  fallocate -l $SWAP_SIZE /swapfile && chmod 600 /swapfile && mkswap /swapfile -q && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' >> /etc/sysctl.conf && sysctl -p >/dev/null
fi

# step 1 — system packages
log_step "System dependencies"
export DEBIAN_FRONTEND=noninteractive
rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql.gpg
apt-get update -qq
apt-get install -y -qq curl wget git ca-certificates gnupg lsb-release openssl ufw build-essential python3 2>/dev/null
log_success "Base packages ready"

# step 2 — node.js + pnpm + pm2
log_step "Node.js ${NODE_VERSION}"
if command -v node &>/dev/null && node -e "process.exit(parseInt(process.version.slice(1))>=${NODE_VERSION}?0:1)" 2>/dev/null; then
  log_success "Node.js $(node -v) already installed"
else
  log_start "Adding NodeSource repository"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
  log_success "Node.js $(node -v) installed"
fi
corepack disable 2>/dev/null || true
PNPM_BIN="/usr/local/bin/pnpm"
if [[ ! -x "$PNPM_BIN" ]] || ! "$PNPM_BIN" -v &>/dev/null; then
  log_start "Installing pnpm"
  curl -fsSL "https://github.com/pnpm/pnpm/releases/latest/download/pnpm-linux-x64" -o "$PNPM_BIN"
  chmod +x "$PNPM_BIN"
fi
PNPM_VER="$($PNPM_BIN -v)" || log_error "pnpm binary broken at: $PNPM_BIN"
log_success "pnpm ${PNPM_VER} ready"
if ! command -v pm2 &>/dev/null; then
  log_start "Installing PM2"
  npm install -g pm2@latest --silent
fi
PM2_BIN="$(which pm2)"
log_success "PM2 $($PM2_BIN -v) ready"

# step 3 — postgresql
log_step "PostgreSQL ${PG_VERSION}"
if ! command -v psql &>/dev/null; then
  log_start "Adding PostgreSQL APT repository"
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  set +e; apt-get update -qq 2>/dev/null; PGDG_UPDATE=$?; set -e
  if [[ $PGDG_UPDATE -eq 0 ]]; then
    apt-get install -y -qq "postgresql-${PG_VERSION}"
  else
    log_warn "pgdg repo not available for $(lsb_release -cs) — falling back to distro PostgreSQL"
    rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql.gpg
    apt-get update -qq
    apt-get install -y -qq postgresql postgresql-client
  fi
  systemctl enable postgresql 2>/dev/null || true
  systemctl start postgresql 2>/dev/null || \
    systemctl start "postgresql@$(pg_lsclusters -h 2>/dev/null | awk '{print $1"-"$2}' | head -1)-main" 2>/dev/null || true
  sleep 2
  log_success "PostgreSQL installed"
else
  log_success "PostgreSQL already installed"
fi
log_start "Creating DB user and database"
sudo -u postgres psql -c "CREATE USER xyrapanel WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE xyrapanel OWNER xyrapanel;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE xyrapanel TO xyrapanel;" 2>/dev/null || true
log_success "Database ${WHITE}xyrapanel${RESET} ready"

# step 4 — redis
log_step "Redis"
if ! command -v redis-server &>/dev/null; then
  apt-get install -y -qq redis-server
  sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
  systemctl enable --now redis-server
fi
log_success "Redis ready"

# step 5 — nginx + certbot
log_step "Nginx & Certbot"
apt-get install -y -qq nginx certbot python3-certbot-nginx
systemctl enable nginx
log_success "Nginx & Certbot ready"

# step 6 — system user
log_step "System user"
id "$PANEL_USER" &>/dev/null \
  && log_success "User ${WHITE}${PANEL_USER}${RESET} already exists" \
  || { useradd --system --shell /bin/bash --create-home --home-dir "$INSTALL_DIR" "$PANEL_USER"; log_success "User ${WHITE}${PANEL_USER}${RESET} created"; }
cat > /etc/sudoers.d/xyrapanel <<SUDOEOF
${PANEL_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /bin/systemctl, /usr/bin/journalctl
SUDOEOF
chmod 440 /etc/sudoers.d/xyrapanel

# step 7 — clone / update repo
log_step "XyraPanel source"
git config --global --add safe.directory "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_start "Existing install found — pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
  chown -R "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR" 2>/dev/null || true
else
  [[ -d "$INSTALL_DIR" ]] && { log_warn "Removing incomplete directory ${INSTALL_DIR}"; rm -rf "$INSTALL_DIR"; }
  log_start "Cloning ${REPO_URL}"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  chown -R "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
log_success "Source ready at ${WHITE}${INSTALL_DIR}${RESET}"

# step 8 — write .env
log_step "Generating .env"
if [[ -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.bak.$(date +%s)"
  log_warn "Backed up existing .env ${DIM}(see .env.bak.*)${RESET}"
fi
cat > "$INSTALL_DIR/.env" <<EOF
# XyraPanel — generated by installer $(date -u +"%Y-%m-%dT%H:%M:%SZ")
APP_NAME="XyraPanel"
NODE_ENV="production"
DEBUG=false

BETTER_AUTH_URL=https://${DOMAIN}
BETTER_AUTH_TRUSTED_ORIGINS=https://${DOMAIN}
NUXT_PUBLIC_APP_URL=https://${DOMAIN}
PANEL_PUBLIC_URL="https://${DOMAIN}"
PANEL_INTERNAL_URL="http://127.0.0.1:3000"
PORT="3000"

BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
SEED_SECRET=${SEED_SECRET}

SEED_ADMIN_EMAIL="${ADMIN_EMAIL}"
SEED_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
SEED_ADMIN_USERNAME="${ADMIN_USERNAME}"
SEED_ADMIN_NAME="${ADMIN_NAME}"

DATABASE_URL="postgresql://xyrapanel:${DB_PASSWORD}@127.0.0.1:5432/xyrapanel"
DB_USER="xyrapanel"
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME="xyrapanel"

REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
NITRO_STORAGE_CACHE_DRIVER="redis"
NITRO_STORAGE_CACHE_HOST="127.0.0.1"
NITRO_STORAGE_CACHE_PORT="6379"
NUXT_REDIS_HOST="127.0.0.1"
NUXT_REDIS_PORT="6379"

NUXT_SECURITY_CORS_ORIGIN="https://${DOMAIN}"
NUXT_SECURITY_CONNECT_SRC="https://${DOMAIN}"
NUXT_SECURITY_RATE_LIMIT_DRIVER="redis"
NUXT_SECURITY_RATE_LIMIT_TOKENS="1000"
NUXT_SECURITY_RATE_LIMIT_INTERVAL_MS="60000"
NUXT_SECURITY_CSP_REPORT_ONLY="false"
NUXT_SECURITY_CSP_REPORT_URI=""

NUXT_HTTP_CACHE_ENABLED="true"
NUXT_HTTP_CACHE_DEFAULT_MAX_AGE="5"
NUXT_HTTP_CACHE_DEFAULT_SWR="15"
NUXT_HTTP_CACHE_DASHBOARD_MAX_AGE="10"
NUXT_HTTP_CACHE_DASHBOARD_SWR="30"
NUXT_HTTP_CACHE_ADMIN_DASHBOARD_MAX_AGE="10"
NUXT_HTTP_CACHE_ADMIN_DASHBOARD_SWR="30"
NUXT_HTTP_CACHE_ADMIN_NODE_MAX_AGE="5"
NUXT_HTTP_CACHE_ADMIN_NODE_SWR="15"

CAPTCHA_PROVIDER="turnstile"
NUXT_TURNSTILE_SECRET_KEY=""
NUXT_PUBLIC_TURNSTILE_SITE_KEY=""

NUXT_MAX_REQUEST_SIZE_MB="10"
NUXT_MAX_UPLOAD_SIZE_MB="20"
EOF

chmod 600 "$INSTALL_DIR/.env"
chown "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR/.env"
log_success ".env written ${DIM}(chmod 600)${RESET}"

# step 9 — install & build
cd "$INSTALL_DIR"
GIT_HASH=$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || echo "unknown")
BUILD_HASH_FILE="$INSTALL_DIR/.output/.build-hash"
BUILD_HASH=$(cat "$BUILD_HASH_FILE" 2>/dev/null || echo "")
if [[ -f "$INSTALL_DIR/.output/server/index.mjs" && "$GIT_HASH" == "$BUILD_HASH" ]]; then
  log_success "Build up-to-date (${GIT_HASH:0:7}) — skipping install & build"
else
  log_step "Installing dependencies"
  corepack disable 2>/dev/null || true
  node -e "const fs=require('fs'),p='$INSTALL_DIR/package.json',j=JSON.parse(fs.readFileSync(p));delete j.packageManager;fs.writeFileSync(p,JSON.stringify(j,null,2))" 2>/dev/null || true
  if [[ -f "$INSTALL_DIR/.output/server/index.mjs" ]]; then
    "$PNPM_BIN" install --no-frozen-lockfile
  else
    "$PNPM_BIN" install --frozen-lockfile
  fi
  log_success "Dependencies installed"
  log_step "Building panel ${DIM}(takes a few minutes — uses swap)${RESET}"
  NODE_OPTIONS="--max-old-space-size=4096" "$PNPM_BIN" build
  echo "$GIT_HASH" > "$BUILD_HASH_FILE"
  log_success "Build complete"
fi
chown -R "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR"

# step 10 — firewall
log_step "Firewall"
ufw --force enable
ufw allow 22/tcp comment "SSH" >/dev/null
ufw allow 80/tcp comment "HTTP" >/dev/null
ufw allow 443/tcp comment "HTTPS" >/dev/null
ufw reload >/dev/null
log_success "ufw ${GRAY}•${RESET} ports 22 80 443 open"

# step 11 — nginx config
log_step "Nginx configuration"
mkdir -p /var/www/certbot
cat > /etc/nginx/sites-available/xyrapanel <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    client_max_body_size 25M;
    proxy_read_timeout   300s;
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINXEOF
ln -sf /etc/nginx/sites-available/xyrapanel /etc/nginx/sites-enabled/xyrapanel
rm -f /etc/nginx/sites-enabled/default
# temp HTTP-only config for ACME challenge
cat > /etc/nginx/sites-available/xyrapanel-tmp <<TMPEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
TMPEOF
ln -sf /etc/nginx/sites-available/xyrapanel-tmp /etc/nginx/sites-enabled/xyrapanel
nginx -t && systemctl reload nginx
log_success "Nginx serving HTTP for ACME challenge"

# step 12 — tls certificate
log_step "TLS certificate ${DIM}(${DOMAIN})${RESET}"
certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email --non-interactive \
  && CERT_OK=true || CERT_OK=false
if [[ "$CERT_OK" == "true" ]]; then
  ln -sf /etc/nginx/sites-available/xyrapanel /etc/nginx/sites-enabled/xyrapanel
  rm -f /etc/nginx/sites-available/xyrapanel-tmp
  nginx -t && systemctl reload nginx
  log_success "TLS certificate issued for ${WHITE}${DOMAIN}${RESET}"
else
  log_warn "Let's Encrypt failed ${DIM}(DNS not pointed yet?)${RESET}"
  log_warn "Re-run: ${DIM}certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} --email ${LETSENCRYPT_EMAIL} --agree-tos --no-eff-email${RESET}"
  log_warn "Then:   ${DIM}ln -sf /etc/nginx/sites-available/xyrapanel /etc/nginx/sites-enabled/xyrapanel && systemctl reload nginx${RESET}"
fi

# step 13 — start with pm2 (runs as root; app drops no privileges but is isolated by firewall)
log_step "Starting XyraPanel with PM2"
cd "$INSTALL_DIR"
# write a Node.js launcher that loads .env then starts the server — compatible with PM2 cluster mode
cat > "$INSTALL_DIR/start.mjs" <<'STARTEOF'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = '/opt/xyrapanel/.env'
try {
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
} catch {}

await import('/opt/xyrapanel/.output/server/index.mjs')
STARTEOF
pm2 delete xyrapanel 2>/dev/null || true
pm2 start "$INSTALL_DIR/start.mjs" --name xyrapanel -i max
pm2 save
env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u root --hp /root | tail -1 | bash
log_success "PM2 started and registered for boot"
log_start "Waiting for app to be ready"
for i in $(seq 1 60); do
  curl -sf http://127.0.0.1:3000 >/dev/null 2>&1 && break
  printf "${GRAY}.${RESET}"; sleep 2
done
echo; log_success "App is responding on port 3000"

# step 14 — seed admin
log_step "Seeding admin account"
SEED_SECRET_VAL=$(grep '^SEED_SECRET=' "$INSTALL_DIR/.env" | sed 's/^SEED_SECRET=//')
for i in $(seq 1 20); do
  HTTP_CODE=$(curl -s -o /tmp/seed-response.json -w "%{http_code}" \
    -X POST "http://127.0.0.1:3000/api/system/seed" \
    -H "Authorization: Bearer ${SEED_SECRET_VAL}" \
    -H "Content-Type: application/json")
  [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "409" ]] && break
  sleep 3
done
if [[ "$HTTP_CODE" == "200" ]]; then
  log_success "Admin created ${GRAY}•${RESET} ${WHITE}${ADMIN_EMAIL}${RESET}"
elif [[ "$HTTP_CODE" == "409" ]]; then
  log_success "Admin already exists ${GRAY}•${RESET} ${WHITE}${ADMIN_EMAIL}${RESET}"
else
  log_warn "Seed returned HTTP ${HTTP_CODE} — check logs with: pm2 logs xyrapanel"
  cat /tmp/seed-response.json 2>/dev/null || true
fi

# step 15 — cert renewal cron
log_step "Certificate auto-renewal"
( crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
log_success "Cron added ${GRAY}•${RESET} ${DIM}daily at 03:00${RESET}"

# done
echo -e "
$DIVIDER
  ${GREEN}${BOLD}✔${RESET}${BOLD}  XyraPanel installed successfully${RESET}
$DIVIDER

  ${RB}${BOLD}Panel URL${RESET}      ${WHITE}https://${DOMAIN}${RESET}
  ${BOLD}Admin email${RESET}    ${WHITE}${ADMIN_EMAIL}${RESET}
  ${BOLD}Install dir${RESET}    ${DIM}${INSTALL_DIR}${RESET}

  ${BOLD}Commands${RESET}
    ${GRAY}•${RESET} ${DIM}pm2 status${RESET}
    ${GRAY}•${RESET} ${DIM}pm2 logs xyrapanel${RESET}
    ${GRAY}•${RESET} ${DIM}pm2 restart xyrapanel${RESET}
    ${GRAY}•${RESET} ${DIM}systemctl status nginx${RESET}

  ${YELLOW}${BOLD}Next steps${RESET}
    1. Point DNS A record ${WHITE}${DOMAIN}${RESET} ${GRAY}→${RESET} this server's IP
    2. Add Cloudflare Turnstile keys to ${DIM}${INSTALL_DIR}/.env${RESET}
    3. Change admin password if you left it as ${DIM}changeme${RESET}

  ${RB}${BOLD}Save this — SEED_SECRET:${RESET}
    ${DIM}${SEED_SECRET}${RESET}

$DIVIDER"
