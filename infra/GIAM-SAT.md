# Giám sát: analytics, error tracking, uptime

Báo cáo + kế hoạch. Viết sau khi đo trạng thái thật, không theo phỏng đoán.

---

## 1. Ba từ đó là gì

**Analytics** — đo *người dùng làm gì*. Bao nhiêu người vào, vào từ đâu, xem trang
nào, bỏ đi ở bước nào. Với KidoGame: bao nhiêu phụ huynh đăng ký rồi **bỏ giữa
đường** ở bước xác minh email? Bao nhiêu bé upload thất bại? Không có số thì mọi
quyết định về sản phẩm là đoán.

**Error tracking** — đo *cái gì đang hỏng*. Khi code ném lỗi ở máy người dùng thật,
nó gom lại thành báo cáo: lỗi gì, ở dòng nào, bao nhiêu người gặp, trình duyệt nào.
**Sentry** là sản phẩm phổ biến nhất loại này, tên nó gần thành tên chung của cả
loại — như "Honda" với xe máy.

Khác nhau ở một chỗ quan trọng: analytics trả lời *"có ai dùng không"*, error
tracking trả lời *"nó có chạy không"*. Cái thứ hai đáng làm trước.

**Integrate / tích hợp** — cắm một công cụ bên ngoài vào code của mình: thêm thư
viện, thêm khoá cấu hình, mở đường mạng cho nó gửi dữ liệu đi.

Còn một loại thứ ba mà chưa ai nhắc, và nó rẻ nhất trong ba:

**Uptime monitoring** — một máy ở ngoài Internet cứ vài phút gọi vào web một lần;
không trả lời thì nó nhắn cho fen. Hiện tại nếu VPS sập lúc 2 giờ sáng thì **không
ai biết** cho tới khi có người mở web và thấy trắng.

---

## 2. Trạng thái hiện tại — đo được

| Thứ | Trạng thái |
|---|---|
| Analytics | **không có gì** |
| Error tracking | tự host, xem mục 6 — lỗi phía client vào bảng `ErrorLog`, admin đọc ở `/admin/loi` |
| Canh máy chủ hằng đêm | **đã có**, xem mục 8 — đĩa, chứng chỉ, tuổi bản sao lưu, đợt lỗi mới |
| Uptime monitoring | **đã có từ 10/9/2026** — UptimeRobot gói Free, hai monitor `app` và `play`, ping 5 phút, báo qua email |
| Error boundary của Next | **không có** `error.tsx`, `global-error.tsx`, `not-found.tsx` → đã bổ sung, xem mục 5 |
| Lỗi phía server | 8 chỗ `console.error` → log Docker → **không ai đọc**; nhưng lỗi làm vỡ trang thì đi qua boundary nên vẫn vào bảng, kèm `digest` để dò ngược log |
| Lỗi phía client | đã vào DB của chính mình, xem mục 6 |
| Giữ log | `json-file` **không giới hạn** → phình tới khi hết đĩa; đã chặn, xem mục 5 |
| Healthcheck | có trong compose, nhưng chỉ **restart container** — không báo cho ai |

Trạng thái lúc viết báo cáo này: hệ thống **không có cách nào biết mình đang hỏng**
ngoài việc fen tự mở web ra xem. Đây là cùng một loại lỗi với vụ mail: mọi thứ trông
xanh, và cách hỏng duy nhất lộ ra là khi người dùng thật bỏ đi.

Sau tầng 0 và tầng 2, còn đúng một khoảng trống, và nó là khoảng trống mà tầng 2
**không thể** tự bù: web sập hẳn thì không có trình duyệt nào chạy được `sendBeacon`
để kể lại. Chỉ một con mắt ở NGOÀI hệ thống nhìn thấy được loại hỏng đó — tức tầng 1.

---

## 3. Vấn đề gốc: đây là trang cho TRẺ EM

Đây là chỗ phải quyết trước khi chọn công cụ, và nó không phải chuyện kỹ thuật.

Cả kiến trúc của KidoGame được dựng để **không có traffic ra bên thứ ba**. Không
phải tình cờ, mà là những quyết định đã ghi rõ trong code:

- biến đám mây Scratch đổi từ `ws` sang `local` — để trình duyệt của trẻ **không**
  kết nối `wss://clouddata.turbowarp.org`;
