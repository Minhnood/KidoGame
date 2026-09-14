#!/usr/bin/env bash
#
# Tạo tài khoản quản trị GlitchTip với mật khẩu NGẪU NHIÊN, lưu vào
# `infra/glitchtip-admin.txt` (quyền 600, không vào git).
#
#   cd /root/KidoGame/infra && bash tao-admin-glitchtip.sh [email]
#
# Email mặc định lấy OPERATOR_EMAIL trong `.env`. Chạy SAU khi service glitchtip đã
# healthy, và TRƯỚC khi đặt ERRORS_DOMAIN thật: máy dò tới hostname mới vài giây sau
# khi Caddy xin chứng chỉ (đã thấy với Umami). Đăng ký tự do đã tắt trong compose,
# nên trước lúc có tài khoản này thì không ai đăng nhập được — kể cả người vận hành.
#
# Chạy lại khi tài khoản đã có: Django từ chối (trùng email), không đổi mật khẩu cũ.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "❌ Không thấy infra/.env" >&2; exit 1; }

EMAIL=${1:-$(grep -E '^OPERATOR_EMAIL=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')}
printf '%s' "$EMAIL" | grep -qE '^[^@ ]+@[^@ ]+\.[^@ ]+$' \
  || { echo "❌ Không có email hợp lệ (truyền tham số hoặc đặt OPERATOR_EMAIL)" >&2; exit 1; }

FILE=glitchtip-admin.txt
[ ! -e "$FILE" ] || { echo "❌ $FILE đã có — tài khoản đã tạo rồi. Xoá file nếu chắc chắn muốn tạo lại." >&2; exit 1; }

MK=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)

# Mật khẩu vào DJANGO_SUPERUSER_PASSWORD qua STDIN, không qua `-e`: tham số của
# `docker compose exec` hiện nguyên văn trong `ps`.
printf '%s' "$MK" | docker compose exec -T glitchtip sh -c \
  "DJANGO_SUPERUSER_PASSWORD=\$(cat) ./manage.py createsuperuser --noinput --email '$EMAIL'"

# Ghi file SAU khi tạo thành công: tạo hỏng thì không để lại một mật khẩu không dùng
# được, trông như thật.
( umask 077; printf '%s\n%s\n' "$EMAIL" "$MK" > "$FILE" )
echo "✅ Đã tạo quản trị GlitchTip $EMAIL — mật khẩu trong infra/$FILE (600)"
