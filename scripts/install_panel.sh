#!/usr/bin/env bash
# XyraPanel — fresh install
# Called by install.sh — expects OS_ID, PKG_MANAGER, FIREWALL, TOTAL_RAM_MB to be exported

set -euo pipefail
SCRIPTS_BASE="https://raw.githubusercontent.com/XyraPanel/panel/main/scripts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
COMMON_LOCAL="${SCRIPT_DIR}/common.sh"
if [[ -f "$COMMON_LOCAL" ]]; then
  source "$COMMON_LOCAL"
else
  source <(curl -fsSL "${SCRIPTS_BASE}/common.sh")
fi

# prompts
log_step "Configuration"; echo

prompt() {
  local var="$1" msg="$2" default="$3" secret="${4:-false}"
  [[ "$secret" == "true" ]] \
    && { read -rsp "  ${GRAY}•${RESET} ${WHITE}${msg}${RESET} ${DIM}[hidden]${RESET}: " input; echo; } \
    || read -rp  "  ${GRAY}•${RESET} ${WHITE}${msg}${RESET} ${DIM}[${default}]${RESET}: " input
  printf -v "$var" '%s' "${input:-$default}"
}

prompt_confirm() {
  local var="$1" msg="$2" default="$3"
  while true; do
    read -rsp "  ${GRAY}•${RESET} ${WHITE}${msg}${RESET} ${DIM}[hidden]${RESET}: " input; echo
    local value="${input:-$default}"
    read -rsp "  ${GRAY}•${RESET} ${WHITE}Confirm ${msg,,}${RESET} ${DIM}[hidden]${RESET}: " input2; echo
    local value2="${input2:-$default}"
    if [[ "$value" == "$value2" ]]; then
      printf -v "$var" '%s' "$value"
      break
    fi
    echo -e "  ${RB}✖${RESET}  Passwords do not match — try again\n"
  done
}

prompt DOMAIN            "Domain"              "panel.example.com"
prompt ADMIN_EMAIL       "Admin email"         "admin@example.com"
prompt ADMIN_USERNAME    "Admin username"      "admin"
prompt_confirm ADMIN_PASSWORD "Admin password"    "changeme"
ADMIN_NAME="$ADMIN_USERNAME"
prompt_confirm DB_PASSWORD    "Database password" "$(openssl rand -hex 16)"
prompt LETSENCRYPT_EMAIL "Let's Encrypt email" "$ADMIN_EMAIL"

BETTER_AUTH_SECRET=$(openssl rand -base64 32)
SEED_SECRET=$(openssl rand -base64 32)

echo -e "\n$DIVIDER"
log_info "Distro     ${GRAY}•${RESET} ${WHITE}${PRETTY_NAME}${RESET}"
log_info "Domain     ${GRAY}•${RESET} ${WHITE}${DOMAIN}${RESET}"
log_info "Admin      ${GRAY}•${RESET} ${WHITE}${ADMIN_EMAIL}${RESET} ${DIM}(${ADMIN_USERNAME})${RESET}"
log_info "Install to ${GRAY}•${RESET} ${WHITE}${INSTALL_DIR}${RESET}"
echo -e "$DIVIDER\n"
read -rp "  ${BOLD}Proceed with installation? [Y/n]:${RESET} " CONFIRM
[[ "${CONFIRM,,}" == "n" ]] && { log_info "Aborted."; exit 0; }

# swap
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
pkg_update
if [[ "$PKG_MANAGER" == "apt" ]]; then
  pkg_install curl wget git ca-certificates gnupg lsb-release openssl build-essential python3
else
  dnf install -y -q epel-release
  dnf groupinstall -y -q "Development Tools"
  pkg_install curl wget git ca-certificates gnupg openssl python3
fi
log_success "Base packages ready"

# step 2 — node.js + pnpm + pm2
log_step "Node.js ${NODE_VERSION}"
if command -v node &>/dev/null && node -e "process.exit(parseInt(process.version.slice(1))>=${NODE_VERSION}?0:1)" 2>/dev/null; then
  log_success "Node.js $(node -v) already installed"
else
  log_start "Adding NodeSource repository"
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  else
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | bash - >/dev/null 2>&1
  fi
  pkg_install nodejs
  log_success "Node.js $(node -v) installed"
fi

