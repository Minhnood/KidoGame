#!/usr/bin/env bash
#
# Đổi App Password SMTP — CHO MỘT NƠI MỖI LẦN, vì hai nơi dùng hai tài khoản khác
# nhau.
#
# ═══ BẢN ĐẦU CỦA SCRIPT NÀY SAI, VÀ SAI THEO HƯỚNG NGUY HIỂM ═══
#
# Nó nhận MỘT mật khẩu rồi ghi vào cả ba file, vì đo trên máy Mac thấy hai file khớp
# nhau và kết luận nơi thứ ba cũng vậy. Không phải:
#
#   máy Mac  ->  mail-chinh@example.com
#   VPS      ->  mail-du-phong@example.com
#
# Hai tài khoản Gmail khác nhau, hai App Password khác nhau (đã so bằng băm). Chạy
# bản cũ là ghi mật khẩu của tài khoản dev vào production — Gmail trả 535 cho mọi lá
# thư, và cách hỏng thì im lặng đúng như đoạn dưới mô tả: web vẫn chạy, trang chủ vẫn
# xanh, chỉ thư xác minh ngừng đi và phụ huynh không tạo được tài khoản cho con.
#
# Nên script giờ ĐO TRƯỚC, rồi bắt chọn nơi. Nó không bao giờ suy trạng thái của một
# máy từ trạng thái của máy khác.
#
# Chạy TRÊN MÁY MAC:
#   infra/doi-smtp-pass.sh            # chỉ đo và in ra: nơi nào dùng tài khoản nào
#   infra/doi-smtp-pass.sh --mac      # đổi hai file .env trên máy Mac
#   infra/doi-smtp-pass.sh --vps      # đổi .env trên VPS rồi dựng lại container
#
# Mật khẩu nhập bằng `read -s`: không hiện lên màn hình, không vào lịch sử shell,
# không vào `ps`.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

ENV_MAC_INFRA="$REPO/infra/.env"
ENV_MAC_WEB="$REPO/apps/web/.env"
VPS="kidovps"
VPS_DIR="/root/KidoGame/infra"
LUU="$HOME/KidoGame-sao-luu/env-truoc-doi/$(date +%Y%m%d-%H%M%S)"

say() { printf '%s\n' "$*"; }
loi() { printf '❌ %s\n' "$*" >&2; exit 1; }

doc_bien() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true; }

[ -f "$ENV_MAC_INFRA" ] || loi "Không thấy $ENV_MAC_INFRA"
[ -f "$ENV_MAC_WEB" ] || loi "Không thấy $ENV_MAC_WEB"

USER_INFRA=$(doc_bien "$ENV_MAC_INFRA" SMTP_USER)
USER_WEB=$(doc_bien "$ENV_MAC_WEB" SMTP_USER)

# ---------------------------------------------------------------------------
# Đo: nơi nào đang gửi thư bằng tài khoản nào
# ---------------------------------------------------------------------------
say "── Ai đang gửi thư bằng tài khoản nào ──────────────────────"
say "🖥  máy Mac · infra/.env        $USER_INFRA"
say "🖥  máy Mac · apps/web/.env     $USER_WEB"

USER_VPS=""
# `-n` BẮT BUỘC: không có nó thì ssh đọc sạch stdin của script và chuyển sang máy kia,
# nên `read -rs` phía dưới không còn gì để đọc — nó trả non-zero và `set -e` giết
# script ngay sau dòng nhắc mật khẩu, không in một chữ nào giải thích. Ở terminal thật
# thì nó ăn luôn phím người dùng đang gõ.
if USER_VPS=$(ssh -n -o ConnectTimeout=10 -o BatchMode=yes "$VPS" \
  "grep -E '^SMTP_USER=' $VPS_DIR/.env | head -1 | cut -d= -f2- | tr -d '\"'\\''' " 2>/dev/null); then
  USER_VPS="${USER_VPS//[[:space:]]/}"
  say "☁️  VPS     · infra/.env        $USER_VPS"
else
  USER_VPS=""
  say "☁️  VPS     · infra/.env        (không hỏi được — máy không vào được lúc này)"
fi
say ""

if [ "$USER_INFRA" != "$USER_WEB" ]; then
  say "⚠️  HAI FILE TRÊN MÁY MAC ĐANG KHÁC TÀI KHOẢN NHAU."
  # Dấu nháy đơn: trong nháy kép, `--mac` là command substitution — shell sẽ CHẠY nó.
  say '   --mac sẽ ghi cùng một mật khẩu vào cả hai, nên hãy sửa cho khớp trước.'
  say ""
fi