- `username` truyền cho runtime là hằng `'player'` — không định danh người chơi;
- runtime packager đọc từ `node_modules`, không tải từ turbowarp.org;
- CSP của app: `default-src 'self'`, `connect-src 'self'`, `script-src 'self'` +
  nonce + `strict-dynamic` — **không một host bên thứ ba nào được phép**.

Cắm Google Analytics hay Sentry SaaS vào là **đi ngược đúng bốn quyết định đó**, và
về mặt kỹ thuật là phải chọc lỗ vào `connect-src` lẫn `script-src`. Cái lỗ đó
không chỉ dành cho Sentry — nó mở cho mọi thứ chạy được trên origin đó.

Còn hai chuyện ngoài kỹ thuật, **cần người biết luật xem, tôi không kết luận
thay**:

- **Nghị định 13/2023**: chuyển dữ liệu cá nhân ra nước ngoài phải có hồ sơ đánh
  giá tác động. Sentry và Google Analytics đặt máy ở nước ngoài, và IP người dùng
  đã là dữ liệu cá nhân.
- **COPPA / điều khoản của Google**: dùng Google Analytics trên dịch vụ nhắm tới
  trẻ em vướng chính điều khoản của Google, chưa nói tới COPPA.

**Khuyến nghị của tôi: không dùng SaaS nào cho analytics và error tracking.**
Tự host. Không phải vì rẻ hơn — vì nó giữ đúng lời hứa mà cả phần còn lại của hệ
thống đang giữ.

Ngoại lệ duy nhất: **uptime monitoring dùng SaaS thì hoàn toàn ổn.** Nó chỉ gọi
vào một URL công khai, không chạy code trong trình duyệt của ai, không nhận một
byte dữ liệu người dùng nào.

---

## 4. Kế hoạch — bốn tầng, làm theo thứ tự giá trị chia cho công

### Tầng 0 — không cần vendor, không cần quyết định gì (ĐÃ LÀM, mục 5)

Error boundary + giới hạn log. Đây là **điều kiện cần** của mọi tầng sau: chưa có
chỗ để lỗi đi qua thì không cắm được gì vào.

### Tầng 1 — uptime — ĐÃ LÀM 10/9/2026

> **Trạng thái:** xong. UptimeRobot gói Free, hai monitor theo đúng bảng bên dưới,
> báo về `mail-chinh@example.com`. Monitor `app` đo được 645ms, 100% trong 24h
> đầu. Chỉ báo qua email.
>
> Tài khoản đứng tên fen, nên **không phép kiểm nào trong repo nhìn thấy nó**.
> Chuyển tên miền, đổi email, hay lỡ xoá monitor thì chỉ mục này biết.

Một dịch vụ ping miễn phí. Trỏ vào `https://<APP_DOMAIN>/` mỗi 5 phút, báo qua
email.

Vì sao đáng làm **trước** cả Sentry: một lỗi lẻ ảnh hưởng một người; web sập ảnh
hưởng tất cả, và hiện tại chẳng ai biết. Không cần sửa một dòng code nào, không
đụng CSP, không dữ liệu người dùng.

**Vì sao mục 8 KHÔNG thay được tầng này.** Bước canh hằng đêm chạy *bên trong* VPS
và gửi thư *từ* VPS. Máy chết hẳn thì nó không gửi được lá thư báo là nó đã chết —
và tệ hơn: "không có thư" là đúng cái tín hiệu mà mục 8 dùng cho *"mọi thứ ổn"*.
Hai trạng thái ngược nhau hoàn toàn mà nhìn từ hòm thư thì giống hệt. Chỉ một con
mắt ở NGOÀI phân biệt được, và đó là toàn bộ lý do tầng này tồn tại.

#### Từng bước — UptimeRobot, không cần thẻ

1. Vào https://uptimerobot.com → **Register** bằng email. Gói Free: 50 monitor,
   ping mỗi 5 phút, báo qua email. Không hỏi thẻ.
