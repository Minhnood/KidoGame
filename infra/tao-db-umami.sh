#!/usr/bin/env bash
#
# Tạo database `umami` và user `umami` trong container Postgres đang chạy.
#
# Chạy TRÊN VPS, trong thư mục infra, MỘT LẦN trước lần `docker compose up -d` đầu
# tiên có service umami. Chạy lại bao nhiêu lần cũng được: có rồi thì chỉ đặt lại mật
# khẩu cho khớp `.env`.
#
#   cd /root/KidoGame/infra && bash tao-db-umami.sh
#
# VÌ SAO CẦN SCRIPT: Postgres chỉ chạy script khởi tạo lúc volume `pgdata` còn TRỐNG.
# Volume production đã có dữ liệu từ 8/9, nên không có đường tự động nào tạo được DB
# thứ hai — phải tạo tay, và tạo tay mà không ghi lại thì lần dựng máy sau không ai nhớ.
#
# VÌ SAO USER RIÊNG: `kidogame` là superuser của container. Cho Umami dùng nó là cho
# một phần mềm bên ngoài quyền đọc bảng Parent, Child, Session. User `umami` chỉ sở
# hữu DB `umami` và không có quyền gì trên DB `kidogame`.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "❌ Không thấy infra/.env" >&2; exit 1; }

MK=$(grep -E '^UMAMI_DB_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
[ -n "$MK" ] || { echo "❌ .env chưa có UMAMI_DB_PASSWORD" >&2; exit 1; }
# Chỉ nhận chữ và số: mật khẩu được ghép thẳng vào câu SQL bên dưới, nên ký tự nào
# cũng phải an toàn mà không cần thoát. `openssl rand -hex 32` cho đúng loại này.
printf '%s' "$MK" | grep -qE '^[A-Za-z0-9]{24,}$' \
  || { echo "❌ UMAMI_DB_PASSWORD phải là chữ/số, tối thiểu 24 ký tự (dùng: openssl rand -hex 32)" >&2; exit 1; }

# SQL đi qua STDIN, không qua tham số: tham số của `docker compose exec` hiện nguyên
# văn trong `ps`, còn stdin thì không.
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'umami') THEN
    CREATE ROLE umami LOGIN PASSWORD '$MK';
  ELSE
    ALTER ROLE umami WITH LOGIN PASSWORD '$MK';
  END IF;
END
\$\$;
SQL

if [ "$(docker compose exec -T db psql -U kidogame -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='umami'")" != "1" ]; then
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres -c "CREATE DATABASE umami OWNER umami"
  echo "✅ Đã tạo database umami"
else
  echo "✅ Database umami đã có sẵn"
fi

# Chặn user umami khỏi DB kidogame. Mặc định PUBLIC được CONNECT vào mọi database.
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U kidogame -d postgres \
  -c "REVOKE CONNECT ON DATABASE kidogame FROM PUBLIC" \
  -c "GRANT CONNECT ON DATABASE kidogame TO kidogame"

# Đo: umami vào được DB của nó, và KHÔNG vào được DB kidogame.
# Mật khẩu vào PGPASSWORD qua STDIN (`$(cat)`), không qua `-e` — `-e` cũng là tham số.
thu_vao() {
  printf '%s' "$MK" | docker compose exec -T db sh -c \
    "PGPASSWORD=\$(cat) psql -h 127.0.0.1 -U umami -d $1 -tAc 'select 1'" >/dev/null 2>&1
}
if thu_vao umami; then
  echo "✅ User umami đăng nhập được vào DB umami"
else
  echo "❌ User umami KHÔNG đăng nhập được vào DB umami" >&2; exit 1
fi
# Phải đỏ ĐÚNG VÌ QUYỀN. Chỉ hỏi "có vào được không" thì sai mật khẩu, sai host hay
# Postgres đang tắt cũng cho ra "bị chặn", và phép kiểm xanh vì lý do chẳng liên quan.
LOI=$(printf '%s' "$MK" | docker compose exec -T db sh -c \
  "PGPASSWORD=\$(cat) psql -h 127.0.0.1 -U umami -d kidogame -tAc 'select 1'" 2>&1 || true)
if printf '%s' "$LOI" | grep -q 'permission denied for database'; then
  echo "✅ User umami bị chặn khỏi DB kidogame (permission denied)"
else
  echo "❌ User umami KHÔNG bị chặn đúng cách khỏi DB kidogame: $LOI" >&2; exit 1
fi
