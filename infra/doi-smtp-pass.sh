#!/usr/bin/env bash
#
# Đổi App Password SMTP ở cả BA nơi, theo đúng thứ tự an toàn.
#
# VÌ SAO cần script: App Password nằm ở ba chỗ phải khớp nhau tuyệt đối —
# apps/web/.env (máy dev), infra/.env (máy Mac), infra/.env (VPS). Sửa tay ba
# file qua `nano` là ba cơ hội gõ sai, và cách hỏng thì im lặng: web vẫn chạy,
# trang chủ vẫn xanh, chỉ có thư xác minh ngừng đi. Phụ huynh không xác minh
# được thì không tạo được tài khoản cho con, và không có gì báo cho ai biết.
#
# Địa chỉ này gánh ba vai: tài khoản admin, hòm thư nhận MỌI báo động của hệ
# thống (kênh duy nhất sau khi bỏ Telegram), và người gửi mọi thư đi. Nên việc
# đổi nó đáng được làm bằng một đường đã đo, không phải bằng trí nhớ.
#
# Chạy TRÊN MÁY MAC:
#   infra/doi-smtp-pass.sh
#
# Mật khẩu nhập bằng `read -s`: không hiện lên màn hình, không vào lịch sử
# shell, không vào `ps` — khác hẳn việc đưa nó làm tham số dòng lệnh.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

ENV_MAC_INFRA="$REPO/infra/.env"
ENV_MAC_WEB="$REPO/apps/web/.env"
VPS="kidovps"
ENV_VPS="/root/KidoGame/infra/.env"
LUU="$HOME/KidoGame-sao-luu/env-truoc-doi/$(date +%Y%m%d-%H%M%S)"

