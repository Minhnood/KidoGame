# KidoGame

Nền tảng để trẻ em đăng tải và chia sẻ game Scratch.

Trẻ upload file `.sb3`, server kiểm tra rồi đóng gói thành HTML standalone và
phục vụ nó trên **một origin riêng, trong iframe sandbox**.

## Chạy ở máy local

Cần: Node 20+, pnpm, PostgreSQL đang chạy.

```bash
pnpm install
createdb kidogame

cd apps/web
cp .env.example .env          # sửa DATABASE_URL cho đúng user của bạn
pnpm db:push                  # tạo bảng + áp dụng constraints.sql
pnpm db:seed                  # tạo tài khoản demo
```

Mở hai cửa sổ terminal:

```bash
# App origin
pnpm --filter @kidogame/web dev            # http://localhost:3000

# Player origin — PHẢI chạy từ thư mục gốc repo
node infra/player-server.mjs               # http://127.0.0.1:3001
```

> Player chạy ở `127.0.0.1` chứ không phải `localhost` là có chủ đích: cookie
> **không** phân biệt theo port, nên chỉ đổi port thì session của app vẫn lọt
> sang. Khác hostname mới là cách ly thật.

## Kiểm thử

Hai bộ không cần server:

```bash
pnpm --filter @kidogame/sb3 test           # 50 unit test, gồm fixture độc hại
node infra/contrast-check.mjs              # 38 cặp màu, cả hai giao diện
```

Còn lại cần **cả hai server đang chạy + Chrome**, và server phải được khởi động với
**stdout đổ vào file** vì bốn bộ phải đọc link xác minh email từ log:

```bash
pnpm --filter @kidogame/web dev > /tmp/kg-mail.log 2>&1 &
node infra/player-server.mjs &

export SB3=/đường/dẫn/tới/game.sb3
export MAIL_LOG=/tmp/kg-mail.log

SB3_FIXTURE=$SB3 node infra/e2e-check.mjs                     # 44 kiểm tra
SB3_FIXTURE=$SB3 MAIL_LOG=$MAIL_LOG node infra/e2e-auth.mjs        # 25
SB3_FIXTURE=$SB3 MAIL_LOG=$MAIL_LOG node infra/e2e-moderation.mjs  # 58
SB3_FIXTURE=$SB3 MAIL_LOG=$MAIL_LOG node infra/e2e-takedown.mjs    # 43
SB3_FIXTURE=$SB3 MAIL_LOG=$MAIL_LOG node infra/e2e-discovery.mjs   # 15
SB3_FIXTURE=$SB3 MAIL_LOG=$MAIL_LOG node infra/e2e-email.mjs       # 17
GAME_URL=http://localhost:3000/game/<id> node infra/e2e-touch.mjs  # 12, chạy riêng
```

**Vì sao gần như bộ nào cũng cần `MAIL_LOG`:** `createChild` từ chối tạo tài khoản cho
bé khi email phụ huynh chưa xác minh, mà đường duy nhất để xác minh là bấm link trong
thư. Logic đọc link nằm ở `infra/e2e-mail.mjs` dùng chung — và nó có một điều kiện dùng:
phải khởi tạo bộ đọc **trước** khi đăng ký phụ huynh, xem chú thích trong file.

`e2e-check.mjs` không cần `MAIL_LOG` vì nó dùng bé `beminh` do seed tạo sẵn.

`e2e-takedown.mjs` dựng HAI game vì "gỡ hẳn" không quay lui được: một game cho nhánh
chấp nhận, một cho nhánh bác bỏ. `e2e-email.mjs` cần thêm `SB3_FIXTURE` để kiểm mail báo
phụ huynh mỗi lần con đăng game (13 → 17 kiểm tra). `e2e-moderation.mjs` phải dựng **sáu**
phụ huynh đã xác minh email — ba để chạm ngưỡng ẩn mềm, ba nữa để chạm ngưỡng ẩn hẳn.

**Chạy e2e ở cổng khác 3000 là hỏng.** Player server gửi header
`frame-ancestors <APP_ORIGIN>`, mặc định là `http://localhost:3000`. Đổi cổng app mà
quên đổi player thì trình duyệt chặn iframe, và biểu hiện KHÔNG phải lỗi CSP dễ thấy —
mà là "game không boot", "stage 0x0", trông y như lỗi đóng gói. Muốn chạy cổng khác thì
phải khởi động player server khớp theo:

```bash
APP_ORIGIN=http://localhost:3100 PLAYER_PORT=3002 node infra/player-server.mjs
PLAYER_ORIGIN=http://127.0.0.1:3002 pnpm --filter @kidogame/web exec next dev -p 3100
APP_ORIGIN=http://localhost:3100 PLAYER_ORIGIN=http://127.0.0.1:3002 \
  SB3_FIXTURE=... node infra/e2e-check.mjs
```

`e2e-touch.mjs` cần một game CÓ dùng phím (mũi tên hoặc phím cách), không thì
không có nút nào để kiểm.

### Một bộ chỉ chạy được trên bản production

```bash
cd infra && docker compose up -d --build
docker compose run --rm web pnpm --filter @kidogame/web db:deploy
node infra/e2e-prod-cookie.mjs        # 10 kiểm tra
```

Cookie phiên **đổi hình dạng theo môi trường**: ở production nó mang tiền tố `__Host-`
và cờ `Secure`, ở dev thì không — vì `dev-lan` chạy HTTP trần và cookie `Secure` sẽ
không bao giờ được đặt. Nghĩa là bảy bộ ở trên, tất cả đều chạy ở dev, không đi qua
nhánh production lấy một lần. Một nửa cơ chế đăng nhập không có ai canh.

Không phải lo xa: **ngay lần chạy đầu tiên bộ này đã bắt được một lỗi thật.**
`jar.delete()` của Next sinh ra lệnh xoá không kèm `Secure`, mà cookie `__Host-` thiếu
`Secure` thì trình duyệt từ chối cả lệnh xoá — nên đăng xuất không dọn được cookie khỏi
máy trẻ. Bản ghi `Session` vẫn bị xoá nên không thành lỗ bảo mật, nhưng bản dev thì
không có cách nào thấy được điều đó.

Vì vậy bộ này kiểm cả **chuỗi `Set-Cookie` thô**, không chỉ trạng thái cookie cuối cùng.
Đúng chỗ lỗi đã nấp.

### Test trên điện thoại thật

```bash
node infra/dev-lan.mjs
```

Script in ra một URL dạng `http://192.168.1.2:3000` — mở URL đó bằng trình duyệt điện
thoại **cùng mạng Wi-Fi**. Ctrl+C dừng cả hai server.

Không tự chạy hai server bằng tay được, vì phải khớp ĐỒNG THỜI ba thứ:

1. `PLAYER_HOST=0.0.0.0` — mặc định player chỉ nghe `127.0.0.1`, mà `127.0.0.1` trên
   điện thoại là chính cái điện thoại đó, không bao giờ tới được máy bạn.
2. `PLAYER_ORIGIN=http://<ip>:3001` — app sinh URL iframe/thumbnail theo biến này, và
   `frame-src` trong CSP của app cũng lấy từ đây.
3. `APP_ORIGIN=http://<ip>:3000` — player gửi `frame-ancestors <APP_ORIGIN>`.

Sai bất kỳ cái nào là iframe bị chặn, mà triệu chứng nhìn **y hệt lỗi đóng gói**:
"game không boot", "stage 0x0". Đừng đi tìm bug trong `packages/sb3` khi gặp cảnh đó.

Hai chỗ vướng thật khi làm việc này:

- **Máy có VPN thì phải truyền `LAN_IP` tường minh.** Script lấy địa chỉ IPv4
  không-loopback **đầu tiên** nó gặp, và trên máy có VPN thì đó có thể là địa chỉ của
  VPN chứ không phải Wi-Fi — điện thoại sẽ không bao giờ tới được. Xem `ifconfig` tìm
  IP của `en0` rồi `LAN_IP=192.168.1.2 node infra/dev-lan.mjs`.
- **Phải chọn game CÓ dùng phím**, không thì chẳng có nút nào để bấm và bạn sẽ tưởng
  chức năng hỏng. `buildTouchControls` trả về rỗng khi `detectTouchKeys` không thấy
  phím nào, nên HTML của game đó không có bộ nút. Tìm game có nút:

  ```bash
  grep -rl 'kg-touch' storage/html            # html nào có bộ nút
  grep -o '"actions":\[[^]]*\]' storage/html/7a/<sha>.html   # xem nút nào
  ```

Script cố ý dùng `next dev` chứ không `next start`: `next start` đặt
`NODE_ENV=production`, khi đó cookie phiên bật `secure: true` nên trình duyệt **từ chối
lưu cookie qua `http://`** trên LAN — đăng nhập trên điện thoại sẽ im lặng không vào
được. Chơi game thì không cần đăng nhập, nhưng thử luồng đăng game thì cần.

`infra/e2e-check.mjs` kiểm cả các tính chất bảo mật, không chỉ chức năng: iframe
trỏ đúng player origin, có sandbox, cookie phiên không rò sang player origin, và
file HTML đổi tên `.sb3` bị từ chối.