2. Xác minh email, đăng nhập.
3. **+ New monitor**, tạo **hai cái** (số liệu tính tới 10/9/2026):

   | Trường | Monitor 1 | Monitor 2 |
   |---|---|---|
   | Monitor Type | HTTP(s) | HTTP(s) |
   | Friendly Name | `KidoGame app` | `KidoGame play` |
   | URL | `https://app.37-60-251-95.sslip.io` | `https://play.37-60-251-95.sslip.io` |
   | Monitoring interval | 5 minutes | 5 minutes |

4. **Monitor 2 phải sửa thêm một chỗ, không thì nó báo động mỗi 5 phút suốt ngày
   đêm.** Player origin trả **404 ở `/` là ĐÚNG** — nó chỉ phát file game theo
   đường dẫn, không có trang chủ. UptimeRobot mặc định coi 404 là chết. Mở
   **Advanced Settings → Custom HTTP Statuses** (hoặc *Monitor specific settings*
   tuỳ giao diện) và khai **404 = Up**.

   Bỏ qua bước này là cách chắc chắn nhất để fen tắt cả hai monitor trong ba ngày.

5. **Alert Contacts**: chọn email của fen. Bật cho cả hai monitor.

Vì sao ping **cả hai domain**: player domain sập thì trang web vẫn xanh nhưng
**không game nào chạy được**, và uptime chỉ theo dõi `app` sẽ báo "mọi thứ ổn".

Không ping `admin`: nó đi qua đúng Caddy và đúng container với `app`, nên nó
không trả lời được câu hỏi nào mà `app` chưa trả lời.

> **Đổi tên miền thì phải sửa hai URL này.** Chúng nằm ngoài repo, nên không có
> phép kiểm nào bắt được lệch — đây là chỗ duy nhất ghi lại rằng chúng tồn tại.

#### MỖI LẦN DEPLOY SẼ SINH RA MỘT BÁO ĐỘNG GIẢ

Đo được 10/9/2026, ngay lượt deploy đầu tiên sau khi bật monitor: `docker compose
up -d --build` đổi container `web`, và trong vài giây giữa lúc container cũ dừng và
container mới lành, **Caddy trả 502**. Bắt được đúng một lượt `curl` rơi vào cửa sổ
đó; ba lượt ngay sau đều 200.

UptimeRobot ping mỗi 5 phút, nên phần lớn lượt deploy sẽ **lọt qua** và không ai
thấy gì. Nhưng thỉnh thoảng một lượt ping rơi trúng cửa sổ ấy và fen nhận thư "site
is DOWN" cho một lần deploy hoàn toàn bình thường.

Biết trước thì không sao. **Nguy hiểm là không biết**: vài lần báo động trùng với
những lúc "tôi vừa deploy xong" là đủ để người ta bắt đầu bỏ qua thư của
UptimeRobot — và đó là cách tầng này chết mà không ai tắt nó cả.

Việc cần làm khi thấy thư báo down: hỏi *"vừa nãy có ai deploy không"* trước, rồi
mới đi tìm lỗi. Bảng của UptimeRobot ghi rõ giờ sự cố, đối chiếu được.

### Tầng 2 — lỗi vào DB + trang cho admin xem (ĐÃ LÀM, mục 6)

Một bảng `ErrorLog`, một route nhận báo cáo lỗi từ `error.tsx` / `global-error.tsx`,
và một trang `/admin/loi` để xem: lỗi gì, `digest`, mấy lần, lần cuối khi nào.

- Không thư viện mới, không host mới, không lỗ CSP (`connect-src 'self'` là đủ vì
  route nằm trên chính app).
- Không rời khỏi VPS của fen, nên không vướng chuyện chuyển dữ liệu ra nước ngoài.
- Với một trang có vài chục tới vài trăm người dùng, tầng này bắt được **gần hết**
  giá trị thật của Sentry.
- Phải cẩn thận đúng một chỗ: **không lưu IP, không lưu user agent đầy đủ, không
  lưu nội dung form**. Lưu lỗi mà kéo theo dữ liệu cá nhân là tự tạo ra đúng vấn đề
  vừa tránh được ở mục 3.

Đây có thể là tầng cuối cùng cần làm. Tầng 1 vẫn nên làm trước theo giá trị chia cho
công, nhưng nó cần tài khoản của fen nên không chờ được.

### Tầng 3 — chỉ khi tầng 2 thật sự không đủ

