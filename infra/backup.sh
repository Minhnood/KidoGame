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

# --- Đẩy ra ngoài máy ------------------------------------------------------
# Đích rsync, dạng `user@host:/duong/dan`. Rỗng = tắt hẳn bước này.
REMOTE="${BACKUP_REMOTE:-}"
# Khoá SSH riêng, mount vào container ở chế độ chỉ đọc.
SSH_KEY="${BACKUP_SSH_KEY:-/ssh/id_backup}"
SSH_PORT="${BACKUP_REMOTE_PORT:-22}"
# File known_hosts. BẮT BUỘC khi có REMOTE — xem giải thích ở push_offsite().
KNOWN_HOSTS="${BACKUP_SSH_KNOWN_HOSTS:-/ssh/known_hosts}"

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

	# Xoay vòng TRƯỚC rồi mới đẩy đi: rsync có --delete nên máy kia sẽ giống hệt
	# máy này, kể cả phần đã xoá. Đẩy trước rồi mới xoá thì bản cũ đọng lại bên
	# kia mãi mãi và ổ đĩa đó đầy vào một ngày không ai để ý.
	push_offsite
}

# ---------------------------------------------------------------------------
# Đẩy bản sao lưu sang máy khác.
#
# VÌ SAO cần: bản sao lưu mặc định nằm trên CHÍNH cái ổ chứa dữ liệu gốc. Nó
# chống được lỡ tay `delete from`, chống được nâng cấp hỏng. Nó KHÔNG chống được
# ổ đĩa chết, VPS bị xoá, hay tài khoản nhà cung cấp bị khoá — mà đó mới là những
# cách người ta thật sự mất sạch dữ liệu.
#
# Tắt mặc định. Bật bằng cách đặt BACKUP_REMOTE trong infra/.env.
# ---------------------------------------------------------------------------
push_offsite() {
	if [ -z "$REMOTE" ]; then
		# KHÔNG nói "bản sao lưu chỉ nằm trên máy này" nữa, dù đó là câu đúng cho tới
		# ngày 10/9/2026. Từ hôm đó máy Mac tự KÉO bản sao lưu về mỗi ngày hai lần
		# (`infra/keo-sao-luu.sh`), nên bản sao lưu CÓ rời khỏi máy này — chỉ là đi
		# bằng đường khác, và cố ý đi bằng đường khác: đẩy thì VPS phải cầm khoá mở
		# vào máy đích, tức ai chiếm được VPS cũng xoá được luôn bản sao lưu.
		#
		# Một dòng log nói "KHÔNG chống được ổ chết" trong khi thực tế đã chống được
		# sẽ làm người đọc sau đi dựng lại một cơ chế đang chạy — hoặc tệ hơn, dựng
		# đúng cái cơ chế đẩy đã bị loại bỏ có lý do.
		log "BACKUP_REMOTE chưa đặt -> không ĐẨY đi đâu (đúng thiết kế: máy Mac tự KÉO về, xem infra/SAO-LUU.md)"
		return 0
	fi

	if [ ! -f "$SSH_KEY" ]; then
		log "LỖI: có BACKUP_REMOTE nhưng không thấy khoá $SSH_KEY — không đẩy được đi đâu cả"
		return 1
	fi

	# StrictHostKeyChecking=yes, và known_hosts phải do NGƯỜI chuẩn bị.
	#
	# Cách làm quen tay là `-o StrictHostKeyChecking=no`. Ở đây thì không: script
	# này cầm khoá SSH và đẩy toàn bộ dữ liệu người dùng — email phụ huynh, hash
	# mật khẩu, file của trẻ — sang đầu kia. Tắt kiểm host key nghĩa là bất cứ ai
	# chen được vào giữa cũng nhận trọn gói đó, và không để lại dấu vết nào.
	if [ ! -f "$KNOWN_HOSTS" ]; then
		log "LỖI: thiếu $KNOWN_HOSTS. Tạo bằng: ssh-keyscan -p $SSH_PORT <host> > known_hosts"
		return 1
	fi

	local ssh_cmd="ssh -i $SSH_KEY -p $SSH_PORT -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o BatchMode=yes -o ConnectTimeout=20"

	log "đẩy sang $REMOTE"
	# --delete để đầu kia phản chiếu đúng thư mục này (đã xoay vòng ở trên).
	# --partial để lần sau nối tiếp phần dở, đường truyền ở VN hay đứt giữa chừng.
	if ! rsync -az --delete --partial --timeout=120 -e "$ssh_cmd" "$DEST/" "$REMOTE/"; then
		log "LỖI: đẩy sang $REMOTE thất bại — coi như KHÔNG có bản sao lưu ngoài máy"
		return 1
	fi

	# rsync trả 0 không có nghĩa là bên kia có file đọc được: quota đầy, thư mục
	# bị mount nhầm, hay đường dẫn gõ sai đều có thể im lặng. Đếm lại từ đầu kia.
	local host="${REMOTE%%:*}" path="${REMOTE#*:}" remote_count
	remote_count=$($ssh_cmd "$host" "ls -1 '$path' 2>/dev/null | wc -l" 2>/dev/null || echo 0)
	local local_count
	local_count=$(ls -1 "$DEST" 2>/dev/null | wc -l)

	if [ "$remote_count" -lt "$local_count" ]; then
		log "LỖI: bên kia chỉ có $remote_count file, bên này $local_count — đẩy chưa trọn"
		return 1
	fi

	log "đã đẩy xong, $remote_count file ở $REMOTE"
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