corepack disable 2>/dev/null || true
if [[ ! -x "$PNPM_BIN" ]] || ! "$PNPM_BIN" -v &>/dev/null; then
  log_start "Installing pnpm"
  curl -fsSL "https://github.com/pnpm/pnpm/releases/latest/download/pnpm-linux-x64" -o "$PNPM_BIN"
  chmod +x "$PNPM_BIN"
fi
log_success "pnpm $("$PNPM_BIN" -v) ready"

if ! command -v pm2 &>/dev/null; then
  log_start "Installing PM2"
  npm install -g pm2@latest --silent
fi
log_success "PM2 $(pm2 -v) ready"

# step 3 — postgresql
log_step "PostgreSQL ${PG_VERSION}"
if ! command -v psql &>/dev/null; then
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    log_start "Adding PostgreSQL APT repository"
    rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql.gpg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
    echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    set +e; apt-get update -qq 2>/dev/null; PGDG_UPDATE=$?; set -e
    if [[ $PGDG_UPDATE -eq 0 ]]; then
      pkg_install "postgresql-${PG_VERSION}"
    else
      log_warn "pgdg repo unavailable — falling back to distro PostgreSQL"
      rm -f /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql.gpg
      apt-get update -qq; pkg_install postgresql postgresql-client
    fi
  else
    log_start "Adding PostgreSQL DNF repository"
    dnf install -y -q "https://download.postgresql.org/pub/repos/yum/reporpms/EL-${OS_MAJOR}-x86_64/pgdg-redhat-repo-latest.noarch.rpm" 2>/dev/null || true
    dnf -qy module disable postgresql 2>/dev/null || true
    pkg_install "postgresql${PG_VERSION}-server" "postgresql${PG_VERSION}"
    "/usr/pgsql-${PG_VERSION}/bin/postgresql-${PG_VERSION}-setup" initdb 2>/dev/null || true
  fi
  systemctl enable "postgresql" 2>/dev/null || systemctl enable "postgresql-${PG_VERSION}" 2>/dev/null || true
  systemctl start  "postgresql" 2>/dev/null || systemctl start  "postgresql-${PG_VERSION}" 2>/dev/null || true
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
if ! command -v redis-server &>/dev/null && ! command -v redis-cli &>/dev/null; then
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    pkg_install redis-server
    sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
    systemctl enable --now redis-server
  else
    pkg_install redis
    sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis.conf
    systemctl enable --now redis
  fi
fi
log_success "Redis ready"

# step 5 — nginx + certbot
log_step "Nginx & Certbot"
if [[ "$PKG_MANAGER" == "apt" ]]; then
  pkg_install nginx certbot python3-certbot-nginx
else
  pkg_install nginx
  if ! command -v certbot &>/dev/null; then
    if command -v snap &>/dev/null; then
      snap install --classic certbot
      ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
    else
      pkg_install certbot python3-certbot-nginx 2>/dev/null || \
        log_warn "certbot not installed — install manually after setup"
    fi
  fi
  command -v setsebool &>/dev/null && setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi
systemctl enable nginx
log_success "Nginx & Certbot ready"

# step 6 — firewall
log_step "Firewall"
if [[ "$FIREWALL" == "ufw" ]]; then
  pkg_install ufw 2>/dev/null || true
  ufw --force enable
  ufw allow 22/tcp comment "SSH"    >/dev/null
  ufw allow 80/tcp comment "HTTP"   >/dev/null
  ufw allow 443/tcp comment "HTTPS" >/dev/null
  ufw allow 8080/tcp comment "Wings daemon" >/dev/null
  ufw reload >/dev/null
  log_success "ufw ${GRAY}•${RESET} ports 22 80 443 8080 open"
else
  systemctl enable --now firewalld
  firewall-cmd --permanent --add-service=ssh   >/dev/null
  firewall-cmd --permanent --add-service=http  >/dev/null
  firewall-cmd --permanent --add-service=https >/dev/null
  firewall-cmd --permanent --add-port=8080/tcp >/dev/null
  firewall-cmd --reload >/dev/null
  log_success "firewalld ${GRAY}•${RESET} ports 22 80 443 8080 open"
fi

# step 7 — system user
log_step "System user"
id "$PANEL_USER" &>/dev/null \
  && log_success "User ${WHITE}${PANEL_USER}${RESET} already exists" \
  || { useradd --system --shell /bin/bash --create-home --home-dir "$INSTALL_DIR" "$PANEL_USER"
       log_success "User ${WHITE}${PANEL_USER}${RESET} created"; }