> **14/9/2026: fen quyết định làm.** Analytics = **Umami 3.3.1** — XONG, đang chạy.
> Dashboard ở `STATS_DOMAIN`, trên app domain chỉ mở `/_stats/script.js` và
> `/_stats/api/send`, không ghi query string, bỏ qua trình duyệt bật Do Not Track.
> Kiểm bằng `node infra/umami-check.mjs`. Error tracking (GlitchTip) làm tiếp sau.
>
> **Bẫy đã đo:** Umami trả `{"beep":"boop"}` và KHÔNG GHI cho tên trình duyệt
> `HeadlessChrome` — Playwright headless không bao giờ được đếm. Muốn thử đếm thật thì
> đặt `userAgent` của Chrome thường.

- **Error tracking**: **GlitchTip**, không phải Sentry tự host. API tương thích
  Sentry nên dùng được SDK `@sentry/nextjs`, nhưng nhẹ hơn nhiều — Sentry tự host
  cần trên chục container và nhiều GB RAM, quá nặng cho VPS chạy kèm Postgres và
  Caddy.
- **Analytics**: **Umami** hoặc **Plausible CE** — tự host, không cookie, không
  định danh cá nhân.

  Một mẹo giữ nguyên CSP: cho Caddy reverse-proxy công cụ đó **trên chính app
  domain**, ví dụ `https://app.kidogame.vn/_stats/…`. Trình duyệt thấy đó là
  `'self'`, nên `connect-src 'self'` và `script-src 'self'` **không phải sửa một
  chữ**. Đặt ở subdomain riêng thì phải chọc lỗ CSP.

Cả hai đều thêm container, thêm RAM, thêm thứ phải cập nhật vá lỗi. Đừng làm tầng
này trước khi tầng 2 chứng minh là chưa đủ.

### Không nên làm

Google Analytics, Sentry SaaS, Meta Pixel, hay bất kỳ script bên thứ ba nào chạy
trong trình duyệt của trẻ. Lý do ở mục 3.

---

## 5. Đã làm — tầng 0

Cả bốn thứ dưới đây không cần vendor, không cần khoá, không mở lỗ CSP nào, và
không gửi một byte nào ra ngoài.

### `apps/web/src/app/not-found.tsx`

Trước đây **không tồn tại**, nên mọi đường dẫn sai rơi vào trang 404 mặc định của
Next: `404 | This page could not be found`, tiếng Anh, không thanh điều hướng,
không đường về. Với trang cho trẻ em Việt Nam đó là ngõ cụt bằng tiếng nước ngoài.

Và đường dẫn sai **không hiếm** ở đây: link game được chia cho nhau qua tin nhắn,
game bị ẩn hoặc bị gỡ thì link cũ vẫn còn trong máy bạn bè.

Bản mới không dùng chữ "lỗi" — 404 không phải lỗi của đứa trẻ đang đọc, mà với trẻ
con thì chữ "lỗi" đọc ra là *"mình vừa làm hỏng cái gì"*.

### `apps/web/src/app/error.tsx`

Error boundary cho mọi trang. Phần quan trọng nhất trên trang này là **`digest`**:

Ở production Next **cố tình không** gửi thông điệp lỗi thật xuống trình duyệt —
thông điệp lỗi rò cấu trúc bên trong, đôi khi rò cả dữ liệu. Thay vào đó nó băm lỗi
thành một `digest` và in **cùng một `digest`** vào log server. Nên mã đó là sợi dây
**duy nhất** nối *"phụ huynh nói web hỏng"* với đúng một dòng trong log. Không hiện
nó ra thì cách chẩn đoán duy nhất còn lại là đoán.

`console.error` trong file này **chính là chỗ cắm** error tracking ở tầng 2 hoặc 3 —
mọi lỗi phía client đi qua đây.

### `apps/web/src/app/global-error.tsx`

Bắt lỗi xảy ra trong chính `layout.tsx`. Cần cả file này vì `error.tsx` render **bên
trong** layout — layout ném lỗi thì nó không cứu được gì.

File này tự viết `<html>` và `<body>` (layout đã không chạy, không còn ai viết hai
thẻ đó), và **không import component nào của site, không dùng class Tailwind, không
dùng token màu**. Đây là trang cho lúc mọi thứ khác đã đổ: phụ thuộc vào một thứ
đang hỏng thì nó hỏng theo, và người dùng nhận một trang trắng thay vì một câu.

