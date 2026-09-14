#!/usr/bin/env bash
#
# Tạo một database + user CÙNG TÊN trong container Postgres đang chạy, cho một phần
# mềm bên ngoài (Umami, GlitchTip) — rồi ĐO rằng user đó không vào được DB kidogame.
#
#   cd /root/KidoGame/infra && bash tao-db-rieng.sh <ten> <BIEN_MAT_KHAU_TRONG_ENV>
#   bash tao-db-rieng.sh glitchtip GLITCHTIP_DB_PASSWORD
#
# Thường gọi qua `tao-db-umami.sh` / `tao-db-glitchtip.sh`. Chạy lại bao nhiêu lần
# cũng được: có rồi thì chỉ đặt lại mật khẩu cho khớp `.env`.
#
# VÌ SAO CẦN SCRIPT: Postgres chỉ chạy script khởi tạo lúc volume `pgdata` còn TRỐNG.
# Volume production đã có dữ liệu từ 8/9, nên không có đường tự động nào tạo được DB
# thứ hai — phải tạo tay, và tạo tay mà không ghi lại thì lần dựng máy sau không ai nhớ.
#
# VÌ SAO USER RIÊNG: `kidogame` là superuser của container. Cho phần mềm ngoài dùng nó
# là cho nó quyền đọc bảng Parent, Child, Session. User riêng chỉ sở hữu DB của nó.
set -euo pipefail

TEN=${1:?cách dùng: bash tao-db-rieng.sh <ten> <BIEN_MAT_KHAU>}
BIEN=${2:?cách dùng: bash tao-db-rieng.sh <ten> <BIEN_MAT_KHAU>}

# Tên đi thẳng vào SQL, nên chỉ nhận chữ thường. `kidogame` bị cấm: chạy nhầm là đổi
# mật khẩu của chính user app.
printf '%s' "$TEN" | grep -qE '^[a-z]+$' || { echo "❌ Tên phải là chữ thường a-z" >&2; exit 1; }
[ "$TEN" != "kidogame" ] && [ "$TEN" != "postgres" ] || { echo "❌ Không dùng script này cho $TEN" >&2; exit 1; }

cd "$(dirname "$0")"
[ -f .env ] || { echo "❌ Không thấy infra/.env" >&2; exit 1; }

MK=$(grep -E "^${BIEN}=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
[ -n "$MK" ] || { echo "❌ .env chưa có $BIEN" >&2; exit 1; }
# Chỉ nhận chữ và số: mật khẩu được ghép thẳng vào câu SQL bên dưới, nên ký tự nào
# cũng phải an toàn mà không cần thoát. `openssl rand -hex 32` cho đúng loại này.
printf '%s' "$MK" | grep -qE '^[A-Za-z0-9]{24,}$' \
  || { echo "❌ $BIEN phải là chữ/số, tối thiểu 24 ký tự (dùng: openssl rand -hex 32)" >&2; exit 1; }

# SQL đi qua STDIN, không qua tham số: tham số của `docker compose exec` hiện nguyên
# văn trong `ps`, còn stdin thì không.
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$TEN') THEN
    CREATE ROLE $TEN LOGIN PASSWORD '$MK';
  ELSE
    ALTER ROLE $TEN WITH LOGIN PASSWORD '$MK';
  END IF;
END
\$\$;
SQL

if [ "$(docker compose exec -T db psql -U kidogame -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TEN'")" != "1" ]; then
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres -c "CREATE DATABASE $TEN OWNER $TEN"
  echo "✅ Đã tạo database $TEN"
else
  echo "✅ Database $TEN đã có sẵn"
fi

# Chặn user mới khỏi DB kidogame. Mặc định PUBLIC được CONNECT vào mọi database.
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres \
  -c "REVOKE CONNECT ON DATABASE kidogame FROM PUBLIC" \
  -c "GRANT CONNECT ON DATABASE kidogame TO kidogame"

# Đo: user vào được DB của nó, và KHÔNG vào được DB kidogame.
# Mật khẩu vào PGPASSWORD qua STDIN (`$(cat)`), không qua `-e` — `-e` cũng là tham số.
thu_vao() {
  printf '%s' "$MK" | docker compose exec -T db sh -c \
    "PGPASSWORD=\$(cat) psql -h 127.0.0.1 -U $TEN -d $1 -tAc 'select 1'" 2>&1
}
if thu_vao "$TEN" >/dev/null; then
  echo "✅ User $TEN đăng nhập được vào DB $TEN"
else
  echo "❌ User $TEN KHÔNG đăng nhập được vào DB $TEN" >&2; exit 1
fi
# Phải đỏ ĐÚNG VÌ QUYỀN. Chỉ hỏi "có vào được không" thì sai mật khẩu, sai host hay
# Postgres đang tắt cũng cho ra "bị chặn", và phép kiểm xanh vì lý do chẳng liên quan.
LOI=$(thu_vao kidogame || true)
if printf '%s' "$LOI" | grep -q 'permission denied for database'; then
  echo "✅ User $TEN bị chặn khỏi DB kidogame (permission denied)"
else
  echo "❌ User $TEN KHÔNG bị chặn đúng cách khỏi DB kidogame: $LOI" >&2; exit 1
fi