cat > /etc/sudoers.d/xyrapanel <<EOF
${PANEL_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /bin/systemctl, /usr/bin/journalctl
EOF
chmod 440 /etc/sudoers.d/xyrapanel

# step 8 — clone repo
log_step "XyraPanel source"
git config --global --add safe.directory "$INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  log_start "Pulling latest"
  git -C "$INSTALL_DIR" stash --include-untracked 2>/dev/null || true
  git -C "$INSTALL_DIR" pull --ff-only
else
  [[ -d "$INSTALL_DIR" ]] && { log_warn "Removing incomplete dir"; rm -rf "$INSTALL_DIR"; }
  log_start "Cloning ${REPO_URL}"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
chown -R "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR"
cd "$INSTALL_DIR"
log_success "Source ready at ${WHITE}${INSTALL_DIR}${RESET}"

# step 9 — write .env
log_step "Generating .env"
[[ -f "$INSTALL_DIR/.env" ]] && cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.bak.$(date +%s)" && \
  log_warn "Backed up existing .env"
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

# step 10 — install & build
cd "$INSTALL_DIR"
GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BUILD_HASH_FILE="$INSTALL_DIR/.output/.build-hash"
BUILD_HASH=$(cat "$BUILD_HASH_FILE" 2>/dev/null || echo "")

if [[ -f "$INSTALL_DIR/.output/server/index.mjs" && "$GIT_HASH" == "$BUILD_HASH" ]]; then
  log_success "Build already up-to-date — skipping"
else
  log_step "Installing dependencies"
  corepack disable 2>/dev/null || true
  export COREPACK_ENABLE_STRICT=0
  [[ -f "$INSTALL_DIR/.output/server/index.mjs" ]] \
    && "$PNPM_BIN" install --no-frozen-lockfile \
    || "$PNPM_BIN" install --frozen-lockfile
  log_success "Dependencies installed"

  log_step "Generating PWA assets"
  "$PNPM_BIN" run generate-pwa-assets
  log_success "PWA assets generated"

  log_step "Building panel ${DIM}(takes a few minutes)${RESET}"
  NODE_OPTIONS="--max-old-space-size=4096" "$PNPM_BIN" build
  echo "$GIT_HASH" > "$BUILD_HASH_FILE"
  log_success "Build complete"
fi
chown -R "${PANEL_USER}:${PANEL_USER}" "$INSTALL_DIR"

# step 11 — nginx
log_step "Nginx configuration"
mkdir -p /var/www/certbot

if [[ "$PKG_MANAGER" == "apt" ]]; then
  NGINX_CONF_DIR="/etc/nginx/sites-available"
  NGINX_ENAB_DIR="/etc/nginx/sites-enabled"
  mkdir -p "$NGINX_CONF_DIR" "$NGINX_ENAB_DIR"
  rm -f "${NGINX_ENAB_DIR}/default"
else
  NGINX_CONF_DIR="/etc/nginx/conf.d"
  NGINX_ENAB_DIR="/etc/nginx/conf.d"
  rm -f /etc/nginx/conf.d/default.conf
fi

cat > "${NGINX_CONF_DIR}/xyrapanel.conf" <<NGINXEOF
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

# temp config for ACME challenge (no cert yet)
cat > "${NGINX_CONF_DIR}/xyrapanel-tmp.conf" <<TMPEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
TMPEOF

if [[ "$PKG_MANAGER" == "apt" ]]; then
  ln -sf "${NGINX_CONF_DIR}/xyrapanel-tmp.conf" "${NGINX_ENAB_DIR}/xyrapanel.conf"
else
  mv "${NGINX_CONF_DIR}/xyrapanel.conf" "${NGINX_CONF_DIR}/xyrapanel.conf.pending"
fi
nginx -t && systemctl reload nginx
log_success "Nginx serving HTTP for ACME challenge"

# step 12 — tls cert
log_step "TLS certificate ${DIM}(${DOMAIN})${RESET}"
certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" \
  --agree-tos --no-eff-email --non-interactive \
  && CERT_OK=true || CERT_OK=false

if [[ "$CERT_OK" == "true" ]]; then
  if [[ "$PKG_MANAGER" == "apt" ]]; then
    ln -sf "${NGINX_CONF_DIR}/xyrapanel.conf" "${NGINX_ENAB_DIR}/xyrapanel.conf"
    rm -f "${NGINX_CONF_DIR}/xyrapanel-tmp.conf"
  else
    mv "${NGINX_CONF_DIR}/xyrapanel.conf.pending" "${NGINX_CONF_DIR}/xyrapanel.conf"
    rm -f "${NGINX_CONF_DIR}/xyrapanel-tmp.conf"
  fi
  nginx -t && systemctl reload nginx
  log_success "TLS certificate issued for ${WHITE}${DOMAIN}${RESET}"
else
  [[ "$PKG_MANAGER" != "apt" && -f "${NGINX_CONF_DIR}/xyrapanel.conf.pending" ]] && \
    mv "${NGINX_CONF_DIR}/xyrapanel.conf.pending" "${NGINX_CONF_DIR}/xyrapanel.conf"
  log_warn "Let's Encrypt failed — DNS not pointed yet?"
  log_warn "Re-run: ${DIM}certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} --email ${LETSENCRYPT_EMAIL} --agree-tos --no-eff-email${RESET}"
  log_warn "Then:   ${DIM}systemctl reload nginx${RESET}"
fi

# step 13 — pm2
log_step "Starting XyraPanel with PM2"
cat > "$INSTALL_DIR/start.mjs" <<'STARTEOF'
import { readFileSync } from 'fs'
const envPath = '/opt/xyrapanel/.env'
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('='); if (idx === -1) continue
    const key = t.slice(0, idx).trim()
    let val = t.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (!(key in process.env)) process.env[key] = val
  }
} catch {}
await import('/opt/xyrapanel/.output/server/index.mjs')
STARTEOF