**Nó cũng soi thẳng header của player origin bằng `fetch`, không qua trình duyệt.** Đây
là phần không có gì khác bắt được: nếu ai sửa cấu hình làm `.sb3` trả về `text/html`,
mọi phép kiểm còn lại vẫn xanh — game vẫn chạy, thumbnail vẫn hiện — trong khi vừa mở
một lỗ thực thi mã trên chính origin đang phát HTML game. Các tính chất được khẳng định:

| Tính chất | Vì sao |
|---|---|
| `.sb3` **không** phải `text/html`, mà là `application/octet-stream` | File do người lạ upload không bao giờ được trình duyệt hiểu là trang web |
| `.sb3` có `Content-Disposition: attachment` | Tải về, không mở |
| Cả ba loại file có `X-Content-Type-Options: nosniff` | Thiếu nó thì trình duyệt tự đoán kiểu file, và mọi khẳng định về `Content-Type` thành vô nghĩa |
| `.sb3` và thumbnail có `Access-Control-Allow-Origin: *` | scratch-vm fetch `.sb3` cross-origin; thiếu là game không tải được project |
| HTML có CSP từ **header**, `frame-ancestors` khớp đúng app origin | Bắt thẳng cái bẫy lệch cổng, thay vì để nó hiện ra thành "game không boot" |
| CSP có `connect-src 'self'` | Game không gửi được dữ liệu ra host khác |
| Ba dạng đường dẫn sai đều 404 | Chỉ khuôn địa chỉ-hoá-theo-nội-dung mới được phát |

Các phép kiểm này viết theo **tính chất** chứ không theo cấu hình, để soi production
bằng `curl -I` là dùng lại được nguyên si. Cần thế vì `infra/player-server.mjs` (dev) và
`infra/Caddyfile` (production) là hai file phải giữ **cùng một bộ header**, mà không gì
buộc chúng khớp nhau ngoài việc có người nhớ — và bộ e2e chỉ chạm được bản dev.

### Tài khoản test

**Tài khoản cố định, do `pnpm db:seed` tạo:**

| Đăng nhập tại | Tài khoản | Mật khẩu | Vai trò |
|---|---|---|---|
| `/dang-nhap` | `demo@kidogame.local` | `demo1234ab` | Phụ huynh, **có `isAdmin`** — vào được `/admin` |
| `/be-dang-nhap` | `beminh` | `be1234` | Bé "Bé Minh", con của tài khoản trên |

`isAdmin` nằm ở cả nhánh `create` lẫn `update` của seed, nên chạy seed lại trên DB cũ
vẫn ra admin. Đây là tài khoản admin DUY NHẤT — chưa có giao diện nào phong admin cho
người khác, muốn thêm thì sửa cột `Parent.isAdmin` thẳng trong DB.

**Tài khoản do e2e tự sinh khi chạy** (mỗi lần chạy là một bộ mới, `<hex>` là 8 ký tự
ngẫu nhiên — cố ý như vậy để chạy lại nhiều lần mà không phải dọn DB):

| Do file nào tạo | Email phụ huynh | Mật khẩu | Tên đăng nhập của bé | Mật khẩu bé |
|---|---|---|---|---|
| `e2e-auth.mjs` | `e2e-<hex>@kidogame.test` | `matkhau-dai-1234` | `e2e<hex>` | `be1234` |
| `e2e-moderation.mjs` | `e2e-mod-<hex>@kidogame.test` | `matkhau-dai-1234` | `emod<hex>` | `be1234` |
| `e2e-takedown.mjs` | `e2e-td-<hex>@kidogame.test` | `matkhau-dai-1234` | `etd<hex>` | `be1234` |
| `e2e-email.mjs` | `e2e-mail-<hex>@kidogame.test` | đổi thành `matkhau-moi-5678` | `email<hex>` (chỉ khi có `SB3_FIXTURE`) | `be1234` |

Hai điều dễ làm bạn bối rối khi nhìn vào DB:

- **Bé do `e2e-auth.mjs` tạo luôn ở trạng thái đang khoá.** Phép kiểm cuối cùng của file
  đó là "khoá tài khoản thu hồi phiên ngay", nên nó khoá xong thì kết thúc. Đúng ý đồ,
  không phải rác hỏng.
- **`e2e-check.mjs` KHÔNG tự tạo tài khoản** — nó đăng nhập bằng chính bé `beminh` của
  seed rồi upload game thật. Nghĩa là mỗi lần chạy `beminh` lại có thêm một game tên
  "Game kiểm thử e2e". Chạy quá 10 lần trong một ngày là bé chạm rate limit
  `UPLOADS_PER_CHILD_PER_DAY`, và test sẽ đổ vì lý do chẳng liên quan gì tới thứ nó
  định kiểm. Thấy vậy thì dọn game của `beminh` chứ đừng đi sửa test.

`e2e-moderation.mjs` và `e2e-takedown.mjs` cần seed đã chạy vì chúng đăng nhập bằng tài
khoản admin demo. Đổi được bằng biến môi trường `ADMIN_EMAIL` / `ADMIN_PASS` nếu bạn
dùng admin khác.

`e2e-takedown.mjs` để lại một game ở trạng thái **đã gỡ hẳn** (`REMOVED`) — đó là kết
quả của nhánh "khiếu nại đúng", không phải rác hỏng. Xoá phụ huynh `e2e-td-*` là nó đi
theo.

`e2e-check.mjs` đổi được tài khoản bé qua `CHILD_USERNAME` / `CHILD_PASSWORD` nếu bạn
không muốn nó dùng `beminh`.

**Dọn dữ liệu test.** Xoá một phụ huynh sẽ cascade xuống bé → game của bé → báo cáo và
`ModerationLog` GẮN VỚI những game đó, cùng mọi phiên đăng nhập. Nhưng báo cáo do chính
phụ huynh đó GỬI ĐI trên game của người khác thì không bị xoá — cột `reporterParentId`
chỉ bị đặt về null (`onDelete: SetNull`), để lịch sử kiểm duyệt không bị thủng.

```sql
-- Toàn bộ tài khoản do e2e sinh ra
delete from "Parent" where email like 'e2e-%@kidogame.test';

-- Game rác mà e2e-check chất lên tài khoản seed
delete from "Game" where title = 'Game kiểm thử e2e';
```

Xoá bản ghi trong DB KHÔNG xoá file trong `storage/`. Các file `.sb3`/HTML/thumbnail
mồ côi vẫn nằm đó, vô hại vì tên file là sha256 của nội dung nên lần upload sau trùng
nội dung sẽ dùng lại chính chúng. Muốn dọn sạch đĩa thì xoá cả thư mục `storage/` rồi
seed lại từ đầu.

## Giao diện

Tailwind v4, cấu hình CSS-first. **Design token nằm trong `@theme` ở
`src/app/globals.css`** — đổi màu thương hiệu, bo góc, cỡ chữ chỉ sửa ở đó.

### Bảng màu chọn theo mắt trẻ em

Không phải "rực rỡ hơn" mà là **dễ đọc và đỡ mỏi mắt hơn**. Mắt trẻ khác mắt người lớn ở
ba điểm cụ thể, và mỗi điểm dẫn tới một quyết định:

| Đặc điểm của mắt trẻ | Hệ quả trong bảng màu |
|---|---|
| Thuỷ tinh thể trong hơn → truyền nhiều ánh sáng xanh hơn, chói hơn với nền trắng lạnh | Nền **ấm** (`#f8f7f3`) thay cho xanh-xám, và `surface` là trắng ngà chứ không phải `#ffffff` |
| Đang HỌC đọc, chưa đoán được từ theo hình dạng như người lớn | Chữ nội dung nhắm mức **AAA (7:1)**, không phải mức tối thiểu AA (4.5:1) |
| Loạn thị phổ biến và thường chưa được phát hiện → chữ trắng tinh trên nền gần đen bị loang viền | Chữ trên thanh điều hướng là trắng **dịu** (`#f4f4fa`), không phải `#ffffff` |

**Tương phản được ĐO, không phải ước lượng bằng mắt:**

```bash
node infra/contrast-check.mjs      # 38 cặp màu, cả hai giao diện
```

Script đọc giá trị thẳng từ `globals.css` rồi tính theo công thức WCAG 2.1. Cần một
script vì tương phản là con số chứ không phải cảm giác: một màu xám nhạt "vẫn đọc được"
trên MacBook trong phòng máy lạnh có thể vô hình trên máy tính bảng cũ ngoài hiên. Mắt
người viết code không phải mắt người dùng.

Lần đo đầu tiên có **11 cặp không đạt**, gồm hai chỗ đáng lo nhất:

- **Viền focus chỉ 2.18:1** ở giao diện sáng. Đó là thứ duy nhất cho biết bàn phím đang
  ở đâu, mà cam sáng trên nền sáng thì gần như vô hình. Nay có token `--color-focus`
  riêng: cam nâu đậm ở giao diện sáng, cam sáng ở giao diện tối.
- **Viền ô nhập 1.17:1** — ô để trẻ bấm vào mà gõ, mờ tới mức trên máy tính bảng ngoài
  sáng là không thấy có ô nào. Nay tách `--color-field-border` (≥3:1 theo WCAG 1.4.11)
  khỏi `--color-border` dùng cho mép thẻ trang trí.

**Hai token phải tách ra vì một cái không gánh được hai vai:**

