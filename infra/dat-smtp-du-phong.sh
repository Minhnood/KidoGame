#!/usr/bin/env bash
#
# Đặt (hoặc thay) TÀI KHOẢN GỬI DỰ PHÒNG cho VPS: `SMTP_DU_PHONG_USER` + `SMTP_DU_PHONG_PASS`.
#
# Chạy TRÊN MÁY MAC:
#   infra/dat-smtp-du-phong.sh                           # dự phòng = mail-chinh@example.com
#   infra/dat-smtp-du-phong.sh ten-khac@gmail.com
#
# VÌ SAO CÓ. 15/9/2026 Google vô hiệu App Password của tài khoản gửi chính, production câm
# cho tới khi người vận hành tạo mật khẩu mới. Tài khoản dự phòng đỡ đúng quãng đó: chính bị
# 535 thì thư đi bằng dự phòng (xem `docCauHinhSmtpDuPhong` trong apps/web/src/lib/mail.ts).
#
# App Password RIÊNG cho VPS, KHÔNG dùng lại cái máy Mac đang dùng cho cùng tài khoản (fen
# chốt): thu hồi một cái thì cái kia vẫn sống, và biết được máy nào làm lộ.
#
# Làm theo đúng thứ tự của `doi-smtp-pass.sh`: hỏi Gmail TRƯỚC, sửa file SAU. Mật khẩu nhập
# bằng `read -s`, đi sang VPS qua stdin — không hiện màn hình, không vào lịch sử, không vào `ps`.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
VPS="kidovps"
VPS_DIR="/root/KidoGame/infra"

say() { printf '%s\n' "$*"; }
loi() { printf '❌ %s\n' "$*" >&2; exit 1; }
doc_bien() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true; }
thuong() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

TAI_KHOAN="${1:-mail-chinh@example.com}"
printf '%s' "$TAI_KHOAN" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' \
  || loi "Không phải địa chỉ email: $TAI_KHOAN"

# `-n`: không có nó ssh nuốt stdin, và `read -rs` bên dưới chết không một lời — xem doi-smtp-pass.sh.
USER_CHINH=$(ssh -n -o ConnectTimeout=10 -o BatchMode=yes "$VPS" \
  "grep -E '^SMTP_USER=' $VPS_DIR/.env | head -1 | cut -d= -f2- | tr -d '\"'\\''' " 2>/dev/null) \
  || loi "Không hỏi được VPS."
USER_CHINH="${USER_CHINH//[[:space:]]/}"

say "── Tài khoản gửi trên VPS ──────────────────────────────────"
say "   chính:     $USER_CHINH"
say "   dự phòng:  $TAI_KHOAN   (sắp đặt)"
say ""
[ "$(thuong "$TAI_KHOAN")" != "$(thuong "$USER_CHINH")" ] \
  || loi "Dự phòng TRÙNG tài khoản chính — bị thu hồi cùng lúc thì không đỡ được gì. Chọn tài khoản khác."

say "Đăng nhập ĐÚNG $TAI_KHOAN ở https://myaccount.google.com/apppasswords và TẠO MỚI một"
say "App Password tên kiểu 'KidoGame VPS du phong'. KHÔNG dùng lại cái máy Mac đang dùng."
say ""
printf 'App Password dự phòng (màn hình sẽ không hiện gì): '
read -rs MOI
echo
MOI="${MOI//[[:space:]]/}"
printf '%s' "$MOI" | grep -qE '^[a-z]{16}$' \
  || loi "Không đúng dạng App Password (cần đúng 16 chữ thường a-z, nhận được ${#MOI} ký tự)."

# Trùng mật khẩu máy Mac đang dùng cho cùng tài khoản = đang dùng chung, trái điều đã chốt.
for f in "$REPO/infra/.env" "$REPO/apps/web/.env"; do
  if [ "$(thuong "$(doc_bien "$f" SMTP_USER)")" = "$(thuong "$TAI_KHOAN")" ] && [ "$(doc_bien "$f" SMTP_PASS)" = "$MOI" ]; then
    loi "Đây là App Password máy Mac đang dùng ($f). Tạo một cái RIÊNG cho VPS."
  fi
done

CU=$(ssh -n -o ConnectTimeout=10 -o BatchMode=yes "$VPS" \
  "grep -E '^SMTP_DU_PHONG_PASS=' $VPS_DIR/.env | head -1 | cut -d= -f2- | tr -d '\"'\\''' " 2>/dev/null || true)