pm2 delete xyrapanel 2>/dev/null || true
INSTANCES=${INSTANCES:-1}
pm2 start "$INSTALL_DIR/start.mjs" --name xyrapanel -i "$INSTANCES"
pm2 save
env PATH="$PATH:/usr/bin:/usr/local/bin" pm2 startup systemd -u root --hp /root | grep -E '^sudo|^env ' | bash || true
log_success "PM2 started and registered for boot"

log_start "Waiting for app to be ready"
APP_PORT=${PORT:-3000}
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${APP_PORT}" >/dev/null 2>&1 && break
  printf "${GRAY}.${RESET}"; sleep 2
done
echo; log_success "App is responding on port ${APP_PORT}"
sleep 10

# step 14 — seed admin
log_step "Seeding admin account"
SEED_SECRET_VAL=$(grep '^SEED_SECRET=' "$INSTALL_DIR/.env" | sed 's/^SEED_SECRET=//')
for i in $(seq 1 30); do
  HTTP_CODE=$(curl -s -o /tmp/seed-response.json -w "%{http_code}" \
    -X POST "http://127.0.0.1:3000/api/system/seed" \
    -H "Authorization: Bearer ${SEED_SECRET_VAL}" \
    -H "Content-Type: application/json")
  [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "409" ]] && break
  printf "${GRAY}.${RESET}"; sleep 5
done
echo
if   [[ "$HTTP_CODE" == "200" ]]; then log_success "Admin created ${GRAY}•${RESET} ${WHITE}${ADMIN_EMAIL}${RESET}"
elif [[ "$HTTP_CODE" == "409" ]]; then log_success "Admin already exists"
else log_warn "Seed returned HTTP ${HTTP_CODE} — run: pm2 logs xyrapanel"
     cat /tmp/seed-response.json 2>/dev/null || true; fi

# step 15 — cert renewal cron
log_step "Certificate auto-renewal"
( crontab -l 2>/dev/null | grep -v "certbot renew"
  echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'" ) | crontab -
log_success "Cron added ${GRAY}•${RESET} ${DIM}daily at 03:00${RESET}"

echo -e "
$DIVIDER
  ${GREEN}${BOLD}✔${RESET}${BOLD}  XyraPanel installed successfully${RESET}
$DIVIDER

  ${RB}${BOLD}Panel URL${RESET}      ${WHITE}https://${DOMAIN}${RESET}
  ${BOLD}Admin email${RESET}    ${WHITE}${ADMIN_EMAIL}${RESET}
  ${BOLD}Install dir${RESET}    ${DIM}${INSTALL_DIR}${RESET}
  ${BOLD}Distro${RESET}         ${DIM}${PRETTY_NAME}${RESET}

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