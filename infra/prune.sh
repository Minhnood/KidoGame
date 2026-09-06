#!/bin/bash
#
# Việc hằng đêm: nhắc việc có hạn, xoá hẳn game đã gỡ quá hạn, rồi xoá file không game
# nào còn trỏ tới.
#
# Cách dùng:
#   prune.sh once   — chạy một lượt rồi thoát
#   prune.sh loop   — chạy mỗi ngày vào giờ PRUNE_HOUR (mặc định 4)
#
# VÌ SAO LÀ MỘT SERVICE CHỨ KHÔNG PHẢI CRON TRÊN HOST. Cùng lý do như backup.sh:
# một việc phải có người nhớ chạy thì đúng bằng không có. Hạn giữ 7 ngày mà không ai
# chạy lệnh dọn thì nó không phải là hạn, nó là một câu trong tài liệu.
#
# VÌ SAO CHẠY SAU BACKUP MỘT TIẾNG, và đây là chỗ hai con số phải khớp nhau:
# BACKUP_HOUR mặc định 3, PRUNE_HOUR mặc định 4. Nhờ thứ tự đó, bản sao lưu của
# NGÀY XOÁ vẫn còn chứa game — tức luôn có ít nhất một bản để phục hồi nếu việc gỡ
# là sai. Đảo lại (dọn trước, sao lưu sau) thì bản sao lưu gần nhất đã không còn
# game, và "xoá sau 7 ngày" lặng lẽ thành "mất hẳn sau 7 ngày".
#
# BA BƯỚC PHẢI ĐÚNG THỨ TỰ. `db:prune-removed` xoá hàng trong DB trước, rồi
# `storage:prune` mới nhìn ra file nào thành rác. Đảo lại thì lượt đó không dọn được
# file nào, và file của game vừa xoá phải chờ tới ngày mai. Bước nhắc đi trước cả hai
# — lý do ở ngay trên `run_once`.
#
# VÌ SAO VIỆC NHẮC NẰM TRONG SERVICE NÀY chứ không phải service thứ sáu: nó cần đúng
# một image (web), đúng một đồng hồ, và chạy đúng một lần mỗi đêm — thêm một service
# nữa cho một lệnh là thêm một chỗ để quên bật. Tên service vẫn là `prune` vì đổi tên
# service trong compose là đổi tên volume và container của người đang chạy nó.
#
# Cả hai bước đều đi kèm `--xoa`. Hai script ấy mặc định chạy khô, cố ý — nhưng ở đây
# thì chạy khô nghĩa là service này in ra một danh sách rồi không làm gì, mỗi ngày.

set -uo pipefail

MODE="${1:-once}"
HOUR="${PRUNE_HOUR:-4}"

log() { echo "[prune] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

run_once() {
	local ma=0

	# BƯỚC NHẮC PHẢI ĐI TRƯỚC HAI BƯỚC DỌN, và thứ tự này là nội dung chứ không phải
	# thẩm mỹ: lá thư nói ra cả nhóm "đã quá hạn giữ, sẽ bị xoá trong lượt dọn ngay
	# sau thư này". Dọn trước thì nhóm đó đã bằng 0 lúc thư được soạn, và cái duy
	# nhất còn nói được là "đêm nay không có gì" — đúng vào đêm vừa xoá vĩnh viễn
	# công của một đứa trẻ.
	#
	# Thư này KHÔNG gửi gì khi không có việc có hạn nào, nên chạy nó mỗi đêm không
	# sinh ra một hòm thư đầy tin nhắn giống nhau.
	log "bước 1/3: nhắc việc có hạn (chỉ gửi nếu có việc)"
	if ! pnpm --filter @kidogame/web db:nhac-viec-co-han --gui; then
		log "LỖI: bước nhắc việc thất bại"
		ma=1
	fi

	log "bước 2/3: xoá hẳn game đã gỡ quá hạn"
	if ! pnpm --filter @kidogame/web db:prune-removed --xoa; then
		log "LỖI: bước xoá game thất bại"
		ma=1
	fi

	# Chạy bước 3 kể cả khi bước 2 lỗi: file rác từ những lượt trước vẫn nên được
	# dọn, và storage:prune có chốt an toàn riêng (dừng nếu DB không có Game nào).
	log "bước 3/3: dọn file không game nào trỏ tới"
	if ! pnpm --filter @kidogame/web storage:prune --xoa; then
		log "LỖI: bước dọn file thất bại"
		ma=1
	fi

	return "$ma"
}

case "$MODE" in
once)
	run_once
	;;
loop)
	log "chế độ loop: dọn hằng ngày vào ${HOUR}:00"
	while :; do
		# Cùng cách tính như backup.sh: không dùng `date -d`, cú pháp đó khác nhau
		# giữa GNU và BSD.
		now=$((10#$(date +%H) * 3600 + 10#$(date +%M) * 60 + 10#$(date +%S)))
		delta=$((10#$HOUR * 3600 - now))
		[ "$delta" -le 0 ] && delta=$((delta + 86400))
		log "chờ $((delta / 3600))h$(((delta % 3600) / 60))m tới lần dọn kế tiếp"
		sleep "$delta"
		# Một lần lỗi không được giết cả vòng lặp — hôm nay trượt thì mai thử lại.
		run_once || log "LỖI: lượt dọn này thất bại, sẽ thử lại vào ngày mai"
	done
	;;
*)
	echo "cách dùng: $0 [once|loop]" >&2
	exit 2
	;;
esac