CU="${CU//[[:space:]]/}"
[ -z "$CU" ] || [ "$CU" != "$MOI" ] || loi "Trùng mật khẩu dự phòng đang đặt trên VPS — không có gì để đổi."

say "── Gmail có nhận cặp này không ─────────────────────────────"
say "(nối, bắt tay TLS và AUTH thật, KHÔNG gửi thư cho ai)"
if SMTP_USER="$TAI_KHOAN" SMTP_PASS="$MOI" MAIL_FROM="$TAI_KHOAN" \
   SMTP_HOST=smtp.gmail.com SMTP_PORT=587 RESEND_API_KEY= \
   node "$REPO/infra/mail-check.mjs" 2>&1 | grep -q '✅ SMTP nối và xác thực được'; then
  say "✅ Gmail xác thực được $TAI_KHOAN."
else
  say "❌ Gmail TỪ CHỐI cặp này. KHÔNG file nào bị sửa, VPS không bị đụng."
  say "   Thường gặp: tạo App Password khi đang đăng nhập nhầm tài khoản."
  exit 1
fi

say ""
say "── VPS ─────────────────────────────────────────────────────"
say "Sửa $VPS_DIR/.env rồi dựng lại container (web vài giây 502)."
printf 'Làm tiếp? [y/N]: '
read -r TRA_LOI
[ "$TRA_LOI" = "y" ] || [ "$TRA_LOI" = "Y" ] || { say "Dừng, VPS không bị đụng."; exit 0; }

DOAN_VPS=$(cat <<'REMOTE'
set -euo pipefail
read -r U
read -r P
printf '%s' "$P" | grep -qE '^[a-z]{16}$' || { echo "❌ VPS nhận được thứ không phải App Password" >&2; exit 1; }
printf '%s' "$U" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' || { echo "❌ VPS nhận được user sai dạng" >&2; exit 1; }

cd /root/KidoGame/infra
BAK=".env.bak.$(date +%Y%m%d-%H%M%S)-truoc-du-phong"
cp .env "$BAK"; chmod 600 "$BAK"
echo "✅ VPS sao lưu: /root/KidoGame/infra/$BAK"

# Bỏ dòng cũ (nếu có) rồi ghi mới — đúng một dòng mỗi biến, không sửa mò chỗ khác.
awk '!/^SMTP_DU_PHONG_(USER|PASS)=/' .env > .env.moi
printf 'SMTP_DU_PHONG_USER=%s\nSMTP_DU_PHONG_PASS=%s\n' "$U" "$P" >> .env.moi
chmod --reference=.env .env.moi
mv .env.moi .env
[ "$(grep -cE '^SMTP_DU_PHONG_USER=' .env)" = 1 ] && [ "$(grep -cE "^SMTP_DU_PHONG_PASS=$P$" .env)" = 1 ] \
  || { echo "❌ Đọc lại .env không thấy đúng một dòng mỗi biến" >&2; exit 1; }
echo "✅ VPS /root/KidoGame/infra/.env"

# `up -d` chứ KHÔNG `restart`: env chỉ vào container lúc TẠO.
echo "Dựng lại container (up -d)…"
docker compose up -d 2>&1 | tail -3

for s in web prune; do
  TRONG=$(docker compose exec -T "$s" printenv SMTP_DU_PHONG_PASS 2>/dev/null | tr -d '\r\n' || true)
  if [ "$TRONG" = "$P" ]; then
    echo "✅ Container $s đang cầm mật khẩu dự phòng mới"
  else
    echo "❌ Container $s chưa nhận giá trị mới — thử: docker compose up -d --force-recreate $s" >&2
    exit 1
  fi
done

echo ""
echo "── Canh gác nói gì về đường gửi mail ───────────────────────"
docker compose exec -T -w /app/apps/web prune sh -c "pnpm exec tsx prisma/canh-gac.ts" 2>&1 | grep "đường gửi mail" || true
REMOTE
)

printf '%s\n%s\n' "$TAI_KHOAN" "$MOI" | ssh "$VPS" "$DOAN_VPS"

say ""
say "── Xong ────────────────────────────────────────────────────"
say "Dòng 'đường gửi mail' ở trên phải nói CẢ HAI tài khoản đăng nhập được."