### `infra/docker-compose.yml` — giới hạn log

Docker mặc định `json-file` **không giới hạn**: file log lớn mãi tới khi container
bị xoá. Trên VPS nhỏ đó là một cách hết đĩa rất chậm và rất im — và khi đĩa đầy thì
**Postgres chết trước**, tức mất web chứ không phải mất log.

Đặt qua YAML anchor `x-logging` cho cả năm service: 20MB × 5 file = trần 100MB mỗi
service. Đủ soi lại vài ngày, mà có trần.

### Đã kiểm

`typecheck` sạch · `a11y-check` 17/17 · `docker compose config` hợp lệ · trang 404
thử thật ở `/khong-co-trang-nao-ten-nay`: ra tiếng Việt, **có thanh điều hướng và
chân trang**, có link về trang chủ.

---

## 6. Đã làm — tầng 2

Đường đi trọn vẹn: một trang ném lỗi → `error.tsx` chạy → `navigator.sendBeacon`
bắn về `POST /api/errors` → gom nhóm vào bảng `ErrorLog` → admin đọc ở `/admin/loi`.

### `apps/web/src/lib/error-report.ts`

Phần chạy trong trình duyệt. `sendBeacon` **chứ không** `fetch`: đây đúng là bài học
đã trả giá ở `game-frame.tsx` — `fetch` bắn-rồi-quên mà không ai đọc response thì
trình duyệt kể lại thành `net::ERR_ABORTED`, tức cơ chế bắt lỗi tự đẻ ra một dòng đỏ
mỗi lần nó chạy. `keepalive: true` không chữa được, đã đo.

File này **không import gì cả**, và đó là điều kiện để `global-error.tsx` được phép
dùng nó mà không phá bất biến của mình (xem mục 5).

### `apps/web/src/app/api/errors/route.ts`

Hộp nhận, **không đòi đăng nhập** — và không thể đòi: đúng những lỗi đáng lo nhất là
lỗi làm hỏng cả cây React, trong đó có thể có cả phần đọc phiên. Luôn trả 204, kể cả
với thân request rác hay khi vượt trần: `sendBeacon` không đọc được response, nên
phân biệt mã trả về chỉ có tác dụng kể cho người dò biết cơ chế bên trong.

### `apps/web/src/lib/error-log.ts`

Bốn chỗ phải chặn, vì đây là hộp nhận dữ liệu của người ngoài ghi thẳng vào DB:

1. **Dữ liệu cá nhân.** Query string bị cắt trước khi lưu — link xác minh email và
   link đặt lại mật khẩu đều mang token ở đó, và một bảng lỗi giữ token là một bảng
   phải bảo vệ như bảng mật khẩu. User agent bị rút còn `Chrome 130`: đủ để thấy
   "lỗi này chỉ có trên Safari", không đủ để lần ra một người.
2. **Một lỗi lặp trong vòng render.** Gom nhóm theo băm nội dung, nên nghìn lần lặp
   là một dòng với `count` tăng, không phải nghìn dòng.
3. **Bơm thông điệp ngẫu nhiên để đẻ vô hạn nhóm.** Trần 500 nhóm chưa xử lý. Chạm
   trần thì nhóm mới bị bỏ, nhóm cũ vẫn đếm — cố ý không chọn "xoá nhóm cũ nhường
   chỗ", vì như thế kẻ tấn công đẩy được mọi lỗi thật ra khỏi bảng, tức biến cơ chế
   giám sát thành cơ chế xoá dấu vết.
4. **Bảng lớn mãi.** Giữ 90 ngày, dọn ngay trên đường tạo nhóm mới. Không cần cron,
   và không đánh thuế lên đường đi phổ biến nhất (lỗi cũ lặp lại — đúng một truy vấn).

Thêm một chỗ đáng ghi: dùng `updateMany` chứ không `update`, vì `update` **ném** khi
where không khớp và Prisma in lỗi ra stderr **trước khi** `.catch` của mình nuốt —
đúng cái bẫy đã làm mọi lần đăng nhập thành công in ra một khối `prisma:error`.