- `accent-dark` từng vừa là nền hover của nút cam, vừa là màu chữ link. Làm nền thì phải
  còn ra màu cam; làm chữ trên nền sáng thì phải tối hơn nhiều. Nó thua ở vai thứ hai
  (link "Quên mật khẩu?" chỉ 2.91:1), nên màu chữ tách sang `--color-accent-text`.
- `border` từng vừa là viền ô nhập vừa là mép thẻ. Xem trên.

**Về mù màu** (~8% bé trai bị mù màu đỏ-lục): bảng màu này không dùng riêng màu để
truyền thông tin. Hộp cảnh báo và hộp lỗi đều có icon và nền riêng, không chỉ chữ màu
khác; link inline có **gạch chân** chứ không chỉ đổi màu. Đáng chú ý vì đỏ (`danger`) và
cam nâu (`accent-text`) chỉ chênh nhau 1.04:1 về độ sáng — mất cảm nhận màu là hai thứ
đó gần như giống nhau, nên dấu hiệu phi-màu là phần duy nhất còn lại.

Vài lựa chọn có chủ đích cho đối tượng trẻ em:

- Vùng chạm tối thiểu 48px (`--spacing-touch`), không phải 44px như web người lớn.
- Font Nunito có bộ dấu tiếng Việt đầy đủ, `next/font` self-host nên lúc chạy
  không có request nào ra Google — hợp CSP `default-src 'self'`.
- `line-height` rộng hơn mặc định vì dấu tiếng Việt sẽ chạm nhau.
- Ô chọn file là component tự làm (`file-picker.tsx`), không dùng
  `<input type="file">` trần — trình duyệt tự vẽ chữ "Choose File" bằng tiếng Anh
  và CSS không đổi được.

### Giao diện sáng / tối

Mặc định **chạy theo cài đặt của máy** bằng CSS thuần, không cần một dòng JS nào. Nút
trong thanh điều hướng cho tự chọn, ba trạng thái: Theo máy → Sáng → Tối → Theo máy.
"Theo máy" phải quay lại được, vì điện thoại thường tự chuyển tối vào buổi tối và một
cái nút hai trạng thái sẽ khoá người dùng ra khỏi hành vi đó ngay lần đầu họ bấm thử.

Lựa chọn lưu ở `localStorage` chứ không phải cookie: đây là sở thích của từng MÁY chứ
không của tài khoản (bé dùng máy bố mẹ buổi tối là chuyện thường), và cookie thì bị gửi
kèm mọi request rồi ép server render khác nhau cho hai giao diện.

**Hai màu KHÔNG đảo theo giao diện: `chrome` và `chrome-ink`.** `--color-ink` là màu
CHỮ nên ở giao diện tối nó sáng lên — vì vậy mọi chỗ cần "một màu tối thật" phải dùng
`chrome`: nền thanh điều hướng, nền khung chơi game, và **chữ trên nền cam accent**
(cam vẫn là cam ở cả hai giao diện, nên chữ trên nó phải tối ở cả hai). Dùng `text-ink`
trên nền cam là bật giao diện tối thành chữ sáng trên nền cam, đọc không nổi.

**Ba cái bẫy đã vấp thật khi làm phần này** — đều thuộc loại trang vẫn hiện đúng, không
phép kiểm nào đỏ, chỉ có console biết:

1. **Tự viết thẻ `<head>` trong layout gốc gây lệch hydration.** App Router tự quản lý
   `<head>`. Script chống loé vì vậy nằm ở đầu `<body>` — vẫn kịp, vì CSS trong
   `<head>` đã tải xong và trình duyệt chưa có nội dung nào để vẽ.
2. **Trình duyệt XOÁ thuộc tính `nonce` khỏi DOM sau khi parse** (để script bị chèn vào
   không đọc được nonce mà tự cấp phép). React so `nonce` nó render với `nonce=""` trong
   DOM rồi báo lệch. Không sửa được từ phía ta — hành vi xoá đó chính là lớp bảo vệ —
   nên thẻ script mang `suppressHydrationWarning`. Cùng lý do này làm mọi phép kiểm
   kiểu "HTML có nonce không" đọc bằng `page.content()` đều sai: phải đọc bằng `curl`.
3. **`light-dark()` gọn hơn hẳn khối CSS hiện tại nhưng đã bị loại.** Nó cần Safari
   17.5+ / Chrome 123+; trên máy cũ hơn thì biến màu thành không hợp lệ và **cả bảng
   màu sập**. Người dùng ở đây là trẻ em dùng máy bố mẹ thải lại, nên chọn dài dòng mà
   không vỡ.

`e2e-check` canh 10 phép kiểm cho phần này, gồm cả "giao diện tối có đảo màu CHỮ không"
(chỉ đảo nền là được chữ tối trên nền tối — vẫn "có giao diện tối" và vẫn không đọc
được) và "không có lệch hydration nào".

## Tài khoản và phân quyền

Ba vai, và ranh giới giữa chúng là có chủ đích:

- **Phụ huynh** — tài khoản duy nhất có email. Tạo tài khoản cho con, khoá/mở khoá,
  đổi mật khẩu cho con, **ẩn game của con**. KHÔNG đăng game hộ con.
- **Bé** — không email, không tên thật. Chỉ bé mới đăng được game, để game ghi công
  đúng người làm.
- **Khách** — chỉ xem và chơi.

Phiên lưu trong DB, **không dùng JWT**: phụ huynh phải thu hồi được phiên của con
ngay lập tức (khoá tài khoản, đổi mật khẩu). JWT đã phát ra thì không gọi về được.

Mật khẩu băm bằng scrypt của `node:crypto` (N=2^16), không thêm dependency native.
Băm mật khẩu **chỉ ở `src/lib/password.ts`** — đừng tự gọi scrypt ở chỗ khác, hai
bên lệch định dạng là hash không verify được mà không ai báo lỗi.

Chống dò mật khẩu khoá theo danh tính (email/username), **không theo IP**: cả một
lớp học hay một gia đình thường dùng chung IP.

### Xác minh email chặn đúng MỘT việc

Phụ huynh chưa xác minh email thì **không tạo được tài khoản cho con**. Ngoài việc đó,
không chặn gì cả.

Ba lý do chọn đúng chỗ này, và không chọn chỗ khác:

- **Tạo tài khoản cho con chính là cơ chế đồng ý của người đại diện** (Nghị định
  13/2023, COPPA). Một sự đồng ý gắn với hòm thư chưa ai chứng minh là đọc được thì gần
  như không có giá trị — bất kỳ ai cũng gõ được email người khác vào form đăng ký.
- **Đây là chỗ duy nhất chặn được mà không khoá ai ra khỏi thứ gì.** Chặn ở lúc đăng
  nhập thì một lá thư rơi vào thư rác là cả gia đình mất quyền vào tài khoản. Chặn ở các
  thao tác an toàn (khoá tài khoản con, ẩn game của con) thì tệ hơn nữa — đó là những
  việc phải làm được NGAY.
- **Nó làm lớp tự động của phần kiểm duyệt sống lại.** Ngưỡng báo cáo chỉ đếm phụ huynh
  đã xác minh; không có cổng này thì gần như không ai xác minh, và ngưỡng đó gần như
  không bao giờ nổ.

Chặn ở **tầng lib** (`createChild` trong `src/lib/auth.ts`), không ở route: đường nào sau
này tạo tài khoản con (nhập theo lớp học, API cho trường) cũng tự thừa hưởng. Trang
`/phu-huynh` không render form khi chưa xác minh — nhưng đó là trải nghiệm, không phải
lớp bảo vệ, và `e2e-auth` kiểm riêng việc server tự từ chối: nó gỡ cờ xác minh trong DB
trong khi form hợp lệ đang mở, rồi bấm gửi.

Tài khoản seed `demo@kidogame.local` được đánh dấu đã xác minh ngay trong seed, vì hòm
thư đó không tồn tại nên không có link nào để bấm.

> **MAIL HỎNG GIỜ LÀ SỰ CỐ CHẶN NGƯỜI DÙNG MỚI — không còn là chuyện bất tiện.**
>
> Trước cổng này, `RESEND_API_KEY` sai chỉ làm hỏng luồng quên mật khẩu. Bây giờ nó
> chặn hẳn việc lên sàn: phụ huynh đăng ký được, đăng nhập được, nhưng **không bao giờ
> tạo được tài khoản cho con**, nên đứa trẻ không có gì để đăng game.
>
> Đã kiểm chứng trên stack Docker với khoá Resend giả: đăng ký vẫn thành công (cố ý —
> mail trượt không được làm hỏng việc đăng ký), cảnh báo hiện ra, khung tạo tài khoản
> con biến mất. Nút **Gửi link xác minh** là đường thoát duy nhất, và nó có hiện lỗi
> nếu gửi tiếp tục trượt — nhờ vậy người dùng biết là hệ thống đang lỗi chứ không phải
> họ làm sai.
>
> Vì vậy trước khi mở cho người thật: gửi thử một lá thư xác minh tới hòm thư có thật
> và bấm được link, coi đó là điều kiện bắt buộc của việc triển khai.

## Báo cáo, và bốn trạng thái của một game

Game public ngay khi đăng, không có hàng đợi duyệt trước — nên lớp tự động dưới đây là
lớp hậu kiểm chạy không cần người. Quy tắc nằm gọn trong
[`communityStatus`](apps/web/src/lib/moderation.ts), và **mọi** chỗ cần trả lời "bỏ lệnh
ẩn thì game về đâu" đều phải gọi hàm đó.

