#!/usr/bin/env bash
#
# Kéo bản sao lưu từ VPS về máy này. CHẠY TRÊN MÁY MAC, không phải trên VPS.
#
# Cách dùng:
#   infra/keo-sao-luu.sh          — kéo một lượt
#   infra/keo-sao-luu.sh --kiem   — chỉ báo trạng thái, không kéo gì
#
# ===========================================================================
# VÌ SAO KÉO CHỨ KHÔNG ĐẨY — và đây là quyết định quan trọng nhất trong file này.
#
# `infra/backup.sh` đã có sẵn `push_offsite()`: VPS tự rsync bản sao lưu sang máy
# khác. Đường đó KHÔNG được dùng ở đây, cố ý.
#
# Đẩy nghĩa là VPS phải cầm một khoá SSH mở được vào máy đích, và chạy `rsync
# --delete` lên đó. Nên ai chiếm được VPS thì cũng chiếm luôn quyền xoá sạch bản
# sao lưu — bằng đúng cái khoá và đúng cái lệnh mà hệ thống tự đặt sẵn cho họ. Đó
# không phải chuyện giả tưởng: máy này bị dò mật khẩu SSH 434 lần và fail2ban đã
# cấm 79 lượt tính tới 10/9/2026. Một bản sao lưu mà kẻ chiếm máy gốc xoá được thì
# nó chống được ổ đĩa chết, chứ không chống được người.
#
# Kéo thì đảo chiều tin cậy: máy Mac cầm khoá vào VPS, VPS không cầm gì cả và
# không biết bản sao lưu được cất ở đâu. Chiếm được VPS vẫn không với tới được
# thư mục này.
#
# CÁI GIÁ, nói thẳng: lượt kéo chỉ chạy khi máy Mac đang bật. Máy tắt cả tuần thì
# bản ở đây cũ cả tuần. Vì thế script có `--kiem` để hỏi "bản mới nhất ở đây bao
# nhiêu tuổi", và nó KHÔNG bao giờ tự nói là ổn khi chưa đo.
#
# VÌ SAO KHÔNG `--delete` — hệ quả trực tiếp của đoạn trên. VPS chỉ giữ 7 bản
# (BACKUP_KEEP), máy này giữ 30. Bật `--delete` là mỗi lượt kéo lại đồng bộ đúng
# cái việc XOÁ của bên kia sang bên này, tức tự tay vứt bỏ lợi thế duy nhất vừa
# giành được ở trên: nếu có ai xoá sạch /backups trên VPS, lượt kéo kế tiếp sẽ
# lặp lại việc xoá đó ở đây. Rác tích lại thì `xoay_vong()` bên dưới dọn theo
# luật của MÁY NÀY, không theo luật của bên kia.
# ===========================================================================
set -euo pipefail

# --- Cấu hình, đổi bằng biến môi trường nếu cần ----------------------------

# Host trong ~/.ssh/config. Không viết IP vào đây: IP đổi thì sửa một chỗ.
NGUON_HOST="${KEO_HOST:-kidovps}"
# `infra/backups`, KHÔNG phải `KidoGame/backups`. `BACKUP_HOST_DIR=./backups` trong
# .env là đường dẫn TƯƠNG ĐỐI với thư mục chứa docker-compose.yml, tức `infra/`.
# Đoán nhầm chỗ này thì rsync báo "No such file or directory" — may là nó đỏ to;
# nếu thư mục sai lại tình cờ tồn tại thì mỗi lượt kéo sẽ thành công với 0 file.
NGUON_DIR="${KEO_NGUON:-/root/KidoGame/infra/backups}"

# ---------------------------------------------------------------------------
# ĐÍCH: thư mục nhà, KHÔNG phải ~/Documents hay ~/Desktop.
#
# macOS bật iCloud Drive thì hai thư mục đó được ĐỒNG BỘ LÊN MÂY theo mặc định.
# Gói này chứa dump Postgres và toàn bộ file của trẻ: email phụ huynh, hash mật
# khẩu, tên và ngày sinh của bé, file .sb3 các con làm ra. Đặt nó vào thư mục
# iCloud là lặng lẽ chuyển dữ liệu cá nhân của trẻ em sang máy chủ ở nước ngoài —
# đúng loại việc mà `infra/GIAM-SAT.md` mục 3 từ chối làm với Sentry và Google
# Analytics. Không thể từ chối ở đó rồi làm ở đây chỉ vì ở đây nó đi qua Finder.
#
# Thư mục nhà (~) KHÔNG nằm trong iCloud Drive, kể cả khi "Desktop & Documents
# Folders" đang bật.
#
# Cũng KHÔNG đặt trong repo: `git status` sẽ bày ra một thư mục lạ, và cách sửa
# quen tay cho việc đó là `git add -A`. Đúng cái bẫy đã suýt đẩy POSTGRES_PASSWORD
# vào lịch sử repo hôm 9/9.
# ---------------------------------------------------------------------------
DICH="${KEO_DICH:-$HOME/KidoGame-sao-luu}"

