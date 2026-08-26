#!/usr/bin/env bash
#
# Sao lưu KidoGame: dump Postgres + đóng gói thư mục storage, rồi xoay vòng.
#
# Chạy được ở hai chế độ:
#   backup.sh once   — sao lưu một lần rồi thoát (dùng cho cron của host, hoặc
#                      khi muốn có bản dump ngay trước lúc deploy)
#   backup.sh loop   — sao lưu mỗi ngày vào giờ BACKUP_HOUR (mặc định của
#                      service `backup` trong docker-compose.yml)
#
# Cố ý viết bằng bash trần, không phụ thuộc gì ngoài `pg_dump` và `tar`, để chạy
# được CẢ trong container CẢ trên host. Nhờ vậy phần logic này kiểm thử được mà
# không cần dựng cả stack lên.
set -euo pipefail

MODE="${1:-once}"

# Trong container, DATABASE_URL do compose truyền vào. Trên host thì tự đặt.
#
# Cắt query string: Prisma viết `?schema=public` vào URL, còn libpq thì BÁO LỖI
# khi gặp tham số nó không biết chứ không bỏ qua. `prisma/apply-constraints.mjs`
# phải làm đúng việc này để gọi được psql — không cắt ở đây thì mọi lần sao lưu
# đều chết, và chết vào 3 giờ sáng nơi không ai đọc log.
DB_URL="${DATABASE_URL:?thieu DATABASE_URL}"
DB_URL="${DB_URL%%\?*}"
# Thư mục cần sao lưu (file .sb3/.html/.webp của các bé).
SRC_DIR="${STORAGE_DIR:-/srv/storage}"
# Nơi chứa bản sao lưu.
DEST="${BACKUP_DIR:-/backups}"
# Giữ lại bao nhiêu bản mỗi loại.
KEEP="${BACKUP_KEEP:-7}"
# Giờ chạy hằng ngày ở chế độ loop, 0–23.
HOUR="${BACKUP_HOUR:-3}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

run_once() {
	mkdir -p "$DEST"
	local stamp
	stamp=$(date '+%Y%m%d-%H%M%S')
	local db_file="$DEST/db-$stamp.dump"
	local st_file="$DEST/storage-$stamp.tar.gz"

	# ---------------------------------------------------------------------------
	# THỨ TỰ QUAN TRỌNG: dump DB TRƯỚC, đóng gói storage SAU.
	#
	# Hai việc này không nằm trong cùng một transaction, nên phải chọn thứ tự sao
	# cho bản sao lưu không bao giờ tự mâu thuẫn. Lúc đăng game, file được ghi
	# xuống đĩa TRƯỚC rồi mới tạo hàng trong DB, và file thì không bao giờ bị xoá
	# (tên file là hash nội dung). Nên mọi hàng có trong bản dump DB đều đã có file
	# tương ứng trên đĩa từ trước đó, và file ấy chắc chắn còn nguyên khi tar chạy.
	#
	# Làm ngược lại — tar trước, dump sau — thì bản dump có thể chứa game mà file
	# của nó chưa nằm trong tar: phục hồi ra một game bấm vào là lỗi 404.
	# ---------------------------------------------------------------------------

	log "dump Postgres -> $(basename "$db_file")"
	# -Fc: định dạng custom, đã nén, và phục hồi được từng bảng chứ không chỉ
	# all-or-nothing như file .sql thuần.
	pg_dump -Fc --no-owner --no-privileges -f "$db_file" "$DB_URL"

	# Dump chạy xong không có nghĩa là dump ĐỌC ĐƯỢC. Bản sao lưu hỏng mà không ai
	# biết còn tệ hơn không có bản sao lưu, nên kiểm luôn tại đây: đọc mục lục.
	if ! pg_restore --list "$db_file" >/dev/null 2>&1; then
		log "LỖI: $db_file không đọc được bằng pg_restore, xoá đi để không tưởng là đã có backup"
		rm -f "$db_file"
		exit 1
	fi

	if [ -d "$SRC_DIR" ]; then
		log "đóng gói $SRC_DIR -> $(basename "$st_file")"
		# `-C` để trong tar chỉ có đường dẫn tương đối (sb3/, html/, thumb/),
		# giải nén vào thư mục nào cũng được.
		tar czf "$st_file" -C "$SRC_DIR" .
		# tar báo thành công mà file rỗng thì vẫn là hỏng.
		tar tzf "$st_file" >/dev/null
	else
		log "CẢNH BÁO: không thấy $SRC_DIR, bỏ qua phần file game"
	fi

	rotate 'db-*.dump'
	rotate 'storage-*.tar.gz'

	log "xong: $(du -sh "$DEST" 2>/dev/null | cut -f1) trong $DEST"
}

# Xoá bản cũ, giữ $KEEP bản mới nhất.
#
# Sắp xếp theo TÊN chứ không theo mtime: tên file mang dấu thời gian nên thứ tự
# tên đúng bằng thứ tự thời gian, và không bị sai khi mtime bị đổi (copy, rsync,
# giải nén). `ls -t` thì sai ngay khi có ai đó chạm vào file.
rotate() {
	local pattern="$1" file count=0
	# shellcheck disable=SC2012
	while IFS= read -r file; do
		count=$((count + 1))
		if [ "$count" -gt "$KEEP" ]; then
			log "xoá bản cũ $(basename "$file")"
			rm -f "$file"
		fi
	done < <(ls -1 "$DEST"/$pattern 2>/dev/null | sort -r)
}

case "$MODE" in
once)
	run_once
	;;
loop)
	log "chế độ loop: sao lưu hằng ngày vào ${HOUR}:00, giữ $KEEP bản"
	while :; do
		# Tính số giây còn lại tới mốc giờ kế tiếp. Không dùng `date -d` vì cú
		# pháp đó khác nhau giữa GNU và BSD, mà script này chạy ở cả hai.
		now=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
		delta=$((10#$HOUR * 3600 - now))
		[ "$delta" -le 0 ] && delta=$((delta + 86400))
		log "chờ $((delta / 3600))h$(((delta % 3600) / 60))m tới lần sao lưu kế tiếp"
		sleep "$delta"
		# Không để một lần lỗi giết luôn cả vòng lặp: hôm nay trượt thì mai vẫn
		# phải thử lại. Restart cả container chỉ vì đĩa đầy một hôm là quá nặng.
		run_once || log "LỖI: lần sao lưu này thất bại, sẽ thử lại vào ngày mai"
	done
	;;
*)
	echo "cách dùng: $0 [once|loop]" >&2
	exit 2
	;;
esac