### `apps/web/src/app/admin/loi/page.tsx`

Trang riêng, **không** thêm khối nữa vào `/admin`: `/admin` là chỗ xử lý nội dung,
việc ở đó có hạn chót và có trẻ con ở đầu bên kia. Xếp chung thì hàng đợi bản quyền —
thứ duy nhất có hạn đã hứa công khai với người ngoài — bị đẩy xuống dưới một danh
sách stack trace. Bù lại `/admin` có **một dòng** đếm dẫn sang, cố ý nhỏ hơn khối
bản quyền nhưng nằm trên cùng.

Sắp theo **lần cuối gặp**, không theo số lần: sắp theo số lần thì một lỗi cũ đã đếm
tới hàng nghìn ngồi mãi trên đỉnh, che đúng thứ đáng xem nhất là lỗi vừa xuất hiện —
tức lỗi có khả năng cao nhất là do bản vừa deploy gây ra.

"Đã xử lý" **không xoá dòng**, chỉ đóng dấu thời gian. Nhờ vậy lỗi quay lại sau khi
đánh dấu thì thẻ nói thẳng *"nhưng đã xảy ra lại sau đó"* — nghĩa là bản vá không ăn,
và đó là thông tin quan trọng nhất trên cả thẻ.

### Đã kiểm

`typecheck` sạch · `contrast-check` 76/76 · `a11y-check` 17/17 · `e2e-check` 44/44 ·
`e2e-moderation` 58/58 · bộ mới `e2e-errorlog` **26/26**.

Chặng duy nhất bộ e2e không phủ được là "trang thật ném lỗi → boundary → beacon",
vì kiểm tự động chặng đó cần một route cố tình ném lỗi nằm sẵn trong mã nguồn, tức
đặt một quả bom vào production để phục vụ bài test. Đã kiểm **tay** một lần: dựng
`kg-tmp-throw/page.tsx`, nghe request tới `/api/errors` bằng Playwright, thấy đúng
một POST và một dòng mới mang `digest` thật của Next; rồi xoá file. Cách làm lại ghi
trong phần đầu `infra/e2e-errorlog.mjs`.

---

## 7. Việc tiếp theo cần fen quyết

1. ~~**Tầng 1 (uptime)**~~ — **XONG 10/9/2026.** Cả bốn tầng giờ đều có mặt.
2. ~~**Báo động vào Telegram**~~ — **FEN CHỐT 10/9: BỎ.** Code chưa từng bật và đã
   **gỡ hẳn ngày 14/9** (`lib/telegram.ts`, kênh trong `canh-gac.ts`, hai biến
   `TELEGRAM_*`). Đừng đề xuất lại trừ khi fen mở ra; muốn làm lại thì lấy từ lịch sử
   git trước commit gỡ.

   **Hệ quả phải biết:** báo động chỉ có MỘT kênh — email, vào cùng một hòm thư
   Gmail với mọi thứ khác. Mất quyền vào hòm thư đó là mù hoàn toàn.
3. **Tầng 3** — vẫn khuyên **hoãn** tới khi tầng 2 chứng minh chưa đủ.

> **Một điều KHÔNG tầng nào bắt được, và nên biết:** cả bốn tầng đều báo về
> **cùng một hòm thư Gmail**. Mất quyền vào hòm thư đó là mù hoàn toàn, trong khi
> mọi bảng điều khiển vẫn nói là đang theo dõi bình thường.

---

## 8. Đã làm — canh máy chủ hằng đêm

`apps/web/prisma/canh-gac.ts`, chạy là **bước 4/4** của `infra/prune.sh`, tức
mỗi đêm lúc `PRUNE_HOUR` (4 giờ sáng). **Chỉ gửi thư khi có vấn đề.**

Nó nhắm vào khoảng trống mà cả tầng 1 lẫn tầng 2 đều không thấy. Ping từ ngoài chỉ
biết *"trang có trả lời không"*; nó không biết đĩa còn 3%, không biết việc sao lưu
đã ngừng chạy từ tuần trước, không biết chứng chỉ hết hạn sau chín ngày. Cả ba đều
là hỏng **đang tới**, và tới lúc chúng xảy ra thì trang chết hẳn — ping mới kêu,
mà lúc đó thì đã mất dữ liệu hoặc mất giờ.

