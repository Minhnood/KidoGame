#!/usr/bin/env bash
#
# Tạo database `umami` + user `umami`. Chạy TRÊN VPS, MỘT LẦN trước lần `up -d` đầu
# tiên có service umami. Logic và lý do nằm ở `tao-db-rieng.sh`.
#
#   cd /root/KidoGame/infra && bash tao-db-umami.sh
exec bash "$(dirname "$0")/tao-db-rieng.sh" umami UMAMI_DB_PASSWORD
