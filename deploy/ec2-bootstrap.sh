#!/usr/bin/env bash
# Ubuntu 22.04/24.04 LTS on EC2 — installs Docker Engine + Compose plugin.
# Run once after SSH: bash deploy/ec2-bootstrap.sh
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/ec2-bootstrap.sh"
  exit 1
fi

apt-get update -y
apt-get install -y ca-certificates curl gnupg

install -m0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" \
  >/etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

echo "Docker OK. Add ec2-user/ubuntu to group docker if needed:"
echo "  sudo usermod -aG docker \"\$SUDO_USER\""
echo "Then log out and back in, clone the repo, configure .env, and:"
echo "  docker compose up -d --build"