# Giữ bao nhiêu bản mỗi loại Ở ĐÂY. Nhiều hơn VPS (7) là chủ ý — xem đầu file.
GIU="${KEO_GIU:-30}"

# Bản mới nhất cũ hơn bao nhiêu giờ thì coi là có vấn đề. 30 chứ không phải 26 như
# phía VPS: ở đây còn cộng thêm quãng máy Mac ngủ giữa hai lượt.
NGUONG_GIO="${KEO_NGUONG_GIO:-30}"

CHI_KIEM=0
[ "${1:-}" = "--kiem" ] && CHI_KIEM=1

log() { echo "[keo] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

# ---------------------------------------------------------------------------
# Đường dẫn TUYỆT ĐỐI cho mọi lệnh ngoài bash.
#
# launchd chạy job với PATH tối thiểu (/usr/bin:/bin:/usr/sbin:/sbin) — KHÔNG có
# /opt/homebrew/bin. Nên `pg_restore` cài bằng Homebrew chạy tay thì thấy, mà chạy
# theo lịch thì "command not found", và cách hỏng đó chỉ lộ ra lúc 9 giờ sáng
# trong một file log không ai mở. Dò một lần ở đây, rồi dùng biến.
# ---------------------------------------------------------------------------
tim_lenh() {
	local ten="$1" p
	for p in "/opt/homebrew/bin/$ten" "/usr/local/bin/$ten" "/usr/bin/$ten"; do
		[ -x "$p" ] && { echo "$p"; return 0; }
	done
	command -v "$ten" 2>/dev/null || true
}

RSYNC=$(tim_lenh rsync)

# pg_restore: ưu tiên bản MỚI NHẤT tìm được, vì bản cũ hơn dump thì từ chối đọc
# (xem giải thích dài trong `kiem()`). Homebrew cài postgresql@N vào thư mục
# riêng và chỉ link MỘT bản ra /opt/homebrew/bin, nên bản 17 có thể đang nằm sẵn
# trên máy mà `command -v` không thấy.
PG_RESTORE="${KEO_PG_RESTORE:-}"
if [ -z "$PG_RESTORE" ]; then
	for p in \
		/opt/homebrew/opt/postgresql@18/bin/pg_restore \
		/opt/homebrew/opt/postgresql@17/bin/pg_restore \
		/opt/homebrew/opt/libpq/bin/pg_restore; do
		[ -x "$p" ] && { PG_RESTORE="$p"; break; }
	done
fi
[ -z "$PG_RESTORE" ] && PG_RESTORE=$(tim_lenh pg_restore)

# ---------------------------------------------------------------------------
# `db-20260910-030000.dump` -> tuổi tính bằng giờ.
#
# Đọc từ TÊN FILE, không từ mtime. Cùng lý do như `rotate()` trong backup.sh, và ở
# đây nó còn quan trọng hơn: chính lượt rsync này đặt mtime mới tinh cho mọi file
# nó vừa kéo về. Đo bằng mtime thì một bản của tuần trước vừa được kéo về sẽ đọc
# ra "0 giờ tuổi" — tức phép canh báo khoẻ mạnh đúng vào lúc việc sao lưu trên VPS
# đã chết từ lâu. Cái sai đó lặng lẽ và nó biến cơ chế này thành đồ trang trí.
# ---------------------------------------------------------------------------
tuoi_gio() {
	local ten="$1" nam thang ngay gio phut giay moc
	[[ "$ten" =~ ^db-([0-9]{4})([0-9]{2})([0-9]{2})-([0-9]{2})([0-9]{2})([0-9]{2})\.dump$ ]] || return 1
	nam="${BASH_REMATCH[1]}" thang="${BASH_REMATCH[2]}" ngay="${BASH_REMATCH[3]}"
	gio="${BASH_REMATCH[4]}" phut="${BASH_REMATCH[5]}" giay="${BASH_REMATCH[6]}"
	# `date -j -f` là cú pháp BSD, và script này CHỈ chạy trên máy Mac nên không
	# cần nhánh GNU. Giờ trong tên là giờ Việt Nam (container backup chạy TZ đó);
	# máy Mac cũng ở múi ấy nên diễn giải theo giờ địa phương là đúng.
	moc=$(date -j -f '%Y%m%d%H%M%S' "$nam$thang$ngay$gio$phut$giay" '+%s' 2>/dev/null) || return 1
	echo $(((($(date '+%s') - moc)) / 3600))
}

# ---------------------------------------------------------------------------
# Bản tự động mới nhất.
#
# Lọc theo ĐÚNG khuôn `db-<8 số>-<6 số>.dump` chứ không lấy mọi `db-*.dump`, và
# đây là một lỗi đã xảy ra thật ở lượt chạy đầu tiên: trong thư mục có cả
# `db-truoc-deploy-20260909-170044.dump` — một bản dump tay trước lúc deploy. Sắp
# xâu theo tên thì `t` đứng sau `2`, nên bản tay đó luôn leo lên đầu và mọi phép
# đo tuổi sau đó nói về nó chứ không về lượt sao lưu hằng đêm. Hệ quả đúng bằng
# việc tắt phép canh: lượt sao lưu ngừng chạy cả tuần mà ở đây vẫn thấy "ổn", vì
# cái file được đo là một file không bao giờ cũ đi theo lịch nào cả.
#
# Bản dump tay vẫn được kéo về và vẫn giữ — chỉ là nó không được dùng để trả lời
# câu "việc sao lưu tự động có còn chạy không".
# ---------------------------------------------------------------------------
moi_nhat() {
	# Sắp theo TÊN, không theo thời gian sửa file — cùng lý do như trên.
	ls -1 "$DICH" 2>/dev/null |
		grep -E '^db-[0-9]{8}-[0-9]{6}\.dump$' |
		sort -r | head -1 |
		sed "s|^|$DICH/|"
}

# ---------------------------------------------------------------------------
# Kéo về.
# ---------------------------------------------------------------------------
keo() {
	mkdir -p "$DICH"

	[ -n "$RSYNC" ] || { log "LỖI: không tìm thấy rsync"; return 1; }

	log "kéo $NGUON_HOST:$NGUON_DIR -> $DICH"
	# --stats, KHÔNG --info=progress2: macOS dùng openrsync (protocol 29) và nó
	# KHÔNG hiểu `--info=`. Cách hỏng của nó rất lừa — in một khối `usage:` rồi
	# không chuyển file nào, mà qua ống dẫn thì mã thoát vẫn 0. Đã mất một lượt
	# deploy vì đúng chuyện này hôm 9/9.
	#
	# --ignore-existing: file sao lưu là bất biến, tên mang dấu thời gian. Đã có
	# thì không có gì để cập nhật, và bỏ qua hẳn thì một file bên kia bị sửa/hỏng
	# sau khi tạo cũng không ghi đè được lên bản lành ở đây.
	#
	# CỐ Ý KHÔNG CÓ `--partial`, dù đường truyền ở VN hay đứt và `backup.sh` có
	# dùng nó. Ghép `--partial` với `--ignore-existing` tạo ra một cái bẫy vĩnh
	# viễn: `--partial` giữ phần đã tải DƯỚI ĐÚNG TÊN THẬT khi đứt giữa chừng, rồi
	# `--ignore-existing` của lượt sau thấy tên đó đã tồn tại và bỏ qua — file cụt
	# nằm lại mãi mãi, mang đúng tên một bản sao lưu hoàn chỉnh. Không có
	# `--partial` thì rsync ghi vào tên tạm rồi mới đổi tên lúc xong, nên đứt giữa
	# chừng chỉ mất công tải lại. 21MB thì tải lại là chuyện vài giây.
	if ! "$RSYNC" -a --stats --ignore-existing \
		-e "ssh -o BatchMode=yes -o ConnectTimeout=20" \
		"$NGUON_HOST:$NGUON_DIR/" "$DICH/"; then
		log "LỖI: rsync thất bại — bản sao lưu ở đây KHÔNG mới lại lần này"
		return 1
	fi

	xoay_vong 'db-*.dump'
	xoay_vong 'storage-*.tar.gz'
	log "xong: $(du -sh "$DICH" 2>/dev/null | cut -f1) trong $DICH"
}

# Giữ $GIU bản mới nhất mỗi loại. Sắp theo tên, cùng lý do như backup.sh.
xoay_vong() {
	local pattern="$1" file count=0
	while IFS= read -r file; do
		count=$((count + 1))
		if [ "$count" -gt "$GIU" ]; then
			log "xoá bản cũ $(basename "$file")"
			rm -f "$file"
		fi
	done < <(ls -1 "$DICH"/$pattern 2>/dev/null | sort -r)
}

# ---------------------------------------------------------------------------
# Kiểm: bản ở ĐÂY có đọc được không, và bao nhiêu tuổi.
#
# "rsync trả 0" không có nghĩa là có bản sao lưu dùng được — đó đúng bằng bài học
# "không ném lỗi là tất cả những gì hệ thống biết" của commit 80dfec0. Bản sao lưu
# chưa từng được mở ra thử thì không phải bản sao lưu, nó là một file lớn.
# ---------------------------------------------------------------------------
kiem() {
	local ma=0 f tuoi

	f=$(moi_nhat)
	if [ -z "$f" ]; then
		log "HỎNG: $DICH không có file db-*.dump nào"
		return 1
	fi

	tuoi=$(tuoi_gio "$(basename "$f")") || tuoi=""
	if [ -z "$tuoi" ]; then
		log "HỎNG: không đọc được mốc thời gian từ tên $(basename "$f")"
		ma=1
	elif [ "$tuoi" -gt "$NGUONG_GIO" ]; then
		log "HỎNG: bản mới nhất $(basename "$f") đã $tuoi giờ tuổi (ngưỡng $NGUONG_GIO)"
		ma=1
	else
		log "ổn: bản mới nhất $(basename "$f"), $tuoi giờ tuổi"
	fi

	# -------------------------------------------------------------------------
	# Đọc thử dump — và PHÂN BIỆT "dump hỏng" với "công cụ quá cũ".
	#
	# Đây là bẫy đã vấp ngay lượt chạy đầu, và nó là đúng loại đỏ đắt nhất: đỏ chỉ
	# sai hướng. `pg_restore` của Homebrew trên máy này là 16.14, còn dump do
	# `pg_dump` 17.11 trong container tạo ra. Bản cũ hơn TỪ CHỐI đọc file của bản
	# mới hơn — `unsupported version (1.16) in file header` — nên phép kiểm báo cả
	# ba bản sao lưu là "vô dụng" trong khi cả ba đều lành.
	#
	# Đó cùng một luật đã ghi trong `infra/Dockerfile.backup` ("pg_dump lệch major
	# với server là nó TỪ CHỐI chạy"), chỉ khác là ở đây nó đánh vào chiều ngược
	# lại và ở một máy khác.
	#
	# Báo HỎNG cho trường hợp này là cách chắc chắn nhất để người ta học cách bỏ
	# qua dòng đỏ mỗi ngày — rồi bỏ qua luôn cái ngày dump hỏng thật.
	# -------------------------------------------------------------------------
	if [ -n "$PG_RESTORE" ]; then
		local loi
		if loi=$("$PG_RESTORE" --list "$f" 2>&1 >/dev/null); then
			log "ổn: $(basename "$f") đọc được bằng pg_restore"
		elif printf '%s' "$loi" | grep -q 'unsupported version'; then
			log "BỎ QUA: pg_restore ở đây ($("$PG_RESTORE" --version | awk '{print $3}')) CŨ HƠN"
			log "        pg_dump đã tạo dump (17.x), nên nó không đọc được — dump KHÔNG sai."
			log "        Muốn kiểm được nội dung ngay trên máy này:"
			log "          brew install postgresql@17"
			log "          KEO_PG_RESTORE=/opt/homebrew/opt/postgresql@17/bin/pg_restore infra/keo-sao-luu.sh --kiem"
			log "        Không cài cũng không sao: lúc phục hồi thật thì chạy trong container"
			log "        postgres:17 của stack, ở đó phiên bản luôn khớp."
		else
			log "HỎNG: $(basename "$f") KHÔNG đọc được bằng pg_restore — bản này vô dụng"
			log "      pg_restore nói: $(printf '%s' "$loi" | head -1)"
			ma=1
		fi
	else
		# Không tự coi là đạt. Đây đúng khuôn `caddy-config-check.mjs`: thiếu công
		# cụ thì báo BỎ QUA, không lặng lẽ tính thành xanh.
		log "BỎ QUA: không có pg_restore trên máy này, chưa kiểm được nội dung dump"
		log "        cài bằng: brew install postgresql@17"
	fi

	# tar là công cụ hệ thống, luôn có trên macOS.
	local t
	t=$(ls -1 "$DICH"/storage-*.tar.gz 2>/dev/null | sort -r | head -1)
	if [ -z "$t" ]; then
		log "HỎNG: không có file storage-*.tar.gz nào — thiếu toàn bộ file game của các bé"
		ma=1
	elif tar tzf "$t" >/dev/null 2>&1; then
		log "ổn: $(basename "$t") giải nén thử được ($(du -h "$t" | cut -f1))"
	else
		log "HỎNG: $(basename "$t") KHÔNG giải nén được"
		ma=1
	fi

	local sl
	sl=$(ls -1 "$DICH"/db-*.dump 2>/dev/null | wc -l | tr -d ' ')
	log "đang giữ $sl bản dump tại $DICH"
	return "$ma"
}

# ---------------------------------------------------------------------------

if [ "$CHI_KIEM" -eq 1 ]; then
	kiem
	exit $?
fi

# Kéo trước, kiểm sau — và kiểm CHẠY KỂ CẢ KHI KÉO LỖI. Lượt kéo hôm nay trượt
# (máy mất mạng, VPS đang restart) không có nghĩa là ở đây không còn gì dùng
# được; câu cần trả lời vẫn là "bản trong tay tôi bây giờ thế nào".
keo || true
kiem