say() { printf '%s\n' "$*"; }
loi() { printf '❌ %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_MAC_INFRA" ] || loi "Không thấy $ENV_MAC_INFRA"
[ -f "$ENV_MAC_WEB" ] || loi "Không thấy $ENV_MAC_WEB"

# ---------------------------------------------------------------------------
# 1. Nhận mật khẩu mới
# ---------------------------------------------------------------------------
say "── Mật khẩu mới ────────────────────────────────────────────"
say "Lấy ở https://myaccount.google.com/apppasswords (tài khoản mail-chinh@example.com)."
say "Google hiện 16 chữ chia 4 cụm — dán cả khoảng trắng cũng được, script tự bỏ."
say ""
printf 'App Password mới (gõ xong bấm Enter, màn hình sẽ không hiện gì): '
read -rs MOI
echo

# Google hiện mật khẩu dạng "abcd efgh ijkl mnop". Dán nguyên cụm là chuyện
# đương nhiên sẽ xảy ra, và một khoảng trắng lọt vào .env thì Gmail trả 535 mà
# không nói vì sao.
MOI="${MOI//[[:space:]]/}"

# Kiểm định dạng thay vì tin người gõ: 16 chữ thường, không gì khác. Đây cũng là
# thứ khiến mọi chỗ nhúng $MOI bên dưới an toàn — không ký tự nào cần thoát.
if ! printf '%s' "$MOI" | grep -qE '^[a-z]{16}$'; then
  loi "Không đúng dạng App Password (cần đúng 16 chữ thường a-z, nhận được ${#MOI} ký tự).
   Nếu Google cho ra thứ khác dạng này thì dừng lại và xem kỹ đã copy đúng chỗ chưa."
fi

CU=$(grep -E '^SMTP_PASS=' "$ENV_MAC_INFRA" | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)
if [ "$MOI" = "$CU" ]; then
  loi "Mật khẩu mới TRÙNG cái đang dùng — nghĩa là chưa thu hồi và tạo cái mới ở Google."
fi

# ---------------------------------------------------------------------------
# 2. Sao lưu trước khi sửa
# ---------------------------------------------------------------------------
say "── Sao lưu ─────────────────────────────────────────────────"
mkdir -p "$LUU"
chmod 700 "$LUU"
cp "$ENV_MAC_INFRA" "$LUU/infra.env"
cp "$ENV_MAC_WEB" "$LUU/apps-web.env"
say "✅ Bản cũ: $LUU"
say "   (Ngoài repo — .env.* tuy đã bị .gitignore bắt, nhưng chỗ an toàn nhất"
say "   cho một file đầy mật khẩu vẫn là không nằm trong thư mục git nào cả.)"

# ---------------------------------------------------------------------------
# 3. Sửa hai file trên Mac
# ---------------------------------------------------------------------------
say ""
say "── Máy Mac ─────────────────────────────────────────────────"

doi_file() {
  local f="$1"
  local truoc sau
  truoc=$(grep -cE '^SMTP_PASS=' "$f" || true)
  [ "$truoc" = "1" ] || loi "$f có $truoc dòng SMTP_PASS, phải đúng 1 — dừng, không sửa mò."

  # awk ghi file mới rồi thay chỗ: `sed -i` khác cú pháp giữa macOS và Linux, và
  # script này chạm cả hai loại máy.
  awk -v p="$MOI" '/^SMTP_PASS=/ { print "SMTP_PASS=" p; next } { print }' "$f" > "$f.moi"
  # Giữ nguyên quyền file cũ thay vì để umask quyết định.
  chmod --reference="$f" "$f.moi" 2>/dev/null || chmod 644 "$f.moi"
  mv "$f.moi" "$f"

  sau=$(grep -cE "^SMTP_PASS=$MOI$" "$f" || true)
  [ "$sau" = "1" ] || loi "Sửa xong mà đọc lại không thấy giá trị mới trong $f"
  say "✅ $f"
}

doi_file "$ENV_MAC_INFRA"
doi_file "$ENV_MAC_WEB"

# ---------------------------------------------------------------------------
# 4. Hỏi Gmail xem mật khẩu mới có dùng được không
# ---------------------------------------------------------------------------
say ""
say "── Gmail có nhận mật khẩu này không ────────────────────────"
say "(mail-check.mjs gọi transporter.verify(): nối, bắt tay TLS và AUTH thật,"
say " KHÔNG gửi thư cho ai)"
say ""
if node "$REPO/infra/mail-check.mjs"; then
  say ""
  say "✅ Gmail xác thực được bằng mật khẩu mới."
else
  say ""
  say "❌ mail-check.mjs chưa xanh hết. Nếu dòng 'SMTP nối và xác thực được' ĐỎ thì"
  say "   mật khẩu sai — khôi phục bằng:"
  say "     cp $LUU/infra.env $ENV_MAC_INFRA"
  say "     cp $LUU/apps-web.env $ENV_MAC_WEB"
  say "   VPS CHƯA bị đụng tới, production vẫn đang chạy bằng mật khẩu cũ."
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. VPS — chỉ sau khi Mac đã xanh
# ---------------------------------------------------------------------------
say ""
say "── VPS ─────────────────────────────────────────────────────"
say "Bước này sửa $ENV_VPS rồi dựng lại container."
say "Web sẽ trả 502 trong vài giây, và UptimeRobot có thể nhắn 'site is DOWN'."
say ""
printf 'Làm tiếp trên VPS? [y/N]: '
read -r TRA_LOI
if [ "$TRA_LOI" != "y" ] && [ "$TRA_LOI" != "Y" ]; then
  say "Dừng ở đây. Máy Mac đã đổi, VPS vẫn dùng mật khẩu cũ — hai bên KHÁC nhau."
  say "Chạy lại script này khi nào muốn làm nốt, hoặc sửa tay theo infra/LENH-VPS.md."
  exit 0
fi

# Đoạn chạy trên VPS giữ trong một BIẾN rồi truyền làm tham số, còn mật khẩu đi
# qua stdin.
#
# Không làm ngược lại được, và cũng không gộp được: `ssh 'bash -s' <<'REMOTE'`
# biến heredoc thành stdin của ssh, nên nếu mật khẩu cũng được pipe vào thì
# heredoc thắng và `read -r P` bên kia đọc trúng dòng đầu của chính đoạn script.
# Nó sẽ "chạy" và hỏng ở bước kiểm định dạng — đã suýt ship đúng lỗi này.
#
# Còn mật khẩu thì KHÔNG được đi qua tham số: tham số của lệnh ssh hiện nguyên
# văn trong `ps` trên VPS, nơi tiến trình nào cũng đọc được. Script thì không có
# gì bí mật, nên nó đi đường đó là an toàn.
DOAN_VPS=$(cat <<'REMOTE'
set -euo pipefail
read -r P
printf '%s' "$P" | grep -qE '^[a-z]{16}$' || { echo "❌ VPS nhận được thứ không phải App Password" >&2; exit 1; }

cd /root/KidoGame/infra
[ -f .env ] || { echo "❌ VPS không có infra/.env" >&2; exit 1; }

BAK=".env.bak.$(date +%Y%m%d-%H%M%S)"
cp .env "$BAK"
chmod 600 "$BAK"
echo "✅ VPS sao lưu: /root/KidoGame/infra/$BAK"

SO=$(grep -cE '^SMTP_PASS=' .env || true)
[ "$SO" = "1" ] || { echo "❌ VPS .env có $SO dòng SMTP_PASS, phải đúng 1" >&2; exit 1; }

awk -v p="$P" '/^SMTP_PASS=/ { print "SMTP_PASS=" p; next } { print }' .env > .env.moi
chmod --reference=.env .env.moi
mv .env.moi .env
grep -qE "^SMTP_PASS=$P$" .env || { echo "❌ Sửa xong mà đọc lại không thấy giá trị mới" >&2; exit 1; }
echo "✅ VPS /root/KidoGame/infra/.env"

# `up -d` chứ KHÔNG `restart`: biến môi trường chỉ vào container lúc TẠO. restart
# dựng lại đúng container cũ với đúng env cũ, không báo lỗi gì, và mật khẩu mới
# nằm trong file mà không bao giờ tới tiến trình đang chạy.
echo "Dựng lại container (up -d)…"
docker compose up -d 2>&1 | tail -5

# Đo thứ thật sự quan trọng: giá trị BÊN TRONG tiến trình đang chạy, không phải
# giá trị trong file. Hai thứ đó lệch nhau chính là cách `restart` lừa người ta.
TRONG=$(docker compose exec -T web printenv SMTP_PASS 2>/dev/null | tr -d '\r\n' || true)
if [ "$TRONG" = "$P" ]; then
  echo "✅ Container web đang chạy BẰNG mật khẩu mới"
else
  echo "❌ Container web vẫn giữ giá trị CŨ — env mới chưa vào tiến trình" >&2
  echo "   Thử: docker compose up -d --force-recreate web" >&2
  exit 1
fi
REMOTE
)

printf '%s\n' "$MOI" | ssh "$VPS" "$DOAN_VPS"

say ""
say "── Xong ────────────────────────────────────────────────────"
say "Ba nơi đã khớp. Việc còn lại KHÔNG script nào làm thay được:"
say "  1. Vào https://myaccount.google.com/apppasswords xem cái CŨ đã biến mất chưa."
say "  2. Mở web thật, đăng ký một tài khoản phụ huynh, BẤM link trong thư xác minh."
say "     Gửi được thư và bấm được link là hai câu hỏi khác nhau."
say ""
say "Bản .env cũ còn ở $LUU và trên VPS — xoá đi khi đã yên tâm."
