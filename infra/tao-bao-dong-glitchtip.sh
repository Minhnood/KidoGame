#!/usr/bin/env bash
#
# Bật thư báo lỗi của GlitchTip cho project `web`: MỖI LỖI MỚI MỘT THƯ (fen chốt 15/9).
#
#   cd /root/KidoGame/infra && bash tao-bao-dong-glitchtip.sh
#
# Chạy SAU `tao-admin-glitchtip.sh` và sau khi đã có tổ chức/team/project. Chạy lại bao
# nhiêu lần cũng được: có luật rồi thì chỉ sửa ngưỡng cho đúng.
#
# VÌ SAO CẦN SCRIPT: project mới trong GlitchTip có KHÔNG luật báo động nào — lỗi được
# ghi lại mà không ai nhận thư. Đo ngày 15/9: SMTP đã cấu hình đúng, `ProjectAlert` = 0.
# Và DB `glitchtip` không nằm trong bản sao lưu, nên dựng lại máy là mất luật này.
#
# NGỮ NGHĨA, đọc từ source v6.2.6 `apps/alerts/tasks.py`: luật "1 sự kiện / 1 phút" gửi
# thư cho mỗi issue MỘT LẦN khi nó chạm ngưỡng; issue đó lặp lại cũng không gửi nữa.
#
# NGƯỜI NHẬN, từ `apps/users/models.py`: thành viên của một TEAM gắn với project, không
# tắt thông báo. Không nằm trong team nào thì luật vẫn chạy mà không thư nào đi — nên
# script thêm mọi superuser vào team của project, rồi IN RA danh sách người nhận thật.
set -euo pipefail
cd "$(dirname "$0")"

docker compose exec -T glitchtip ./manage.py shell <<'PY' 2>&1 | grep -E '^(OK|LOI|nguoi nhan|luat|team)'
from apps.projects.models import Project
from apps.alerts.models import ProjectAlert, AlertRecipient
from apps.organizations_ext.models import OrganizationUser
from apps.users.models import User

p = Project.objects.filter(slug="web").select_related("organization").first()
if not p:
    print("LOI khong co project web — tao to chuc/team/project truoc"); raise SystemExit(1)

teams = list(p.teams.all())
if not teams:
    print("LOI project web khong thuoc team nao"); raise SystemExit(1)
for u in User.objects.filter(is_superuser=True):
    ou = OrganizationUser.objects.filter(user=u, organization=p.organization).first()
    if ou:
        ou.teams.add(*teams)
print("team", [t.slug for t in teams])

a, tao = ProjectAlert.objects.get_or_create(project=p, name="Moi loi moi mot thu", defaults={"timespan_minutes": 1, "quantity": 1})
a.timespan_minutes, a.quantity, a.uptime = 1, 1, False
a.save()
AlertRecipient.objects.get_or_create(alert=a, recipient_type="email", url="")
print("luat", a.id, "tao moi" if tao else "da co", "1 su kien / 1 phut")

nguoi = User.objects.filter(organizations_ext_organizationuser__teams__projects=p).distinct()
nguoi = User.objects._exclude_recipients(nguoi, p)
ds = [u.email for u in nguoi]
print("nguoi nhan", ds)
print("OK" if ds else "LOI khong ai nhan thu")
PY
