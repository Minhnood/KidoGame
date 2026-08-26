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

```bash
pnpm --filter @kidogame/sb3 test           # 48 unit test, gồm fixture độc hại

# End-to-end, cần cả hai server ở trên đang chạy + Chrome
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-check.mjs        # 14 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-auth.mjs         # 19 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-moderation.mjs   # 29 kiểm tra
GAME_URL=http://localhost:3000/game/<id> node infra/e2e-touch.mjs   # 12 kiểm tra
MAIL_LOG=/tmp/kg-mail.log node infra/e2e-email.mjs                  # 13 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-discovery.mjs    # 14 kiểm tra
```

`e2e-email.mjs` cần server được khởi động với stdout đổ vào file, vì nó moi link
xác minh / đặt lại mật khẩu **từ log server**:

```bash
pnpm --filter @kidogame/web exec next dev -p 3000 > /tmp/kg-mail.log 2>&1 &
MAIL_LOG=/tmp/kg-mail.log node infra/e2e-email.mjs
```

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

Script cố ý dùng `next dev` chứ không `next start`: `next start` đặt
`NODE_ENV=production`, khi đó cookie phiên bật `secure: true` nên trình duyệt **từ chối
lưu cookie qua `http://`** trên LAN — đăng nhập trên điện thoại sẽ im lặng không vào
được. Chơi game thì không cần đăng nhập, nhưng thử luồng đăng game thì cần.

`infra/e2e-check.mjs` kiểm cả các tính chất bảo mật, không chỉ chức năng: iframe
trỏ đúng player origin, có sandbox, cookie phiên không rò sang player origin, và
file HTML đổi tên `.sb3` bị từ chối.

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

Hai điều dễ làm bạn bối rối khi nhìn vào DB:

- **Bé do `e2e-auth.mjs` tạo luôn ở trạng thái đang khoá.** Phép kiểm cuối cùng của file
  đó là "khoá tài khoản thu hồi phiên ngay", nên nó khoá xong thì kết thúc. Đúng ý đồ,
  không phải rác hỏng.
- **`e2e-check.mjs` KHÔNG tự tạo tài khoản** — nó đăng nhập bằng chính bé `beminh` của
  seed rồi upload game thật. Nghĩa là mỗi lần chạy `beminh` lại có thêm một game tên
  "Game kiểm thử e2e". Chạy quá 10 lần trong một ngày là bé chạm rate limit
  `UPLOADS_PER_CHILD_PER_DAY`, và test sẽ đổ vì lý do chẳng liên quan gì tới thứ nó
  định kiểm. Thấy vậy thì dọn game của `beminh` chứ đừng đi sửa test.

`e2e-moderation.mjs` cần seed đã chạy vì nó đăng nhập bằng tài khoản admin demo. Đổi
được bằng biến môi trường `ADMIN_EMAIL` / `ADMIN_PASS` nếu bạn dùng admin khác.

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

Vài lựa chọn có chủ đích cho đối tượng trẻ em:

- Vùng chạm tối thiểu 48px (`--spacing-touch`), không phải 44px như web người lớn.
- Font Nunito có bộ dấu tiếng Việt đầy đủ, `next/font` self-host nên lúc chạy
  không có request nào ra Google — hợp CSP `default-src 'self'`.
- `line-height` rộng hơn mặc định vì dấu tiếng Việt sẽ chạm nhau.
- Ô chọn file là component tự làm (`file-picker.tsx`), không dùng
  `<input type="file">` trần — trình duyệt tự vẽ chữ "Choose File" bằng tiếng Anh
  và CSS không đổi được.

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

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/sb3` | Kiểm tra, chuẩn hoá, đóng gói, thumbnail. **Toàn bộ phần bảo mật nằm ở đây.** |
| `apps/web` | Next.js + Tailwind v4: giao diện, API, Prisma |
| `apps/web/src/components` | Bộ component dùng chung (button, field, notice, card, file-picker) |
| `infra` | Server tĩnh cho dev, Caddyfile cho production, script e2e |
| `storage` | File theo địa chỉ nội dung: `sb3/`, `html/`, `thumb/` |

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
- `prisma db push` không tạo được CHECK constraint. Chúng nằm trong
  `prisma/constraints.sql`, script `db:push` đã tự gọi — nhưng nếu bạn chạy
  `prisma db push` trực tiếp thì phải chạy `pnpm db:constraints` sau đó.

## Trạng thái

Xong: M0 (đóng gói player), M1 (upload → chơi được), M2 (auth phụ huynh/bé),
M2.5 (xác minh email + quên mật khẩu), M3 (tìm kiếm + tag + lọc tuổi),
M4 (báo cáo → tự ẩn ở ngưỡng 3 → trang kiểm duyệt của admin).
Chưa làm: Docker Compose (M5).

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

**Hạn chế đã biết:** admin khoá tài khoản bé thì thao tác đó KHÔNG được ghi vào
`ModerationLog`, vì bảng ấy bắt buộc có `gameId` (khoá ngoại tới `Game`) mà khoá tài
khoản không gắn với game nào. Muốn có vết kiểm toán đầy đủ thì phải nới schema — cho
`gameId` nullable, hoặc tách một bảng log riêng cho thao tác lên tài khoản.

Tài khoản đăng nhập thử: xem mục [Tài khoản test](#tài-khoản-test).
