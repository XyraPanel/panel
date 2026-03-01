#!/usr/bin/env bash
# XyraPanel — uninstall
# Called by install.sh — expects PKG_MANAGER, FIREWALL etc to be exported

set -euo pipefail
:
: "${INSTALL_DIR:=/opt/xyrapanel}"
: "${PANEL_USER:=xyrapanel}"
: "${PKG_MANAGER:=apt}"
: "${FIREWALL:=ufw}"
SCRIPTS_BASE="https://raw.githubusercontent.com/XyraPanel/panel/main/scripts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || echo "")"
if [[ -f "${SCRIPT_DIR}/common.sh" ]]; then
  source "${SCRIPT_DIR}/common.sh"
else
  source <(curl -fsSL "${SCRIPTS_BASE}/common.sh")
fi

echo -e "\n$DIVIDER"
echo -e "  ${RB}${BOLD}This will permanently remove XyraPanel and all its data.${RESET}"
echo -e "$DIVIDER\n"
echo -e "  The following will be deleted:"
echo -e "    ${GRAY}•${RESET} App files at ${WHITE}${INSTALL_DIR}${RESET}"
echo -e "    ${GRAY}•${RESET} PostgreSQL database ${WHITE}xyrapanel${RESET} and user"
echo -e "    ${GRAY}•${RESET} Nginx site config"
echo -e "    ${GRAY}•${RESET} PM2 process"
echo -e "    ${GRAY}•${RESET} System user ${WHITE}${PANEL_USER}${RESET}"
echo -e "\n  ${YELLOW}PostgreSQL, Redis, Nginx and Node.js themselves are NOT removed.${RESET}\n"
read -rp "  ${BOLD}Type 'yes' to confirm uninstall:${RESET} " CONFIRM
[[ "$CONFIRM" != "yes" ]] && { log_info "Aborted."; exit 0; }

# stop pm2
log_step "Stopping XyraPanel"
pm2 delete xyrapanel 2>/dev/null && log_success "PM2 process removed" || log_warn "PM2 process not found"
pm2 save 2>/dev/null || true

# remove nginx config
log_step "Removing Nginx config"
if [[ "$PKG_MANAGER" == "apt" ]]; then
  rm -f /etc/nginx/sites-enabled/xyrapanel.conf \
        /etc/nginx/sites-available/xyrapanel.conf \
        /etc/nginx/sites-available/xyrapanel-tmp.conf
else
  rm -f /etc/nginx/conf.d/xyrapanel.conf \
        /etc/nginx/conf.d/xyrapanel-tmp.conf \
        /etc/nginx/conf.d/xyrapanel.conf.pending
fi
nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
log_success "Nginx config removed"

# drop database
log_step "Removing PostgreSQL database and user"
sudo -u postgres psql -c "DROP DATABASE IF EXISTS xyrapanel;" 2>/dev/null && \
  log_success "Database dropped" || log_warn "Could not drop database"
sudo -u postgres psql -c "DROP USER IF EXISTS xyrapanel;" 2>/dev/null && \
  log_success "DB user dropped" || log_warn "Could not drop DB user"

# remove certbot cron
log_step "Removing cert renewal cron"
( crontab -l 2>/dev/null | grep -v "certbot renew" ) | crontab - 2>/dev/null || true
log_success "Cron entry removed"

# remove sudoers entry
rm -f /etc/sudoers.d/xyrapanel

# remove system user
log_step "Removing system user"
if id "$PANEL_USER" &>/dev/null; then
  userdel "$PANEL_USER" 2>/dev/null && log_success "User ${PANEL_USER} removed" || log_warn "Could not remove user"
fi

# remove install dir
log_step "Removing application files"
if [[ -d "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
  log_success "Removed ${INSTALL_DIR}"
else
  log_warn "${INSTALL_DIR} not found — already removed?"
fi

echo -e "
$DIVIDER
  ${GREEN}${BOLD}✔${RESET}${BOLD}  XyraPanel uninstalled${RESET}
$DIVIDER

  ${DIM}PostgreSQL, Redis, Nginx, Node.js and PM2 were left in place.${RESET}
  ${DIM}SSL certificates at /etc/letsencrypt were left in place.${RESET}

  To reinstall, run:
    ${WHITE}bash <(curl -fsSL https://raw.githubusercontent.com/XyraPanel/panel/main/scripts/install.sh)${RESET}

$DIVIDER"