if [ -n "$USER_VPS" ] && [ "$USER_VPS" != "$USER_INFRA" ]; then
  say "ℹ️  Máy Mac và VPS dùng HAI tài khoản Gmail KHÁC NHAU."
  say "   Mỗi App Password chỉ hợp với đúng tài khoản tạo ra nó, nên đổi bên này"
  say "   KHÔNG đụng gì tới bên kia — và dán nhầm là bên kia câm lặng."
  say ""
fi

PHAM_VI="${1:-}"
if [ -z "$PHAM_VI" ]; then
  say "Chạy lại kèm nơi muốn đổi:"
  say "   infra/doi-smtp-pass.sh --mac    (đổi cho $USER_INFRA)"
  [ -n "$USER_VPS" ] && say "   infra/doi-smtp-pass.sh --vps    (đổi cho $USER_VPS)"
  exit 0
fi

case "$PHAM_VI" in
  --mac) TAI_KHOAN="$USER_INFRA" ;;
  --vps)
    [ -n "$USER_VPS" ] || loi "Không hỏi được VPS thì không đổi được ở đó."
    TAI_KHOAN="$USER_VPS"
    ;;
  *) loi "Chỉ nhận --mac hoặc --vps. Nhận được: $PHAM_VI" ;;
esac

# ---------------------------------------------------------------------------
# 1. Nhận mật khẩu mới
# ---------------------------------------------------------------------------
say "── Mật khẩu mới cho $TAI_KHOAN ──"
say "Đăng nhập ĐÚNG tài khoản đó ở https://myaccount.google.com/apppasswords,"
say "xoá cái cũ, tạo cái mới. Google hiện 16 chữ chia 4 cụm — dán cả khoảng trắng"
say "cũng được, script tự bỏ."
say ""
printf 'App Password mới (màn hình sẽ không hiện gì): '
read -rs MOI
echo

MOI="${MOI//[[:space:]]/}"

# Kiểm định dạng thay vì tin người gõ. Đây cũng là thứ khiến mọi chỗ nhúng $MOI bên
# dưới an toàn — không ký tự nào cần thoát.
if ! printf '%s' "$MOI" | grep -qE '^[a-z]{16}$'; then
  loi "Không đúng dạng App Password (cần đúng 16 chữ thường a-z, nhận được ${#MOI} ký tự)."
fi

# Trùng cái đang dùng nghĩa là chưa thu hồi và tạo cái mới ở Google — tức là đã chạy
# cả quy trình mà mật khẩu lộ vẫn còn dùng được. Phép kiểm Gmail bên dưới KHÔNG bắt
# được chuyện này: mật khẩu cũ vẫn hợp lệ, nên nó xanh và mọi thứ trông như đã xong.
if [ "$PHAM_VI" = "--mac" ]; then
  CU=$(doc_bien "$ENV_MAC_INFRA" SMTP_PASS)
else
  CU=$(ssh -n -o ConnectTimeout=10 -o BatchMode=yes "$VPS" \
    "grep -E '^SMTP_PASS=' $VPS_DIR/.env | head -1 | cut -d= -f2- | tr -d '\"'\\''' " 2>/dev/null || true)
  CU="${CU//[[:space:]]/}"
fi
if [ -n "$CU" ] && [ "$MOI" = "$CU" ]; then
  loi "Mật khẩu này TRÙNG cái đang dùng — nghĩa là chưa thu hồi và tạo cái mới ở Google.
   Cái cũ vẫn đang dùng được, nên việc thu hồi chưa xảy ra."
fi

# ---------------------------------------------------------------------------
# 2. Hỏi Gmail TRƯỚC khi sửa bất cứ file nào
# ---------------------------------------------------------------------------
# Đảo thứ tự so với bản đầu, cố ý: bản đầu sửa file rồi mới hỏi Gmail, nên gõ sai một
# chữ là để lại hai file hỏng và một đoạn hướng dẫn khôi phục. Gmail là dịch vụ ngoài
# — hỏi được từ đây, bằng đúng cặp user/pass sắp ghi, trước khi chạm vào gì cả.
say "── Gmail có nhận cặp này không ─────────────────────────────"
say "(transporter.verify(): nối, bắt tay TLS và AUTH thật, KHÔNG gửi thư cho ai)"
say ""
if SMTP_USER="$TAI_KHOAN" SMTP_PASS="$MOI" MAIL_FROM="$TAI_KHOAN" \
   SMTP_HOST=smtp.gmail.com SMTP_PORT=587 RESEND_API_KEY= \
   node "$REPO/infra/mail-check.mjs" 2>&1 | grep -q '✅ SMTP nối và xác thực được'; then
  say "✅ Gmail xác thực được $TAI_KHOAN bằng mật khẩu mới."