| Trạng thái | Trang chủ & tìm kiếm | Link trực tiếp | Ai đặt |
|---|---|---|---|
| `PUBLISHED` | có | chơi được | mặc định |
| `LIMITED` | **không** | **chơi được** | tự động, 3 báo cáo đã xác minh |
| `HIDDEN` | không | 404 | tự động ở 6 báo cáo, hoặc phụ huynh, hoặc yêu cầu gỡ bản quyền |
| `REMOVED` | không | 404 | chỉ admin |

**Chỉ báo cáo của phụ huynh đã xác minh email được tính vào ngưỡng.** Trẻ và khách vẫn
báo cáo được, vẫn vào hàng đợi admin, chỉ không tự kích hoạt gì. Lý do: khách vãng lai
khoá chống trùng theo hash IP, nên một người có Wi-Fi + 4G + VPN là tự đủ ba báo cáo mà
không cần rủ ai — "ngưỡng 3" khi đó thực chất chỉ đắt bằng ba địa chỉ IP. Đòi email đã
xác minh biến giá đó thành ba hòm thư thật. Hai con số nằm ở hai cột riêng
(`reportCount` và `trustedReportCount`) và trang `/admin` hiện cả hai, vì thấy "5 báo
cáo" mà game vẫn hiện thì người ta sẽ tưởng cơ chế hỏng.

**Vì sao mức ẩn mềm tồn tại.** Mức đầu tiên xảy ra khi *chưa có người nào* xem nội dung
game. Rút khỏi trang chủ là đã chặn đúng thứ cần chặn — đường lan truyền, không ai còn
tình cờ gặp nội dung xấu nữa — trong khi game của một đứa trẻ bị vùi oan không biến mất
trước mặt những người bạn nó vừa gửi link cho. Hai loại thiệt hại không đối xứng, và
người chịu loại thứ hai là đứa trẻ.

**Ba ràng buộc dễ vô tình phá:**

1. **Phụ huynh ẩn được bất cứ lúc nào, nhưng "hiện lại" chỉ về tới mức cộng đồng cho
   phép.** Không có ràng buộc này thì việc đếm báo cáo là vô nghĩa — bấm một cái là về
   `PUBLISHED`, và bấm lại được mãi.
2. **Game `LIMITED` vẫn còn nút báo cáo.** Bỏ nó thì mức ẩn mềm thành cái sàn không bao
   giờ leo lên `HIDDEN`, và ngưỡng gấp đôi trở thành chữ chết.
3. **Yêu cầu gỡ bản quyền phải ẩn được cả game đang `LIMITED`.** Game đó vẫn chơi được
   bằng link nên vẫn đang phát tán nội dung, mà `/dieu-khoan` thì hứa công khai là ẩn
   ngay khi nhận.
4. **Phụ huynh không bật lại được game đang có yêu cầu gỡ bản quyền chờ xử lý.** Cùng
   loại ràng buộc với điểm 1 nhưng ở luồng khác, và từng là lỗ thật: khiếu nại ẩn game
   xong, phụ huynh bấm "Hiện lại" một cái là game công khai trở lại, không lỗi gì. Hệ
   quả thứ hai còn khó thấy hơn — `adminResolveTakedown` tính "đã cho hiện lại chưa"
   bằng điều kiện `status: 'HIDDEN'`, nên game đã bị bật lại thì người khiếu nại nhận
   thư nói *"game vẫn đang ẩn"* trong khi nó đang chạy công khai.

Phụ huynh nhận mail ở cả hai mức. Mail cố ý KHÔNG nói ai đã báo cáo và vì lý do gì: lý
do là dữ liệu để admin phán xử, đưa cho phụ huynh thì mở đường đoán xem đứa nào trong
lớp đã bấm nút.

**Đánh đổi đã biết, chưa xử:** hiện không có gì bắt phụ huynh xác minh email ngoài một
banner nhắc ở `/phu-huynh`, nên lớp tự động sẽ nổ ít hơn hẳn so với khi đếm mọi báo cáo.
Đổi lại nó không còn bị lách bằng vài phút đổi mạng. Muốn lớp tự động mạnh hơn thì phải
làm cho việc xác minh email trở nên bắt buộc hoặc đáng làm — đó là quyết định sản phẩm.

## Nút điều khiển trên điện thoại

Game dùng phím mũi tên hoặc phím cách sẽ tự có nút cảm ứng khi mở trên điện thoại.

Cách hoạt động: lúc đóng gói, `packages/sb3/src/keys.ts` dò `project.json` xem game
dùng phím nào, rồi `touch-controls.ts` sinh CSS/JS nhúng vào trang game qua
`options.custom.js`. Game **không** dùng phím thì không có nút nào.

Vì sao nút phải nằm bên trong trang game: game chạy trong iframe **khác origin**,
trang cha không bắn được sự kiện bàn phím vào trong. Nút gọi thẳng
`vm.postIOData('keyboard', ...)`, không giả lập `KeyboardEvent`.

Hai điều đã thử và bỏ, đừng làm lại:

- **Cộng chiều cao khung game để chừa dải trống cho nút.** Runtime canh stage vào
  giữa (`preserve-ratio`) nên nửa phần dư dồn lên trên, tạo dải đen trống ở đầu
  khung mà nút vẫn vắt ngang mép stage.
- **Dùng `chunks.gamepad` của packager.** Đó là hỗ trợ tay cầm vật lý và con trỏ
  ảo, không phải nút cảm ứng.

Trải nghiệm tốt nhất trên điện thoại vẫn là bấm nút toàn màn hình — khung nhúng
chỉ cao khoảng 280px nên nút nào cũng chiếm chỗ.

## Triển khai lên VPS (M5)

> **Chưa `docker compose up` lần nào.** Cấu hình dưới đây viết trên máy chưa cài
> Docker, nên phần Dockerfile/compose/Caddy chỉ được đọc kỹ, chưa được máy nào
> xác nhận. Lần deploy đầu tiên hãy coi là buổi gỡ lỗi, đừng coi là buổi phát hành.
>
> Ngoại lệ: `infra/backup.sh` **đã kiểm thật** — chạy trên host với Postgres của
> máy dev, và bản dump đã được phục hồi vào một DB tạm rồi đối chiếu số hàng, còn
> bản tar đã giải nén ra so hash từng file. Phần chưa biết của nó chỉ là dây nối
> trong container (mount, env, entrypoint), không phải logic sao lưu.

Bốn service: `db` (Postgres 17), `web` (Next.js), `caddy` (TLS + reverse proxy +
serve file tĩnh cho player origin), `backup` (dump hằng ngày).

**Không có service nào chạy `player-server.mjs`.** File đó chỉ dùng khi dev trên
máy local. Ở production chính Caddy serve thư mục `storage`, đúng như
`infra/Caddyfile` đã viết từ M0.

Trước khi bắt đầu: trỏ A/AAAA của **cả hai** domain về IP của VPS. Caddy xin
chứng chỉ ngay lúc khởi động, DNS chưa trỏ là thất bại.

```bash
cd infra
cp .env.example .env      # sửa POSTGRES_PASSWORD, hai domain, RESEND_API_KEY,
                          # OPERATOR_NAME, OPERATOR_EMAIL
docker compose up -d --build

# Dựng schema. PHẢI chạy tay, không tự chạy lúc boot — tự migrate khi khởi động
# là thứ đến một lúc nào đó sẽ tự đổi DB production vào giữa đêm.
#
# `db:deploy` chứ không phải `db:push` — khác đúng một cờ `--skip-generate`.
# Prisma client đã sinh lúc build image; generate lại trong container sẽ cố ghi vào
# /app/node_modules do root sở hữu trong khi tiến trình chạy bằng user `node`, và
# in ra một lỗi EACCES giữa bước migrate. Nó không làm hỏng gì, nhưng một bước
# deploy bình thường mà in lỗi quyền thì hoặc làm người ta hoảng, hoặc làm người ta
# quen mắt bỏ qua cả những lỗi thật về sau.
docker compose run --rm web pnpm --filter @kidogame/web db:deploy

# Chỉ khi muốn có dữ liệu mẫu (tài khoản demo!). Bỏ qua nếu là VPS thật.
docker compose run --rm web pnpm --filter @kidogame/web db:seed
```

**Domain khai đúng một chỗ: `infra/.env`.** Compose truyền `APP_DOMAIN` /
`PLAYER_DOMAIN` vào cả Caddy và app, nên Caddyfile không còn viết cứng domain
nữa. Đừng sửa domain trực tiếp trong Caddyfile: lệch giữa hai chỗ thì
`frame-ancestors` không khớp app origin, iframe bị chặn, và triệu chứng là *"game
không boot"* / *"stage 0x0"* — nhìn y hệt lỗi đóng gói. Đây đúng là cái bẫy đã
vấp ở dev khi chạy e2e lệch cổng 3000.

**Đổi domain chỉ cần `docker compose up -d`, không phải `--build`.** CSP được dựng lại
theo từng request trong `src/middleware.ts` và đọc env lúc chạy, nên không có gì bị chốt
cứng vào image. Đã kiểm chứng bằng cách chạy image với một `PLAYER_ORIGIN` chưa từng tồn
tại lúc build và thấy `frame-src` đổi theo.

