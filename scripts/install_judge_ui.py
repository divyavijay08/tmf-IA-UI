#!/usr/bin/env python3
"""Install the Team Alpha judge UI behind the workshop's protected gateway."""

import shutil
import subprocess
from pathlib import Path


APP_DIR = Path("/home/ec2-user/environment/tmf-IA-UI")
TOKEN_FILE = Path("/home/ec2-user/environment/assurance-ui-live/service-token")
NGINX_CONFIG = Path("/etc/nginx/conf.d/codeserver.conf")
SERVICE_FILE = Path("/etc/systemd/system/team-alpha-ui.service")
ORIGIN = "https://d2b9v9vzd6k5nc.cloudfront.net"
ROUTE = """    location /team-alpha/ {
      proxy_pass http://127.0.0.1:8768/;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_http_version 1.1;
    }
"""


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def install_service() -> None:
    service = f"""[Unit]
Description=Team Alpha judge-facing UI
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory={APP_DIR}
ExecStart=/usr/bin/python3 {APP_DIR}/scripts/judge_server.py --root {APP_DIR}/dist --token-file {TOKEN_FILE} --target http://127.0.0.1:8767 --origin {ORIGIN} --port 8768
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
"""
    SERVICE_FILE.write_text(service)
    run("systemctl", "daemon-reload")
    subprocess.run(["pkill", "-f", "scripts/judge_server.py"], check=False)
    run("systemctl", "enable", "--now", "team-alpha-ui.service")


def install_gateway_route() -> None:
    current = NGINX_CONFIG.read_text()
    if "location /team-alpha/" not in current:
        marker = "    location / {"
        server = current.index("listen 8081")
        location = current.index(marker, server)
        backup = NGINX_CONFIG.with_suffix(".conf.team-alpha-backup")
        shutil.copy2(NGINX_CONFIG, backup)
        NGINX_CONFIG.write_text(current[:location] + ROUTE + current[location:])
    try:
        run("nginx", "-t")
    except subprocess.CalledProcessError:
        backup = NGINX_CONFIG.with_suffix(".conf.team-alpha-backup")
        if backup.exists():
            shutil.copy2(backup, NGINX_CONFIG)
        raise
    run("systemctl", "reload", "nginx")


def main() -> None:
    if not (APP_DIR / "dist/index.html").is_file():
        raise SystemExit("Production build is missing")
    if not TOKEN_FILE.is_file():
        raise SystemExit("Adapter token file is missing")
    install_service()
    install_gateway_route()
    print("Team Alpha UI installed at /team-alpha/")


if __name__ == "__main__":
    main()