else
  say "❌ Gmail TỪ CHỐI cặp này. KHÔNG file nào bị sửa, không máy nào bị đụng."
  say "   Thường gặp: tạo App Password ở nhầm tài khoản. Nó phải được tạo khi đang"
  say "   đăng nhập đúng $TAI_KHOAN."
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Ghi
# ---------------------------------------------------------------------------
mkdir -p "$LUU"
chmod 700 "$LUU"

ghi_file_mac() {
  local f="$1" ten="$2"
  local so
  so=$(grep -cE '^SMTP_PASS=' "$f" || true)
  [ "$so" = "1" ] || loi "$f có $so dòng SMTP_PASS, phải đúng 1 — dừng, không sửa mò."
  cp "$f" "$LUU/$ten"
  awk -v p="$MOI" '/^SMTP_PASS=/ { print "SMTP_PASS=" p; next } { print }' "$f" > "$f.moi"
  chmod --reference="$f" "$f.moi" 2>/dev/null || chmod 644 "$f.moi"
  mv "$f.moi" "$f"
  grep -qE "^SMTP_PASS=$MOI$" "$f" || loi "Sửa xong mà đọc lại không thấy giá trị mới trong $f"
  say "✅ $f"
}

if [ "$PHAM_VI" = "--mac" ]; then
  say ""
  say "── Máy Mac ─────────────────────────────────────────────────"
  say "Bản cũ: $LUU"
  ghi_file_mac "$ENV_MAC_INFRA" "infra.env"
  ghi_file_mac "$ENV_MAC_WEB" "apps-web.env"
  say ""
  say "Xong. Dev server đang chạy thì phải KHỞI ĐỘNG LẠI — biến môi trường chỉ được"
  say "đọc lúc tiến trình khởi động."
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. VPS
# ---------------------------------------------------------------------------
say ""
say "── VPS ─────────────────────────────────────────────────────"
say "Sửa $VPS_DIR/.env rồi dựng lại container."
say "Web sẽ trả 502 trong vài giây, và UptimeRobot có thể nhắn 'site is DOWN'."
say ""
printf 'Làm tiếp? [y/N]: '
read -r TRA_LOI
[ "$TRA_LOI" = "y" ] || [ "$TRA_LOI" = "Y" ] || { say "Dừng, VPS không bị đụng."; exit 0; }

# Đoạn chạy trên VPS giữ trong một BIẾN rồi truyền làm tham số, còn mật khẩu đi qua
# stdin. Không gộp được: `ssh 'bash -s' <<'REMOTE'` biến heredoc thành stdin của ssh,
# nên mật khẩu pipe vào sẽ thua và `read` bên kia nuốt trúng dòng đầu của chính đoạn
# script. Mật khẩu cũng KHÔNG được đi qua tham số — tham số của lệnh ssh hiện nguyên
# văn trong `ps` trên VPS.
DOAN_VPS=$(cat <<'REMOTE'
set -euo pipefail
read -r P
printf '%s' "$P" | grep -qE '^[a-z]{16}$' || { echo "❌ VPS nhận được thứ không phải App Password" >&2; exit 1; }

cd /root/KidoGame/infra
BAK=".env.bak.$(date +%Y%m%d-%H%M%S)"
cp .env "$BAK"; chmod 600 "$BAK"
echo "✅ VPS sao lưu: /root/KidoGame/infra/$BAK"

SO=$(grep -cE '^SMTP_PASS=' .env || true)
[ "$SO" = "1" ] || { echo "❌ VPS .env có $SO dòng SMTP_PASS, phải đúng 1" >&2; exit 1; }

awk -v p="$P" '/^SMTP_PASS=/ { print "SMTP_PASS=" p; next } { print }' .env > .env.moi
chmod --reference=.env .env.moi
mv .env.moi .env
grep -qE "^SMTP_PASS=$P$" .env || { echo "❌ Đọc lại không thấy giá trị mới" >&2; exit 1; }
echo "✅ VPS /root/KidoGame/infra/.env"

# `up -d` chứ KHÔNG `restart`: biến môi trường chỉ vào container lúc TẠO. restart
# dựng lại đúng container cũ với đúng env cũ, không báo lỗi gì, và mật khẩu mới nằm
# trong file mà không bao giờ tới tiến trình đang chạy.
echo "Dựng lại container (up -d)…"
docker compose up -d 2>&1 | tail -3

# Đo giá trị BÊN TRONG tiến trình đang chạy, không phải trong file. Hai thứ đó lệch
# nhau chính là cách `restart` lừa người ta.
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
say "Việc còn lại KHÔNG script nào làm thay được: mở web thật, đăng ký một tài khoản"
say "phụ huynh, BẤM link trong thư xác minh. Gửi được thư và bấm được link là hai câu"
say "hỏi khác nhau."
