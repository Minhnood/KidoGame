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
| Uptime monitoring | **không có gì** — tầng duy nhất còn thiếu, cần tài khoản của fen |
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

### Tầng 1 — uptime, ~15 phút, giá trị cao nhất trên mỗi phút bỏ ra

Một dịch vụ ping miễn phí (UptimeRobot, Better Stack, Healthchecks.io…). Trỏ vào
`https://<APP_DOMAIN>/` mỗi 5 phút, báo qua email hoặc Telegram.

Vì sao đáng làm **trước** cả Sentry: một lỗi lẻ ảnh hưởng một người; web sập ảnh
hưởng tất cả, và hiện tại chẳng ai biết. Không cần sửa một dòng code nào, không
đụng CSP, không dữ liệu người dùng.

Nên ping thêm **cả hai domain** — `app` và `play`. Player domain sập thì trang web
vẫn xanh nhưng **không game nào chạy được**, và uptime chỉ theo dõi `app` sẽ báo
"mọi thứ ổn".

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

Đặt qua YAML anchor `x-logging` cho cả bốn service: 20MB × 5 file = trần 100MB mỗi
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

1. **Tầng 1 (uptime)** — fen tạo tài khoản ở một dịch vụ ping, trỏ vào cả hai
   domain. Chỉ làm được sau khi có domain thật. Giờ đây là tầng duy nhất còn thiếu
   mà rẻ, và nó bắt loại hỏng mà tầng 2 **không** bắt được: web sập hẳn thì không có
   trình duyệt nào chạy được `sendBeacon` để kể lại.
2. **Tầng 3** — vẫn khuyên **hoãn** tới khi tầng 2 chứng minh chưa đủ.