| Phép canh | Ngưỡng mặc định | Bắt được gì |
|---|---|---|
| Ba origin công khai trả lời | app 200 · play **404** · admin 200 | Caddy chết, DNS sai, app crash |
| Chứng chỉ TLS còn mấy ngày | < 21 ngày | Caddy gia hạn trượt (nó tự gia hạn từ mốc 30) |
| Đĩa đã dùng bao nhiêu % | ≥ 85% | đĩa đầy dần — Postgres chết TRƯỚC khi log chết |
| Tuổi bản sao lưu mới nhất | > 26 giờ | **service `backup` đã chết mà không ai biết** |
| Nhóm lỗi MỚI trong 24h | ≥ 5 | một bản deploy vừa làm hỏng thứ gì đó |

Bốn con số trên đổi được qua `.env` (`CANH_*`), và mỗi con số có một đoạn giải
thích tại chỗ trong `canh-gac.ts` — vì sao 85 chứ không phải 95, vì sao 26 chứ
không phải 24, vì sao 21 phải nằm **dưới** mốc 30.

### Năm điều cố ý

1. **Gọi vòng ra Internet rồi quay lại** (hairpin NAT) chứ không gọi
   `http://web:3000` trong mạng nội bộ. Đường nội bộ xanh kể cả khi Caddy đã
   chết — tức xanh đúng vào lúc không người dùng nào vào được. Đi vòng ra ngoài
   thì một lượt gọi kiểm cùng lúc cả DNS, cả chứng chỉ, cả reverse proxy.
2. **`play` mong 404, không mong 200.** Player origin không có trang chủ. Viết
   sai chỗ này là có một báo động giả mỗi đêm cho tới khi người ta tắt cả phép
   canh. Cùng cái bẫy phải xử lý ở bước 4 của UptimeRobot, mục 4.
3. **Đọc chứng chỉ bằng `node:tls`, không gọi `openssl` CLI.** Image web là
   `node:24-bookworm-slim` và **không có** binary openssl (chỉ có thư viện, cài
   cho Prisma). Phép canh gọi lệnh không tồn tại thì ném lỗi mỗi đêm, và lỗi đó
   trông y hệt "chứng chỉ có vấn đề".
4. **Đo tuổi bản sao lưu theo TÊN FILE, không theo `mtime`.** Tên mang dấu thời
   gian; `mtime` thì đổi mỗi khi có ai copy hay `rsync` file đó. Đo bằng `mtime`
   thì một lượt kéo bản cũ về sẽ đọc ra "vừa chạy xong".
5. **Không có origin thì GHI RA "BỎ QUA", không `continue` lặng lẽ.** Một phép
   canh biến mất vì thiếu biến môi trường trông y hệt một phép canh đã chạy và
   thấy mọi thứ ổn. `docker-compose.yml` chặn thêm một lớp bằng `:?` cho
   `APP_ORIGIN`/`PLAYER_ORIGIN` của service `prune`.

### Đã kiểm — cả xanh lẫn ĐỎ

Một cơ chế báo động chưa từng ai thấy nó đỏ thì chưa chứng minh được gì. Chạy
thật trên VPS ngày 10/9/2026:

- **Bảy phép, xanh hết** ở trạng thái thật (chứng chỉ còn 88 ngày, đĩa 13%, bản
  sao lưu 11 giờ tuổi, 0 lỗi mới).
- **Ép từng ngưỡng cho đỏ**, từng cái một: đĩa (`CANH_DIA_PHAN_TRAM=5`) → `hỏng`;
  sao lưu (`CANH_SAO_LUU_GIO=1`) → `hỏng`; chứng chỉ (`CANH_CHUNG_CHI_NGAY=999`)
  → `lo`; origin sai đường dẫn → `hỏng` kèm mã thật; `BACKUP_DIR` trỏ vào thư mục
  không tồn tại → `hỏng` kèm ENOENT; `PLAYER_ORIGIN` rỗng → dòng `BỎ QUA`.