#### Thử toàn bộ stack trên máy trước khi lên VPS

Chạy y nguyên cấu hình production trên laptop sẽ hỏng: Caddy thấy domain thật là đi
xin chứng chỉ Let's Encrypt, mà domain đó không trỏ về máy bạn. Dùng domain kết thúc
bằng `.localhost` — Caddy coi chúng là nội bộ nên cấp chứng chỉ bằng CA riêng, không
đụng ACME. macOS phân giải sẵn `*.localhost` về 127.0.0.1, không cần sửa `/etc/hosts`.

```bash
cd infra
cp .env.example .env
# rồi sửa trong .env:
#   APP_DOMAIN=app.localhost
#   PLAYER_DOMAIN=play.localhost
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)
#   RESEND_API_KEY=re_dummy_local   # BẮT BUỘC có giá trị, compose khai dạng `:?`

docker compose up -d --build
docker compose run --rm web pnpm --filter @kidogame/web db:deploy
```

Mở `https://app.localhost` và chấp nhận cảnh báo chứng chỉ. **Phải vào
`https://play.localhost` một lần và chấp nhận riêng cho origin đó nữa** — không làm
thì iframe bị chặn vì lỗi chứng chỉ, và triệu chứng lại đúng là *"game không boot"*.
Cùng một triệu chứng, nguyên nhân thứ ba.

Soi header player origin bằng `curl -k` (`-k` vì chứng chỉ tự ký):

```bash
curl -skI https://play.localhost/sb3/<xx>/<sha>.sb3
```

