# Đường vào — khu quản trị và tài khoản

Tờ giấy nhớ. Chi tiết vì sao mọi thứ được dựng như vậy thì nằm trong `README.md`, mục
"Khu quản trị là một ORIGIN riêng" và "Tài khoản test".

---

## 1. Ba origin, và đừng gõ nhầm cái nào

Ở máy dev, `admin.localhost` và `play.localhost` **tự phân giải về 127.0.0.1 ở tầng
hệ điều hành** — không phải sửa `/etc/hosts`. Chrome và Safari đều vào được.

| | Máy dev | Production (theo `infra/.env`) |
|---|---|---|
| App (trẻ em, phụ huynh) | `http://localhost:3000` | `https://<APP_DOMAIN>` |
| Player (file game) | `http://127.0.0.1:3001` | `https://<PLAYER_DOMAIN>` |
| **Quản trị** | `http://admin.localhost:3000` | `https://<ADMIN_DOMAIN>` |

**`http://localhost:3000/admin` trả 404, và đó là cố ý.** Không phải 403, không
redirect: 403 là xác nhận trang có thật và đáng dò tiếp, còn redirect thì công bố luôn
khu quản trị nằm ở đâu cho bất cứ ai gõ thử. Gõ đúng host quản trị thì mới có.

Chiều ngược lại cũng vậy: trên admin origin thì `/`, `/game/<id>`, `/dang-nhap` đều
404 — origin đang giữ cookie quản trị không được phép render nội dung do trẻ em nhập.

---

## 2. Vào khu quản trị

```
http://admin.localhost:3000/admin/dang-nhap
demo@kidogame.local / demo1234ab
```

**Phải đăng nhập HAI lần, và đó không phải lỗi.** Phiên site và phiên quản trị là hai
cookie khác nhau, trên hai host khác nhau:

- **cửa site** (`http://localhost:3000/dang-nhap`) cho quyền **ĐỌC** — mở xem được
  game đã bị ẩn, vì trang `/game/<id>` nằm trên app origin.
- **cửa quản trị** (`admin.localhost:3000/admin/dang-nhap`) cho quyền **GHI** — ẩn, gỡ
  hẳn, khoá tài khoản.

Nên muốn vừa duyệt vừa xem được nội dung game đã ẩn thì đăng nhập ở **cả hai**.

Phiên site sống **30 ngày**, phiên quản trị **24 giờ**.

---

## 3. Bốn tab

| Đường dẫn | Tab | Trả lời câu hỏi |
|---|---|---|
| `/admin/tong-quan` | Tổng quan | Hôm nay có việc gì gấp không |
| `/admin` | Kiểm duyệt | Có gì trong hàng đợi nội dung |
| `/admin/tai-khoan` | Tài khoản | Gia đình này là ai · khoá/mở khoá tài khoản bé · xoá cả gia đình |
| `/admin/loi` | Lỗi | Lỗi xảy ra ở máy người dùng thật |

### Tham số lọc — `loc`, KHÔNG phải `filter`

Gõ sai tên tham số thì Next bỏ qua nó và trang về **bộ lọc mặc định**, không báo gì.
Triệu chứng đánh lừa: game PUBLISHED sạch báo cáo không có trong danh sách, trông y như
"nút Gỡ bị mất".

**Kiểm duyệt** — `/admin?loc=<...>`

| `loc` | Nghĩa |
|---|---|
| `can-xem` | **mặc định** — có báo cáo, hoặc đang không ở trạng thái hiện bình thường |
| `tat-ca` | tất cả |
| `dang-hien` | PUBLISHED |
| `an-mem` | LIMITED — chỉ vào được bằng link trực tiếp |
| `da-an` | HIDDEN |
| `da-go` | REMOVED — đang đếm ngược tới ngày xoá hẳn |

Thêm `&trang=<n>` để sang trang, `&be=<childId>` để chỉ xem game của một bé (đi từ tab
Tài khoản sang là tự có).

**Tài khoản** — `/admin/tai-khoan?loc=<...>`, kết hợp được với `&q=<chuỗi tìm>`
(hai thứ AND với nhau, bộ lọc **không** thay thế ô tìm kiếm)

| `loc` | Nghĩa |
|---|---|
| `tat-ca` | **mặc định** |
| `chua-xac-minh` | phụ huynh chưa xác minh email |
| `co-be-khoa` | gia đình có ít nhất một bé đang khoá |
| `chua-co-be` | chưa tạo tài khoản cho bé nào |
| `quan-tri` | có `isAdmin` |

Bốn cái này **không rời nhau** — chưa xác minh thì gần như chắc chắn cũng chưa có bé,
vì chưa xác minh thì không tạo được tài khoản cho con. Khác với bộ lọc của tab Kiểm
duyệt, vốn là một phân hoạch.