- **Gửi thư thật**, và đọc câu trả lời của máy chủ chứ không chỉ "không ném lỗi" —
  đúng bài học của commit `80dfec0`:

  ```
  [mail] SMTP đã trao — tới=mail-chinh@example.com
         id=<0bc3a0a7-...@gmail.com> phản hồi=250 2.0.0 OK ... - gsmtp
  ```

### Cái giá, nói thẳng

Im lặng khi mọi thứ ổn là chủ ý (cùng lý do đã ghi ở `nhac-viec-co-han.ts`: một lá
thư "đều ổn" mỗi đêm là lá thư người ta học cách bỏ qua trong hai tuần). Nhưng nó
mang một cái giá phải nói ra: **"không có thư" và "cả service `prune` đã chết"
trông giống hệt nhau từ phía hòm thư.** Chính lá thư báo động cũng viết ra câu đó ở
cuối thân thư. Đó là loại hỏng mà tầng 1 bắt được — nên hai tầng phải có cả hai.

---

## 9. Đã làm — thư tuần, 12/9/2026

Mục 8 kết thúc bằng đúng câu này: *"không có thư" và "cả service `prune` đã chết"
trông giống hệt nhau từ phía hòm thư.* Nó nói thêm rằng tầng 1 (UptimeRobot) bắt
được loại hỏng ấy — đúng, nhưng chỉ đúng một nửa. UptimeRobot ping HTTP, nên nó bắt
được **web sập**. Nó không biết gì về việc **đường gửi thư đã chết**, mà đường gửi
thư mới là thứ cả ba tầng còn lại dùng để nói chuyện với người.

Nói cách khác: App Password hết hạn, hoặc Gmail khoá tài khoản, thì UptimeRobot vẫn
xanh, web vẫn chạy, và **mọi báo động của hệ thống rơi vào hư không** — im lặng y
hệt một tuần bình yên.

### Cách lấp: một lá thư luôn gửi

`apps/web/prisma/thu-tuan.ts`, **bước 5/5 của `prune.sh`**, gửi mỗi **thứ Hai**.
Không thêm service nào — cùng một image, cùng một đồng hồ 4:00, đúng lập luận đã
dựng cho bước 4. Sáu đêm trong bảy nó in một dòng rồi thoát.

**Luật đọc đảo ngược, và phải nhớ đúng chiều:**

| Lá thư | Im lặng nghĩa là |
|---|---|
| Nhắc việc có hạn | tốt |
| Canh máy chủ | tốt |
| **Thư tuần** | **xấu** |

### Vì sao nó không rơi vào cái bẫy nó đang tránh

Một lá "tôi vẫn sống" trống rỗng chính là thứ mục 8 cảnh báo: thư đều đặn không mang
tin gì thì người ta học cách xoá chưa đọc, rồi xoá luôn cái đêm nó mang tin thật.

Nên thư này mang thứ chủ dự án thật sự muốn biết mà **không có chỗ nào khác nói**:
tuần qua bao nhiêu gia đình mới, bé mới, game mới, các bé thả icon và nhắn cho nhau
bao nhiêu lần, hàng đợi quản trị còn gì. Nó là **báo cáo sản phẩm**; việc nó chứng
minh đường thư còn sống là tác dụng phụ.

Khi không có ai mới, thư nói thẳng ra điều đó kèm một câu rằng đây là con số về
**người dùng**, không phải về **máy** — một bảng toàn số 0 mà thiếu câu ấy thì đọc
như báo cáo hỏng, và người đọc sẽ đi kiểm script thay vì kiểm sản phẩm.

### Giới hạn còn lại, nói thẳng

Thư tuần chứng minh được đường thư sống **tại thời điểm nó gửi**. SMTP chết vào thứ
Ba thì phải tới thứ Hai sau mới lộ ra — tối đa sáu ngày mù. Rút ngắn thì phải gửi
dày hơn, và dày hơn thì quay lại đúng cái bẫy trên. Bảy ngày là chỗ dừng đã chọn,
không phải chỗ tốt nhất có thể.

Và nó chỉ có tác dụng nếu người nhận **để ý khi thư vắng mặt** — đó là việc của con
người, không có cách nào tự động hoá bằng chính cái kênh đang nghi ngờ.

**Tắt:** `THU_TUAN=off`. **Đổi ngày:** `THU_TUAN_NGAY=4` (1 = thứ Hai).
