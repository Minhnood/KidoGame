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
pnpm --filter @kidogame/sb3 test           # 50 unit test, gồm fixture độc hại

# End-to-end, cần cả hai server ở trên đang chạy + Chrome
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-check.mjs        # 34 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-auth.mjs         # 19 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-moderation.mjs   # 32 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-takedown.mjs     # 40 kiểm tra
GAME_URL=http://localhost:3000/game/<id> node infra/e2e-touch.mjs   # 12 kiểm tra
MAIL_LOG=/tmp/kg-mail.log node infra/e2e-email.mjs                  # 13 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-discovery.mjs    # 14 kiểm tra
```

Hai file có số kiểm tra thay đổi theo biến môi trường bạn truyền vào:

- `e2e-takedown.mjs` — 40, thành **42** khi có `MAIL_LOG` (kiểm thêm mail báo phụ huynh
  lúc game bị tạm ẩn, và mail báo kết quả cho người khiếu nại). Nó dựng HAI game vì "gỡ
  hẳn" không quay lui được: một game cho nhánh chấp nhận, một cho nhánh bác bỏ.
- `e2e-email.mjs` — 13, thành **17** khi có thêm `SB3_FIXTURE` (kiểm mail báo phụ huynh
  mỗi lần con đăng game).

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

#### Cái bẫy build-time đã từng có ở đây

Ghi lại vì nó **đã xảy ra thật** ngay lần `docker compose up` đầu tiên, và vì bài học
còn nguyên giá trị dù cách sửa đã đổi.

Hồi CSP còn nằm trong `headers()` của `next.config.ts`, Next đánh giá nó trong
`next build` rồi nướng vào `.next/routes-manifest.json` — tức `frame-src` bị chốt theo
`PLAYER_ORIGIN` **lúc build**. Còn `objectUrl()` trong `src/lib/storage.ts` đọc biến đó
**lúc gọi**. Hai thời điểm khác nhau cho cùng một giá trị. Kết quả: iframe trỏ đúng
player domain, CSP vẫn chỉ cho phép `http://127.0.0.1:3001`, trình duyệt chặn iframe,
và triệu chứng là *"game không boot"*, *"stage 0x0"* — không có lỗi CSP nào hiện ra ở
nơi bạn đang nhìn.

**Không còn nữa.** Từ khi CSP chuyển sang `src/middleware.ts` để dùng nonce, nó được
dựng lại theo từng request và đọc env lúc chạy. Đã kiểm chứng bằng cách chạy image với
một `PLAYER_ORIGIN` chưa từng tồn tại lúc build và thấy CSP đổi theo:

```bash
docker compose run --rm -e PLAYER_ORIGIN=https://khac-han.test web ...
# -> frame-src https://khac-han.test
```

Nên **đổi domain giờ chỉ cần `docker compose up -d`**, không phải `--build`. Cơ chế
chốt chặn `BUILT_PLAYER_ORIGIN` từng có trong `src/instrumentation.ts` đã bị gỡ: giữ
một cái chốt canh điều kiện không còn tồn tại thì sớm muộn nó sẽ chặn oan một thao tác
hợp lệ, và người gặp sẽ mất hàng giờ vì một lời cảnh báo sai.

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
liệu gốc: nó chống lỡ tay xoá, không chống ổ đĩa chết. Trỏ `BACKUP_HOST_DIR` sang
ổ khác, hoặc `rsync` thư mục đó sang máy khác — bước đó chưa được tự động hoá.

`backups/` đã nằm trong `.gitignore` và `.dockerignore`: bản dump chứa email phụ
huynh và hash mật khẩu, lỡ commit một file là rò dữ liệu người dùng vào lịch sử
git, nơi xoá đi cũng không mất.

### Phục hồi

```bash
# 1. DB. Dừng app trước để không ai ghi vào giữa lúc phục hồi.
docker compose stop web
docker compose exec -T db psql -U kidogame -d postgres \
  -c 'DROP DATABASE IF EXISTS kidogame;' -c 'CREATE DATABASE kidogame OWNER kidogame;'
docker compose exec -T backup pg_restore -d "$DATABASE_URL" /backups/db-<stamp>.dump

# 2. File game.
docker compose run --rm -v ./backups:/backups:ro web \
  tar xzf /backups/storage-<stamp>.tar.gz -C /srv/storage

docker compose start web
```

CHECK constraint trong `prisma/constraints.sql` **có** đi theo bản dump — đã kiểm
bằng cách phục hồi rồi soi `pg_constraint`. Nhưng nếu bạn phục hồi bằng cách nào
khác (dump `--data-only`, hay dựng schema bằng `prisma db push` rồi nạp dữ liệu)
thì phải chạy lại `pnpm db:constraints`, vì các ràng buộc đó không nằm trong
Prisma schema.

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
M4 (báo cáo → tự ẩn ở ngưỡng 3 → trang kiểm duyệt của admin).

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