**Lỗi** — `/admin/loi?loc=chua-xu-ly` (mặc định) · `tat-ca` · `da-xu-ly`

Cả ba danh sách dùng chung một thanh phân trang có **số trang bấm được**; `&trang=<n>`,
và số trang luôn mang theo bộ lọc lẫn chuỗi đang tìm.

### Xoá tài khoản một gia đình

Phụ huynh gửi thư xin xoá tài khoản (quyền này `/dieu-khoan` hứa công khai). Hai đường,
cùng một lõi:

```bash
# 1. XEM TRƯỚC — mặc định không xoá gì. In ra mấy bé, mấy game, và LINK TẢI .sb3 gốc.
pnpm --filter @kidogame/web db:xoa-gia-dinh phuhuynh@vidu.com

# 2. Xoá thật. `--admin` là email của người chịu trách nhiệm, để ghi vào vết kiểm duyệt.
pnpm --filter @kidogame/web db:xoa-gia-dinh phuhuynh@vidu.com \
  --xoa --admin demo@kidogame.local --ghi-chu "Yêu cầu qua mail 6/9"

# 3. Dọn file mồ côi trên đĩa — KHÔNG tự động, phải chạy riêng.
pnpm --filter @kidogame/web storage:prune --xoa
```

Hoặc nút **Xoá tài khoản gia đình** trong tab Tài khoản, đòi gõ lại email để xác nhận.

Bốn điều phải biết trước khi bấm:

- **Gửi link tải `.sb3` cho phụ huynh trước khi xoá.** Lần chạy khô in sẵn. Xoá rồi thì
  file thành mồ côi và `storage:prune --xoa` dọn mất — sau đó không lấy lại được.
- **Hồ sơ yêu cầu gỡ bản quyền ở lại** (chụp tên game, bỏ liên kết). Cả những yêu cầu do
  chính email đó gửi đi cũng ở lại; chạy khô có đếm ra, xử lý riêng nếu cần.
- **Tài khoản có `isAdmin` thì bị từ chối.** Gỡ quyền trước — không thì mọi vết kiểm
  duyệt người đó từng ghi trên game nhà khác mất chỗ tra ra tên.
- **Việc này không đảo lại được.** Không có bảy ngày như game bị gỡ. Đường cứu duy nhất
  là bản sao lưu.

### Ẩn game và xoá hẳn game — không giống nhau

Trên trang của bố mẹ (`/phu-huynh`) mỗi game có hai nút:

| Nút | Làm gì | Nội dung còn trên mạng? |
|---|---|---|
| **Ẩn game** | rút khỏi trang, `/game/<id>` trả 404 | **CÒN** — ai có URL file vẫn mở được, vĩnh viễn |
| **Xoá hẳn** | `REMOVED` + bắt đầu đếm ngược | file bị dọn sau `REMOVED_KEEP_DAYS` ngày |

Player origin phục vụ theo mã nội dung và **không tra database**, nên ẩn không thu hồi
file. Đo được: game admin đã gỡ thì trang trả **404** mà file HTML và `.sb3` vẫn trả
**200**. `storage:prune` chỉ xoá file mồ côi, mà game đang ẩn vẫn trỏ tới file.

Ba chốt của nút Xoá hẳn: game đã `REMOVED` không có nút; game **đang có khiếu nại bản
quyền** cũng không (đội kiểm duyệt cần xem nội dung để trả lời trong hạn); phụ huynh
**không tự bật lại được**. Thư gửi ngay lúc xoá, kèm link tải `.sb3` và ngày file mất.

File `.sb3` gốc và ảnh bìa **có thể dùng chung** giữa hai game dựng từ cùng một file — khi
đó xoá một game không xoá file. Bản đã đóng gói thì luôn mất, vì mã của nó là riêng.

### Xem thư nhắc việc có hạn

```bash
pnpm --filter @kidogame/web db:nhac-viec-co-han          # chỉ IN, không gửi
pnpm --filter @kidogame/web db:nhac-viec-co-han --gui    # gửi tới OPERATOR_EMAIL
```

Service `prune` chạy lệnh này với `--gui` mỗi đêm, **trước** hai bước dọn. Nó chỉ gửi
khi có việc có hạn — yêu cầu gỡ quá hạn hoặc sắp tới hạn, game đã gỡ sắp bị xoá hẳn.
**Đêm nào im lặng là đêm không có gì**, đó là thiết kế chứ không phải hỏng.

Chưa khai `OPERATOR_NAME`/`OPERATOR_EMAIL` thì nó **từ chối gửi** và thoát khác 0 —
vẫn in đầy đủ danh sách việc ra log trước khi từ chối.

