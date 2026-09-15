#!/usr/bin/env bash
#
# Tạo database `glitchtip` + user `glitchtip`. Chạy TRÊN VPS, MỘT LẦN trước lần `up -d`
# đầu tiên có service glitchtip. Logic và lý do nằm ở `tao-db-rieng.sh`.
#
#   cd /root/KidoGame/infra && bash tao-db-glitchtip.sh
exec bash "$(dirname "$0")/tao-db-rieng.sh" glitchtip GLITCHTIP_DB_PASSWORD