Đối chiếu với bảng tính chất ở mục [Kiểm thử](#kiểm-thử). `infra/e2e-check.mjs` đã tự
động hoá đúng bộ đó cho bản dev; bước tay ở đây là để xác nhận Caddy khớp với
`player-server.mjs`.

### Mail thật — điều kiện bắt buộc để mở cửa

Từ khi bắt xác minh email, mail hỏng **chặn hẳn người dùng mới**: phụ huynh không
xác minh được thì không tạo được tài khoản cho con, tức đứa trẻ không có gì để
đăng game. Trước đó `RESEND_API_KEY` sai chỉ hỏng luồng quên mật khẩu; giờ nó
hỏng cả cửa vào.

Cái khó là nó hỏng **im lặng**. `docker compose up` vẫn xanh, trang chủ vẫn chạy,
bốn service vẫn healthy. Lỗi chỉ lộ ra khi một phụ huynh thật bấm nút và không
nhận được thư — lúc đó họ đã bỏ đi rồi. Nên có script riêng để hỏi thẳng:

```bash
set -a && . infra/.env && set +a          # nạp env production
node infra/mail-check.mjs                 # kiểm cấu hình + DNS
node infra/mail-check.mjs --send ban@gmail.com   # gửi thật một lá
```

Nó kiểm bốn tầng, theo đúng thứ tự hay hỏng:

1. `RESEND_API_KEY`, `MAIL_FROM`, `APP_ORIGIN` có mặt và **đúng định dạng**. Sai
   định dạng `MAIL_FROM` là kiểu lỗi tệ nhất: Resend trả 422, `sendMail` ném lỗi,
   người dùng chỉ thấy "gửi thư thất bại" và không ai biết vì sao.
2. Key gọi được API, và domain trong `MAIL_FROM` đã đăng ký + **verified** ở
   Resend. Chưa đăng ký thì Resend chỉ cho gửi tới chính hòm thư chủ tài khoản —
   đủ để thử, không đủ để mở cửa.
3. DNS: hỏi thẳng DNS công cộng cho từng bản ghi mà **Resend nói domain này cần**
   (đọc qua API, không chép cứng, vì Resend đổi region là đổi hostname), cộng
   DMARC. Không tin trạng thái Resend cache lại: bản ghi có thể đã bị xoá hoặc bị
   nhà cung cấp DNS ghi đè sau lần verify.
4. `--send` thì gửi thật.

**Script xanh hết vẫn CHƯA phải là xong.** Mốc thật là: đăng ký một tài khoản phụ
huynh bằng hòm thư có thật, nhận được thư, và **bấm được link xác minh**. Thư rơi
vào Spam cũng tính là hỏng. Script chỉ loại trước những cách hỏng dễ đoán.

### Sao lưu

Service `backup` chạy sẵn trong stack, mỗi ngày vào `BACKUP_HOUR` (mặc định 3
giờ): dump Postgres + đóng gói `storage`, giữ `BACKUP_KEEP` bản gần nhất (mặc
định 7), đổ vào `BACKUP_HOST_DIR` trên host (mặc định `infra/backups`).

**3 giờ đó là giờ Việt Nam**, vì compose đặt `TZ=Asia/Ho_Chi_Minh` cho service này.
Không có dòng TZ thì container chạy UTC và `BACKUP_HOUR=3` sẽ là **10 giờ sáng giờ
ta** — đúng quãng trẻ hay chơi. Con số 3 đọc lên ai cũng hiểu là 3 giờ sáng, nên nó
phải đúng là 3 giờ sáng. Vận hành ở múi giờ khác thì đổi `TZ` trong `infra/.env`.

Là một service trong compose chứ không phải cron trên host, cố ý: cron trên host
là một bước cài đặt riêng nằm ngoài repo, và là thứ người ta quên. Backup mà quên
bật thì đúng bằng không có backup, nhưng lại cho cảm giác đã có.

```bash
docker compose exec backup /backup.sh once   # sao lưu ngay, không chờ tới 3 giờ
docker compose logs backup                   # xem lần gần nhất chạy thế nào
ls -lh infra/backups                         # xem có gì
```

**Thứ tự dump là có chủ đích: DB trước, file sau.** Hai việc không nằm trong cùng
transaction nên phải chọn thứ tự sao cho bản sao lưu không tự mâu thuẫn. Lúc đăng
game, file được ghi xuống đĩa TRƯỚC rồi mới tạo hàng trong DB, và file không bao
giờ bị xoá (tên file là hash nội dung). Nên mọi hàng trong bản dump đều đã có file
tương ứng từ trước, và file ấy chắc chắn còn nguyên khi `tar` chạy. Làm ngược lại
thì bản dump có thể chứa game mà file chưa nằm trong tar — phục hồi ra một game
bấm vào là 404.

Script kiểm luôn bản vừa tạo (`pg_restore --list` và `tar tzf`) rồi mới coi là
xong. Dump chạy hết lệnh không có nghĩa là dump đọc được, mà backup hỏng lặng lẽ
còn tệ hơn không có backup.

**Mặc định vẫn CHƯA phải backup thật.** `infra/backups` nằm cùng ổ đĩa với dữ
liệu gốc: nó chống lỡ tay xoá, không chống ổ đĩa chết. Mỗi lần chạy mà chưa cấu
hình gì thêm, script in đúng một dòng nhắc lại điều đó — cố ý, để trạng thái
"chưa an toàn" không im lặng trôi qua hàng trăm dòng log.

Có hai cách chữa, chọn một:

| Cách | Chống được | Không chống được |
|---|---|---|
| `BACKUP_HOST_DIR=/mnt/o-khac/kidogame` | ổ chính chết | VPS bị xoá, tài khoản nhà cung cấp bị khoá |
| `BACKUP_REMOTE=user@host:/duong/dan` | cả hai | — |

`backups/` đã nằm trong `.gitignore` và `.dockerignore`: bản dump chứa email phụ
huynh và hash mật khẩu, lỡ commit một file là rò dữ liệu người dùng vào lịch sử
git, nơi xoá đi cũng không mất.

#### Đẩy bản sao lưu ra khỏi máy

Đặt `BACKUP_REMOTE` là bật. Sau mỗi lần sao lưu, script `rsync --delete` toàn bộ
thư mục sang máy kia. Đầu kia chỉ cần `sshd` và `rsync` — không cần Docker,
không cần Postgres.

```bash
ssh-keygen -t ed25519 -N '' -f infra/ssh/id_backup      # khoá riêng, không commit
ssh-copy-id -i infra/ssh/id_backup.pub user@host        # hoặc dán tay vào authorized_keys
ssh-keyscan -p 22 host > infra/ssh/known_hosts          # BẮT BUỘC, xem bên dưới
# rồi trong infra/.env:  BACKUP_REMOTE=user@host:/srv/kidogame-backups
docker compose up -d --build backup
docker compose exec backup /backup.sh once              # thử ngay, đừng chờ 3 giờ sáng
```

**Phải là `docker compose exec`, KHÔNG phải `run`.** Service này khai
`entrypoint: [bash, /backup.sh, loop]`, nên `docker compose run backup /backup.sh once`
nối chuỗi thành `bash /backup.sh loop /backup.sh once` — chế độ `loop`, và nó ngồi im
chờ tới 3 giờ sáng. Không báo lỗi, không in gì nếu output bị pipe. Nhìn y như treo máy.

Bốn điều đã cân nhắc, đừng vô tình gỡ:

- **Xoay vòng trước, đẩy sau.** `rsync --delete` làm đầu kia giống hệt đầu này,
  kể cả phần vừa xoá. Đẩy trước rồi mới xoay vòng thì bản cũ đọng lại bên kia
  vĩnh viễn, và ổ đó đầy vào một ngày không ai để ý.
- **`StrictHostKeyChecking=yes`, và `known_hosts` phải do người chuẩn bị.** Cách
  quen tay là `-o StrictHostKeyChecking=no`. Ở đây thì không: bước này gửi toàn
  bộ dữ liệu người dùng — email phụ huynh, hash mật khẩu, file của trẻ — sang
  đầu kia. Tin bừa host key nghĩa là ai chen được vào giữa cũng nhận trọn gói
  đó, và không để lại dấu vết nào. Thiếu `known_hosts` thì script **dừng và
  báo lỗi** chứ không lặng lẽ bỏ qua.
- **Đếm lại file ở đầu kia sau khi rsync xong.** `rsync` trả 0 không có nghĩa là
  bên kia có file đọc được: quota đầy, thư mục mount nhầm, đường dẫn gõ sai đều
  có thể im lặng.
- **Đẩy trượt là cả lần sao lưu bị coi là thất bại** (mã thoát khác 0, log in
  `LỖI`). Bản dump nội máy vẫn còn nguyên, nhưng một bản sao lưu ngoài máy đang
  không xảy ra thì phải kêu — không thì ta sống nhiều tháng với niềm tin sai.

Service `backup` giờ build từ `infra/Dockerfile.backup` thay vì dùng thẳng
`postgres:17`, chỉ để thêm `rsync` và `openssh-client`. Vẫn `FROM postgres:17`:
`pg_dump` lệch major với server là nó **từ chối** chạy, nên hai service phải ghim
chung một tag.

Khoá SSH nằm ở `infra/ssh/`, mount vào container chỉ-đọc, và bị chặn ở cả
`.gitignore`, `.dockerignore` gốc lẫn `infra/.dockerignore` (build context của
service này là `infra/`, nên nó cần file `.dockerignore` riêng — Docker chỉ đọc
cái nằm cạnh context).

**Đã chạy thử thật, không chỉ đọc code.** Dựng một container `sshd` làm máy đích trên
cùng network rồi đẩy sang đó, kiểm bốn thứ:

| Kiểm | Kết quả |
|---|---|
| Đẩy được, file bên kia giống hệt | `sha256` khớp từng byte |
| `--delete` phản chiếu phần đã xoay vòng | hạ `BACKUP_KEEP=1`, đầu kia từ 6 file còn 2 |
| Host key sai thì TỪ CHỐI | `Host key verification failed`, mã thoát 1 |
| Host key đúng thì chạy | mã thoát 0 |

Phép kiểm thứ ba là phép quan trọng nhất. Nó chứng minh rằng nếu ai đó chen được vào
giữa, bản sao lưu **không** đi tới máy của họ — chứ không phải chỉ là ta hy vọng thế.

### Phục hồi

```bash
# 1. DB. Dừng app trước để không ai ghi vào giữa lúc phục hồi.
docker compose stop web
docker compose exec -T db psql -U kidogame -d postgres \
  -c 'DROP DATABASE IF EXISTS kidogame;' -c 'CREATE DATABASE kidogame OWNER kidogame;'

# Nháy ĐƠN quanh cả lệnh, và $DATABASE_URL nằm trong nháy kép bên trong. Xem cảnh
# báo ngay dưới — viết sai chỗ này là lệnh chạy vào hư không.
docker compose exec -T backup sh -c 'pg_restore -d "$DATABASE_URL" /backups/db-<stamp>.dump'

# 2. File game.
docker compose run --rm -v ./backups:/backups:ro web \
  tar xzf /backups/storage-<stamp>.tar.gz -C /srv/storage

docker compose start web
```

**Vì sao phải bọc `sh -c '…'`.** Viết thẳng
`docker compose exec -T backup pg_restore -d "$DATABASE_URL" …` thì `$DATABASE_URL`
được **shell của host** khai triển, mà trên host biến đó thường rỗng. `pg_restore`
nhận chuỗi rỗng, quay ra tìm socket Postgres local *bên trong container backup* —
nơi không có Postgres nào — và báo:

```
connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed
```

Thông báo đó chỉ vào một cái socket, không chỉ vào biến môi trường, nên rất dễ đi
sai hướng. Và đây là lệnh người ta gõ lúc vừa mất dữ liệu, thường là lúc nửa đêm.
Bọc trong nháy đơn để **container** khai triển biến của chính nó.

**Đã diễn tập thật, không chỉ viết ra.** Đăng một game qua bản production, sao lưu,
rồi xoá sạch: `delete from "Parent"` (cascade cuốn theo Child và Game) và xoá cả ba
thư mục trong `storage`. Phục hồi theo đúng các lệnh trên, kết quả:

| Kiểm | Kết quả |
|---|---|
| Số hàng Parent / Child / Game | khớp hiện trạng trước khi phá |
| CHECK constraint `game_counts_non_negative` | còn |
| Enum `GameStatus` đủ cả `LIMITED` | còn |
| Trang chủ hiện lại game | có |
| Game **boot được**, stage 712×534 | có |
| File nào của storage bị 404 | không cái nào |

Dòng áp chót là dòng đáng giá nhất: nó phân biệt "DB phục hồi xong" với "đứa trẻ
bấm vào game của mình và chơi được". Hai thứ đó không giống nhau, và thứ tự dump ở
mục trên tồn tại chính là để chúng luôn đi cùng nhau.

Một điều đã xác nhận nhân tiện: container `backup` mount `storage` **chỉ đọc** thật
— thử `rm -rf` từ trong đó thì nhận `Read-only file system`.

CHECK constraint trong `prisma/constraints.sql` **có** đi theo bản dump. Nhưng nếu
bạn phục hồi bằng cách nào khác (dump `--data-only`, hay dựng schema bằng
`prisma db push` rồi nạp dữ liệu) thì phải chạy lại `pnpm db:constraints`, vì các
ràng buộc đó không nằm trong Prisma schema.

`caddy_data` mất thì chỉ phải xin lại chứng chỉ, không cần sao lưu.

Image cố ý **không** dùng multi-stage, **không** dùng `output: 'standalone'` và
**không** `prune --prod`. Lý do từng cái nằm trong comment đầu `infra/Dockerfile`
— tóm gọn: node_modules của pnpm là một rừng symlink, và `prisma`/`tsx` là
devDependencies mà lệnh migrate lại cần. Đổi lại image nặng khoảng 1.5GB.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/sb3` | Kiểm tra, chuẩn hoá, đóng gói, thumbnail. **Toàn bộ phần bảo mật nằm ở đây.** |
| `apps/web` | Next.js + Tailwind v4: giao diện, API, Prisma |
| `apps/web/src/components` | Bộ component dùng chung (button, field, notice, card, file-picker) |
| `infra` | Server tĩnh cho dev, Caddyfile + Dockerfile + compose + backup.sh cho production, script e2e |
| `storage` | File theo địa chỉ nội dung: `sb3/`, `html/`, `thumb/` |

## CSP của app origin — nonce, không phải unsafe-inline

Policy sống trong [`src/middleware.ts`](apps/web/src/middleware.ts), **không** trong
`next.config.ts`.

Trước đây nó phải mang `script-src 'unsafe-inline'` vì Next chèn script inline để
hydrate. Nhưng `'unsafe-inline'` làm `script-src` gần như vô nghĩa: chỗ nào lọt được một
thẻ `<script>` vào HTML là chạy được. Trên một trang mà tên game và mô tả do trẻ con
nhập được render ra, đó là lớp phòng thủ không nên bỏ trống.

Nonce sửa đúng chỗ đó. Mỗi lần tải trang sinh 16 byte ngẫu nhiên; chỉ script mang đúng
chuỗi đó mới chạy, và kẻ tấn công không đoán được nonce của lần tải trang mà nạn nhân
đang mở.

**Ba điều dễ làm hỏng:**

1. **`requestHeaders.set('content-security-policy', ...)` KHÔNG thừa.** Next lấy nonce
   bằng cách đọc header CSP trên *request* mà middleware đặt vào, rồi tự gắn vào thẻ
   script của nó. Bỏ dòng đó là trang trắng.
2. **Không được để CSP ở cả hai nơi.** Hai header CSP thì trình duyệt áp dụng GIAO của
   chúng — cái cũ không có nonce, cái mới không có `'unsafe-inline'`, giao lại là không
   script nào chạy. Vì vậy `next.config.ts` chỉ còn các header tĩnh khác.
3. **`'unsafe-eval'` chỉ ở dev.** `next dev` build bundle bằng devtool eval-source-map.
   Thiếu nó thì client component không hydrate và hỏng **im lặng** — trang vẫn hiện đủ,
   chỉ mọi nút bấm không phản ứng.

`style-src` **cố ý giữ `'unsafe-inline'`**: `next/font` và Tailwind đều chèn thẻ
`<style>` không đi qua đường nonce của Next. Siết chỗ đó đổi lấy rủi ro giao diện vỡ
không rõ nguyên nhân, trong khi lợi ích nhỏ hơn hẳn — CSS inject được thì xấu, script
inject được thì mất phiên đăng nhập của trẻ.

Middleware bỏ qua `/_next/static` và `/_next/image`. Không phải để nhanh: nonce phải
khác nhau mỗi lần tải, nên response mang nonce thì không cache dùng chung được, mà
`/_next/static` vốn là nội dung bất biến cache vĩnh viễn.

`e2e-check.mjs` canh ba thứ: không có vi phạm CSP nào trong console, nonce đổi mỗi lần
tải, và `script-src` không còn `'unsafe-inline'`. Vi phạm CSP **không ném exception** —
trình duyệt chỉ ghi một dòng console rồi lặng lẽ không chạy script — nên `pageerror`
không bắt được, phải nghe `console` riêng.

## Vài điều dễ vấp

- **Sửa `packages/sb3` xong phải build lại**: `pnpm --filter @kidogame/sb3 build`.
  Nó nằm trong `serverExternalPackages` nên Next dùng `dist/`, không dùng `src/`.
- **Đổi `next.config.ts` thì phải restart dev server**, Next không hot-reload file này.
- `infra/player-server.mjs` và `infra/Caddyfile` phải giữ cùng bộ header. Sửa một
  bên nhớ sửa bên kia — e2e chỉ kiểm được bản dev.
- **Selector trong e2e chỉ dùng `data-testid` hoặc thuộc tính ngữ nghĩa** (`role`),
  không bám vào class trang trí. Bám vào class là đổi giao diện một cái là test vỡ hàng loạt.
- Next tự render một route-announcer rỗng cũng mang `role="alert"`. Khi tìm hộp lỗi
  phải khoanh phạm vi (`form [role=alert]`), không thì `.first()` bắt trúng cái rỗng.
- **Click submit trong e2e phải khoanh vào đúng form.** Thanh điều hướng có nút
  "Đăng xuất" cũng là `<button type="submit">`, nên `click('button[type=submit]')`
  sẽ đăng xuất giữa bài test và làm test đổ ở chỗ khác hẳn.
- **Form nào dùng `<form action={serverAction}>` thì React 19 RESET nó sau khi
  action chạy xong, kể cả khi action trả về lỗi.** Không xử lý thì người dùng bị
  báo "điền sai" trên một cái form trắng trơn. Dự án chữa theo hai cách, tuỳ chỗ:
  `takedown-form.tsx` dùng input controlled (ô "căn cứ" dài 2000 ký tự, mất là
  người ta bỏ luôn), còn `AuthForm` ghi lại giá trị theo từng lần gõ rồi trả vào
  DOM sau khi React reset — vì nó nhận ô nhập qua `children` từ sáu trang, và vì
  bọc `formAction` lại để chụp FormData sẽ làm mất khả năng submit khi chưa có JS.
  Cả hai chỗ đều CỐ Ý không giữ mật khẩu và ô cam đoan. Form upload không bị lỗi
  này: nó dùng `onSubmit` + `fetch`, không phải server action.
- `prisma db push` không tạo được CHECK constraint. Chúng nằm trong
  `prisma/constraints.sql`, script `db:push` đã tự gọi — nhưng nếu bạn chạy
  `prisma db push` trực tiếp thì phải chạy `pnpm db:constraints` sau đó.
- **Image `web` phải có `psql`.** Vì `db:push` gọi tiếp `db:constraints`, mà
  script đó chạy `psql`. Thiếu nó thì migrate chết ở bước cuối — sau khi schema
  đã push xong, tức DB ở trạng thái nửa vời. `infra/Dockerfile` đã cài
  `postgresql-client` chính vì thế; đừng bỏ ra để image nhẹ hơn.

## Trạng thái

Xong: M0 (đóng gói player), M1 (upload → chơi được), M2 (auth phụ huynh/bé),
M2.5 (xác minh email + quên mật khẩu), M3 (tìm kiếm + tag + lọc tuổi),
M4 (báo cáo → ẩn mềm ở 3 báo cáo đã xác minh, ẩn hẳn ở 6 → trang kiểm duyệt của admin).

M5 (Deploy): cả ba phần của mốc này đã viết — Docker Compose + Caddy
(`infra/Dockerfile`, `infra/docker-compose.yml`, `infra/.env.example`, Caddyfile
đọc domain từ env), sao lưu Postgres + file, và cron dump (service `backup`).

**Chưa `docker compose up` lần nào** vì máy dev chưa cài Docker, nên phần
container còn nguyên rủi ro. Riêng `infra/backup.sh` đã được kiểm thật trên host,
gồm cả phục hồi ngược lại để đối chiếu. Xem phần "Triển khai lên VPS".

Còn thiếu để gọi là hoàn tất: chạy 4 bước kiểm tay cần Docker trong plan (dựng
tài khoản → upload → game chạy trong iframe; `curl -I` soi header player origin;
kiểm cookie không lọt sang player origin; thử đổi tên file HTML thành `.sb3`), và
đưa bản sao lưu ra khỏi máy.

### M3 — Khám phá

Trang chủ nhận ba tham số URL, cộng dồn được với nhau (AND, không phải OR):
`?q=` tìm theo tên/mô tả · `?tag=` lọc theo tag · `?tuoi=` lọc theo tuổi.

**Tìm kiếm không dấu.** Trẻ gõ "meo" phải ra "Mèo phiêu lưu", nếu không thì với một
đứa bé ô tìm kiếm coi như hỏng. Cách làm: cột `Game.titleSearch` lưu tên + mô tả đã
bỏ dấu và về chữ thường, và chuỗi người dùng gõ vào cũng được bỏ dấu trước khi so.

Dùng cột chứ KHÔNG dùng extension `unaccent` của Postgres, để khỏi phải
`CREATE EXTENSION` lúc dựng DB trên VPS — cùng lý do dự án chọn `scrypt` thay
`argon2`. Đổi lại phải nhớ ghi cột này mỗi khi tên hoặc mô tả đổi.

Cột không có index: truy vấn là `LIKE '%...%'` nên btree không giúp gì. Khi nào đủ
game để thấy chậm thì chuyển sang `pg_trgm`.

Đổi hàm chuẩn hoá trong `src/lib/search.ts` thì phải chạy lại backfill, không thì
game cũ tìm theo kiểu mới sẽ không ra:

```bash
pnpm db:backfill-search
```

Script này dùng CHUNG hàm của ứng dụng chứ không tự chuẩn hoá — chép logic sang
script là cái bẫy đã có tiền lệ ở đây (`seed.ts` từng tự gọi `scrypt` khác định dạng
với `password.ts`, tài khoản seed ra không đăng nhập được mà không ai báo lỗi).

**Tag.** Bé tự tick lúc đăng, tối đa `MAX_TAGS_PER_GAME` (= 2). Ít có chủ đích: cho
chọn thoải mái thì bé nào cũng tick hết mọi tag và bộ lọc mất sạch ý nghĩa. Slug gửi
lên luôn được đối chiếu lại với bảng `Tag`; slug lạ bị bỏ im lặng chứ không làm hỏng
việc đăng game.

**Lọc tuổi là tuổi của BÉ LÀM RA GAME, không phải độ tuổi phù hợp để chơi.** Nhãn
trên giao diện viết rõ "Bé mấy tuổi làm?" chính vì thế. Nếu để chữ chung chung như
"độ tuổi", phụ huynh sẽ đọc thành "game này hợp cho trẻ mấy tuổi" — một lời hứa mà
hệ thống không có cơ sở nào để đưa ra, vì không ai chấm nội dung game cả. Dữ liệu
lấy từ `Child.birthYear`, mà cột đó không bắt buộc, nên game của bé không khai năm
sinh sẽ không xuất hiện ở bất kỳ khung tuổi nào.

### M2.5 — Email

Gửi mail đi qua `src/lib/mail.ts`, tầng này thay được nhà cung cấp. **Không có
`RESEND_API_KEY` thì mail được IN RA console server thay vì gửi đi thật** — nhờ vậy
chạy được toàn bộ luồng trên máy dev mà không cần API key, không cần mạng, và không
sợ lỡ tay gửi thư cho người thật. Cắm nhà cung cấp thật chỉ bằng biến môi trường:

```bash
RESEND_API_KEY="re_xxx"
MAIL_FROM="KidoGame <no-reply@kidogame.vn>"
APP_ORIGIN="https://app.kidogame.vn"   # dùng dựng link tuyệt đối trong mail
```

Ở production mà thiếu `RESEND_API_KEY` thì việc gửi **ném lỗi** chứ không âm thầm
rơi về console — in mail chứa token ra log production chính là rò token.

Token nằm ở bảng `AuthToken`, lưu sha256 chứ không lưu token thô, giống hệt
`Session`: rò database không kéo theo rò token. Dùng một lần, và xin token mới thì
mọi token cũ cùng loại chưa dùng bị vô hiệu ngay. Hạn: đặt lại mật khẩu 1 giờ, xác
minh email 24 giờ. Tối đa 5 lần xin mỗi giờ cho mỗi tài khoản mỗi loại.

Ba quyết định có chủ đích:

- **Chưa xác minh email KHÔNG chặn gì cả**, chỉ hiện cảnh báo. Chặn thì đứa trẻ phải
  ngồi chờ bố mẹ mở hòm thư mới có tài khoản để đăng game.
- **Form quên mật khẩu luôn trả về đúng một câu**, dù email có tài khoản hay không.
  Phân biệt hai trường hợp là biến nó thành công cụ dò xem ai đã đăng ký.
- **Đặt lại mật khẩu thu hồi mọi phiên của phụ huynh** nhưng KHÔNG đụng phiên của
  các bé — bố mẹ đổi mật khẩu của mình thì không có lý do gì bắt con đăng nhập lại.
  Việc đặt lại cũng tự đánh dấu email đã xác minh, vì bấm được link trong mail đã
  chứng minh đúng điều mà xác minh cần chứng minh.

**Con đăng game thì bố mẹ nhận mail ngay.** Đây không phải tính năng phụ mà là lớp hậu
kiểm ĐẦU TIÊN: cả sản phẩm chọn "public ngay, không duyệt trước", nên nếu bố mẹ không
được báo thì người phát hiện nội dung xấu đầu tiên bắt buộc phải là một người lạ đã trót
nhìn thấy nó. Thư có tên game, mô tả, link chơi, và link `/phu-huynh` để tự ẩn.

Mail này gửi từ `notifyParentOfNewGame` **bên trong `ingestGame`**, không phải ở route
upload — sau này có thêm đường đăng game nào khác thì nó vẫn tự chạy theo; đặt ở tầng
route là để quên. Gửi trượt **không** huỷ việc đăng: game đã đóng gói, đã ghi đĩa, đã
vào DB rồi, ném lỗi ở đó chỉ khiến bé thấy "đăng thất bại" trong khi game vẫn nằm công
khai — trạng thái tệ nhất có thể. Gửi cho MỌI game mới, kể cả khi bé đăng mười cái một
ngày: gộp thành một thư cuối ngày thì tiết kiệm hòm thư nhưng hỏng đúng thứ cần là biết
sớm.

Kiểm duyệt hoạt động thế nào: ai cũng báo cáo được, kể cả khách chưa đăng nhập. Đủ
`REPORT_AUTO_HIDE_THRESHOLD` (= 3, trong `src/lib/moderation.ts`) báo cáo thì game tự
chuyển sang `HIDDEN` và ghi `ModerationLog` với `actorId = "system"`. Admin
(`Parent.isAdmin`) vào `/admin` để gỡ hẳn hoặc cho hiện lại; cho hiện lại sẽ đưa
`reportCount` về 0, nếu không thì chỉ một báo cáo nữa là game bị ẩn lại ngay.

Chống báo cáo trùng khoá theo **danh tính** nếu đã đăng nhập, chỉ khách vãng lai mới
khoá theo IP — cùng lý do với chỗ chống dò mật khẩu: cả lớp học đi chung một IP. Lưu ý
ở máy dev không có header `x-forwarded-for` nên mọi khách vãng lai dùng chung một khoá,
tức chỉ báo cáo được 1 lần cho mỗi game. Sau Caddy ở production thì mỗi IP là một khoá.

Ràng buộc unique `(gameId, reporterIpHash)` **không phân biệt `status`**, nên một người
đã báo cáo thì không báo lại được nữa dù admin đã bác bỏ báo cáo cũ. Cố ý như vậy để
người bị bác bỏ không spam lại, nhưng hệ quả là nếu game thật sự xấu đi về sau thì phải
có người MỚI phát hiện mới báo cáo được.

Trang `/admin` có bộ lọc (`?loc=can-xem|tat-ca|dang-hien|da-an|da-go`), phân trang 20
game mỗi trang (`?trang=N`), thumbnail, lý do báo cáo, lịch sử `ModerationLog`, và nút
khoá thẳng tài khoản bé.

**Admin xem được game đã ẩn.** `/game/[id]` có ngoại lệ đúng cho `isAdmin` — không có
nó thì admin phải quyết định gỡ hay giữ mà không nhìn thấy nội dung, vì bấm vào tên game
từ `/admin` cũng nhận 404. Ở chế độ này trang hiện banner cảnh báo, **không đếm lượt
chơi**, và ẩn nút báo cáo.

`ModerationLog` nhắm vào **đúng một** đối tượng: một game, hoặc một tài khoản trẻ. Hai
cột `gameId`/`childId` đều nullable, và `CHECK` constraint
`moderationlog_exactly_one_target` trong `prisma/constraints.sql` buộc đúng một trong
hai. Nhờ vậy việc admin khoá tài khoản một bé — thao tác nặng nhất trong hệ thống — cũng
để lại vết. Trang `/admin` hiện hai danh sách RIÊNG: lịch sử của game, và lịch sử của
tài khoản. Trộn chung là làm mờ đúng chỗ cần rõ nhất.

**Chỉ log thao tác của ADMIN.** Phụ huynh khoá con mình (`setChildLocked` trong
`auth.ts`) KHÔNG ghi log: đó là quyền của bố mẹ trong gia đình, không phải hành vi kiểm
duyệt, và ghi nó vào cùng bảng sẽ làm loãng đúng câu hỏi mà bảng này tồn tại để trả lời
— *người ngoài đã làm gì với tài khoản của con tôi*.

Tài khoản đăng nhập thử: xem mục [Tài khoản test](#tài-khoản-test).

### Điều khoản và luồng gỡ bản quyền

Hai trang công khai, ai cũng vào được, có link ở chân trang mọi trang:

- `/dieu-khoan` — điều khoản sử dụng.
- `/bao-cao-ban-quyen` — biểu mẫu yêu cầu gỡ, **không cần đăng nhập**.

Lý do có luồng này: trẻ hay đăng lại game của người khác. Người làm ra bản gốc gần như
chắc chắn không có tài khoản ở đây, nên bắt đăng ký trước khi khiếu nại là dựng đúng bức
tường trước đúng người cần đi qua.

**Tách khỏi nút báo cáo, dù `Report` đã có lý do `CHEP_BAI`.** Hai thứ khác nhau ở người
gửi và ở cái cần thu thập. Báo cáo là của người trong nhà, cố ý KHÔNG có ô nhập tự do, và
chỉ cần đếm tới ngưỡng. Yêu cầu gỡ cần danh tính người khiếu nại và căn cứ sở hữu — đúng
hai thứ form báo cáo cố tình không hỏi. Trong hộp báo cáo có một dòng trỏ sang đây.

Chính sách, **do chủ dự án chốt**: ẩn ngay khi tiếp nhận, xác minh sau, sai thì khôi phục.

1. Nhận là chuyển game sang `HIDDEN` ngay, trước khi có ai kịp đọc.
2. Mail cho đơn vị vận hành (`OPERATOR_EMAIL`) và cho phụ huynh của bé.
3. Admin phán xử ở `/admin`, hàng đợi nằm trên cùng, cũ nhất lên trước.
4. Mail báo kết quả cho cả hai phía.

Chấp nhận thì game sang `REMOVED` (gỡ hẳn, phụ huynh không tự bật lại được). Bác bỏ thì
game hiện lại — **nhưng chỉ khi chính yêu cầu đó là thứ đã ẩn nó** (cột
`TakedownRequest.didHide`), và chỉ khi lúc đó không còn yêu cầu nào khác đang mở, cũng
như `reportCount` chưa chạm ngưỡng. Không có ba điều kiện ấy thì kết luận của một vụ sẽ
lật quyết định của một vụ khác.

**Không nói cho phụ huynh biết người khiếu nại là ai.** Người đó để lại tên và email thật
cho chúng ta, không phải cho phụ huynh. Chuyển tiếp danh tính đó là mở đường cho hai bên
đôi co trực tiếp, mà một bên đang bênh con mình. Cần đối chất thì admin đứng giữa.

Chống trùng khoá theo **email người khiếu nại**, không theo IP — khác hẳn `Report`. Ở đây
người gửi tự khai danh tính, và IP là danh tính tồi: hai người khác nhau cùng một mạng
công ty cùng khiếu nại thì người thứ hai bị nuốt yêu cầu trong im lặng. IP chỉ dùng để
đếm hạn mức (`TAKEDOWNS_PER_IP_PER_DAY` = 5).

Ô cam đoan trung thực **không có cột trong DB**: `submitTakedownRequest` từ chối mọi yêu
cầu chưa cam đoan, nên mọi hàng đều đã cam đoan, và một cột luôn `true` không nói lên gì.
Server kiểm lại chứ không tin `required` của HTML — hàng rào đó đi vòng qua trong một giây.

Tên và email đơn vị vận hành đọc từ biến môi trường, **không viết vào code**: repo công
khai, mà đây là thông tin thật của một con người.

```bash
OPERATOR_NAME="Tên bạn hoặc tên tổ chức"
OPERATOR_EMAIL="lienhe@kidogame.vn"
```

Thiếu hai biến này KHÔNG làm sập web (khác `RESEND_API_KEY`) — `/dieu-khoan` chỉ hiện một
dòng cảnh báo chưa cấu hình. Nhưng mail yêu cầu gỡ sẽ bay vào một hộp thư không ai đọc.

**`/dieu-khoan` phải là `force-dynamic`.** Nó in ra giá trị của hai biến trên, mà chúng
chỉ có lúc chạy. Image Docker build một lần rồi chạy nhiều nơi; để Next render sẵn lúc
build là đóng băng giá trị của máy build vào trang. Cùng lý do, chân trang cố ý CHỈ có
link — in tên đơn vị vận hành ở layout gốc là ép cả web phải render động.

Hạn trả lời tính bằng **ngày làm việc** (`slaDueAt` trong `src/lib/operator.ts`), bỏ thứ
bảy và chủ nhật, để một yêu cầu đến chiều thứ sáu không bị báo trễ vào thứ hai. Không trừ
ngày lễ: lịch nghỉ Việt Nam đổi theo năm và phải cập nhật tay, mà một bảng lịch lỡ quên
cập nhật thì sai một cách âm thầm.