---

## 4. Tài khoản

### Máy dev — do `pnpm --filter @kidogame/web db:seed` tạo

| Vào ở | Tài khoản | Mật khẩu | Vai trò |
|---|---|---|---|
| `/dang-nhap` và `/admin/dang-nhap` | `demo@kidogame.local` | `demo1234ab` | Phụ huynh, **có `isAdmin`** |
| `/be-dang-nhap` | `beminh` | `be1234` | Bé "Bé Minh", con của tài khoản trên |

Mật khẩu này viết thẳng trong repo nên `db:seed` **từ chối chạy** khi
`NODE_ENV=production`. Đừng phá chốt đó bằng `ALLOW_PRODUCTION_SEED=1` — làm vậy là
bê đúng cái tài khoản mật khẩu công khai lên máy thật.

### Production — phong quyền, không tạo tài khoản

```bash
pnpm --filter @kidogame/web db:make-admin ban@example.com
pnpm --filter @kidogame/web db:make-admin ban@example.com --bo   # thu hồi
```

Người đó phải **tự đăng ký qua web và xác minh email trước**. Nghĩa là mật khẩu do
chính họ đặt, không đi qua repo, không qua log, không qua tay ai khác — và quyền ẩn
game của trẻ, khoá tài khoản người khác chỉ trao cho một hòm thư đã chứng minh được là
của ai.

### Tài khoản e2e tự sinh

`e2e-*@kidogame.test` và `nguoi-goc-*@vidu.test`. Mỗi lượt chạy một bộ mới. Dọn:

```sql
begin;
delete from "TakedownRequest" where "claimantEmail" like '%@vidu.test';
delete from "Parent" where email like 'e2e-%';
delete from "Game" where title = 'Game kiểm thử e2e'
   or title like 'Game hạn giữ %' or title like 'Game bản quyền %'
   or title like 'Game kiểm duyệt %' or title like 'Game xoá nhà %'
   or title like 'Game nhắc việc %' or title like 'Game ẩn xoá %';
delete from "ErrorLog" where message like 'Loi kiem thu %';
-- `LoginAttempt` không có khoá ngoại nên hai lệnh trên KHÔNG kéo theo nó.
delete from "LoginAttempt" where identity like '%e2e-%';
commit;
```

**ĐỪNG** `delete from "TakedownRequest";` không kèm điều kiện — trong đó có yêu cầu
gỡ thật.

**ĐỪNG** `delete from "ModerationLog" where action = 'ADMIN_DELETE_FAMILY';` — đó là hồ
sơ duy nhất chứng minh một lần xoá tài khoản đã được thực hiện, và nó không mang email
nên không có cách nào dựng lại. `e2e-xoa-gia-dinh` chỉ xoá đúng những dòng chính nó tạo,
lọc theo mốc thời gian.

---

## 5. Các trang khác của site

| Đường dẫn | Là gì |
|---|---|
| `/` | Trang chủ · tìm kiếm: `/?q=meo&tag=phieu-luu&tuoi=8-10` |
| `/game/<id>` | Trang chơi game |
| `/dang-ky` · `/dang-nhap` · `/quen-mat-khau` · `/dat-lai-mat-khau` | Cửa của phụ huynh |
| `/xac-minh-email?token=<...>` | Link trong thư xác minh |
| `/be-dang-nhap` | Cửa của bé |
| `/upload` | Bé đăng game |
| `/phu-huynh` | Phụ huynh quản lý bé và game của bé |
| `/dieu-khoan` | Điều khoản · quy trình gỡ · dữ liệu giữ bao lâu |
| `/bao-cao-ban-quyen` | Người ngoài gửi yêu cầu gỡ, không cần tài khoản |
| `/dev/thu` | **Hộp thư dev** — xem thư hệ thống vừa gửi, chỉ có ở máy dev |

---

## 6. Bật server ở máy dev

```bash
# App — PHẢI đổ log ra file, vì các bộ e2e đọc link xác minh email từ đó
cd apps/web && pnpm dev >> /tmp/kg-mail.log 2>&1 &

# Player (chỉ dev; production do Caddy phục vụ)
node infra/player-server.mjs > /tmp/kg-player.log 2>&1 &
```

`apps/web/.env` phải có `ADMIN_ORIGIN="http://admin.localhost:3000"` — thiếu nó thì
middleware giữ hành vi cũ và `/admin` nằm luôn trên app origin.

**Chạy lâu thì dev server chậm dần** — đã gặp tới 43 giây một request, và bộ e2e đổ ở
`page.goto` với `TimeoutError` trông y như lỗi sản phẩm. Khởi động lại là xong. Tìm PID
theo cổng, **đừng** `pkill -f next-server`:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN -t
```
