# Cách làm mail cho KidoGame

Code mail đã xong hết. Việc còn lại là hạ tầng, và có **hai đường** để chọn:

| | SMTP | Resend |
|---|---|---|
| Cần gì | một hòm thư sẵn có | tài khoản Resend + key |
| Cần domain riêng | không | có, để gửi cho người ngoài |
| Gửi được cho ai | bất kỳ ai, ngay | giai đoạn đầu chỉ hòm thư chủ tài khoản |
| Hạn mức | Gmail khoảng 500 thư/ngày | theo gói |
| Vào spam | dễ hơn, vì gửi từ @gmail.com | ít hơn, khi domain đã ký DKIM |
| Dựng xong trong | khoảng 5 phút | khoảng 10 phút, hoặc một buổi nếu làm DNS |

**Chọn SMTP nếu chỉ cần mail đi thật được** — cho bài tập, cho quay video, cho
lớp học. Chọn Resend khi mở cho người dùng thật và đã có domain.

Khai cả hai thì **SMTP thắng** (`src/lib/mail.ts`).

Kiểm trạng thái bất cứ lúc nào — script biết cả hai đường và chỉ kiểm đường đang
được dùng:

```bash
node infra/mail-check.mjs
node infra/mail-check.mjs --send ban@gmail.com   # gửi thật một lá
```

Chưa cấu hình gì thì nó ra **3/6**. Chưa đạt: đường gửi, SPF, DMARC.

---

## Hiểu trước: mail hỏng ở đây KHÔNG kêu

`sendMail` trong `apps/web/src/lib/mail.ts` có một chốt an toàn: ở production mà
**không có đường gửi nào** thì nó ném lỗi rõ ràng. Nhưng `infra/.env` đang có key
**placeholder** (`re_…ocal`), nên chốt đó không bao giờ chạy — code đi thẳng vào
Resend và ăn 401.

Từ khi có đường SMTP, `docker-compose.yml` **không còn** dùng `:?` để chặn stack
khi thiếu `RESEND_API_KEY`: compose không diễn đạt được "một trong hai đường", nên
`:?` trên một đường sẽ chặn cả stack đối với người đã cấu hình xong đường kia. Đổi
lại, cấu hình thiếu không lộ ra lúc `up` nữa mà lúc gửi lá thư đầu tiên — nên
`mail-check.mjs` từ chỗ nên chạy thành chỗ **phải** chạy trước khi mở web.

Đã thử thật trên stack Docker: đăng ký một phụ huynh trên `https://app.localhost`
thì

- đăng ký **thành công**, mở phiên, chuyển sang `/phu-huynh` (đúng thiết kế: mail
  trượt không được làm hỏng việc đăng ký);
- trang nói với phụ huynh **"Một lá thư đã được gửi tới …"** — không có thư nào;
- lỗi thật chỉ nằm trong log container: `Resend trả về 401: API key is invalid`;
- và ngay dưới đó: **"Bạn cần xác minh email trước khi tạo tài khoản cho con."**

Tức là: phụ huynh đăng ký được, được bảo là đã có thư, chờ mãi, không tạo được
tài khoản cho con, đứa trẻ không có gì để đăng. Không một dòng lỗi nào ra tới mắt
người vận hành.

Vì thế: **đừng tin `docker compose up` xanh.** Điều kiện mở cho người dùng là
`mail-journey.mjs` chạy hết, không phải stack lên được.

---

## ĐƯỜNG SMTP — gửi qua hòm thư sẵn có, khoảng 5 phút

Không cần domain, không cần tài khoản dịch vụ nào, và gửi được cho **bất kỳ ai**
ngay từ lá thư đầu — khác đường Resend ở dưới, giai đoạn đầu chỉ gửi tới được
đúng hòm thư của chủ tài khoản.

Ví dụ dưới đây dùng Gmail. Outlook, Yahoo, Zoho hay máy chủ mail của trường đều
cùng bốn biến, chỉ khác host và port.

1. Bật **xác minh hai bước** cho tài khoản Google, nếu chưa. Không bật thì không
   tạo được App Password, và Google không nói lý do — trang chỉ đơn giản không có
   mục đó.

2. Tạo **App Password** ở https://myaccount.google.com/apppasswords. Google cho
   một chuỗi 16 chữ, dán nguyên vào `SMTP_PASS`.

   **Đừng dùng mật khẩu đăng nhập Gmail.** Google chặn thẳng, và lỗi nó trả về
   chỉ là `Invalid login: 535-5.7.8` — không đoán ra được nguyên nhân từ đó.

3. Sửa `infra/.env` (hoặc `apps/web/.env` nếu chỉ thử ở máy dev):

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=ban@gmail.com
   SMTP_PASS=<16 chữ App Password>
   MAIL_FROM="KidoGame <ban@gmail.com>"
   ```

   `MAIL_FROM` **nên trùng** `SMTP_USER`. Gmail viết lại người gửi thành địa chỉ
   đã xác thực mà không báo lỗi, nên khai lệch chỉ làm log ghi một đằng và thư
   người ta nhận ghi một nẻo — `mail-check.mjs` bắt đúng chỗ này.

4. Kiểm:

   ```bash
   node infra/mail-check.mjs
   ```

   Mục **"SMTP nối và xác thực được"** phải xanh — nó nối thật, bắt tay TLS thật
   và đăng nhập thật, nhưng không gửi thư cho ai. Mục DNS bị **bỏ qua** khi gửi
   từ hòm thư dùng chung: SPF, DKIM và DMARC của `gmail.com` do Google quản.

5. Gửi thử một lá tới hòm thư khác:

   ```bash
   node infra/mail-check.mjs --send hom-thu-khac@example.com
   ```

   Nhìn cả thư mục **Spam**. Vào Spam cũng tính là hỏng.

6. Đi trọn con đường thật:

   ```bash
   node infra/mail-journey.mjs --email <hòm thư fen đọc được>
   ```

Cổng: dùng **587**. Nhiều nhà mạng và phần lớn VPS chặn cổng 25, và cổng 465 thì
cần `SMTP_SECURE=true` nếu máy chủ không theo quy ước thường gặp.

---

## GIAI ĐOẠN 1 (đường Resend) — gửi được thư, CHƯA CẦN DOMAIN

Đây là chỗ dễ hiểu sai. Resend cho mỗi tài khoản một địa chỉ gửi dùng chung
`onboarding@resend.dev`, **dùng được ngay, không cần xác minh domain**. Đổi lại nó
chỉ gửi tới **đúng hòm thư đã đăng ký tài khoản Resend**.

Với KidoGame thế là đủ để:

- chạy trọn `mail-journey.mjs` (đăng ký → nhận thư → bấm link → tạo tài khoản con
  → con đăng nhập);
- quay **video 2 và video 9** — hai video đang bị chặn vì mail.

Nên mail **không** bị chặn sau domain. Chỉ việc *mở cho người dùng thật* mới cần.

### Các bước

1. Tạo tài khoản ở https://resend.com bằng **hòm thư fen thật sự đọc được**
   (Gmail cũng được). Ghi nhớ địa chỉ này — giai đoạn 1 chỉ gửi tới được nó.
   Gói free đủ cho giai đoạn đầu; kiểm lại hạn mức trên trang giá của họ.

2. Lấy API key ở https://resend.com/api-keys. Quyền **Sending access** là đủ,
   đừng lấy Full access.

3. Sửa `infra/.env`:

   ```
   RESEND_API_KEY=re_<key thật>
   MAIL_FROM="KidoGame <onboarding@resend.dev>"
   ```

4. Kiểm:

   ```bash
   node infra/mail-check.mjs
   ```

   Mục **"API key dùng được"** phải xanh. Ba mục DNS vẫn đỏ — **đúng và chấp nhận
   được ở giai đoạn này**, vì `resend.dev` là domain của Resend, không phải của
   fen.

5. Gửi thử một lá:

   ```bash
   node infra/mail-check.mjs --send <hòm thư đã đăng ký Resend>
   ```

6. Nạp lại env vào stack rồi đi trọn con đường:

   ```bash
   cd infra && docker compose up -d          # đọc lại infra/.env
   node infra/mail-journey.mjs --email <hòm thư đã đăng ký Resend>
   ```

   Script dừng lại chờ fen mở hòm thư và bấm link, rồi tự đi tiếp. Mặc định chờ
   10 phút, đổi bằng `WAIT_MINUTES=20`.

Xong bước 6 là **video 2 và 9 quay được**.

---

## GIAI ĐOẠN 2 — mở cho người dùng thật, CẦN DOMAIN

Chỉ làm được sau khi có domain thật (việc #10 trong bàn giao). Lý do đơn giản:
xác minh domain ở Resend là thêm bản ghi DNS, không có domain thì không có DNS.

1. Trỏ domain về VPS trước (việc #10), rồi sửa `infra/.env`:

   ```
   APP_DOMAIN=app.kidogame.vn
   PLAYER_DOMAIN=play.kidogame.vn
   ```

   **Hai domain phải khác nhau thật.** Cookie phiên không phân biệt theo port, chỉ
   khác hostname mới là cách ly thật — đây là lý do cả kiến trúc có hai origin.

2. Thêm domain vào Resend: https://resend.com/domains → **Add Domain**.

   Nên dùng **subdomain riêng để gửi**, ví dụ `mail.kidogame.vn`, chứ không phải
   domain gốc. Nếu sau này có sự cố về uy tín gửi thư thì nó chỉ ảnh hưởng
   subdomain đó, không lây sang domain chính.

3. Resend hiện ra danh sách bản ghi cần thêm. Dán **nguyên văn** vào nhà cung cấp
   DNS. Thường là ba nhóm:

   - **TXT SPF** trên domain gửi — nói cho hòm thư nhận biết Resend được phép gửi
     thay fen.
   - **TXT DKIM** ở `resend._domainkey.<domain gửi>` — chữ ký để thư không bị sửa
     giữa đường.
   - **MX** trên subdomain gửi — để Resend nhận được thư phản hồi/bounce.

   Đừng chép bản ghi từ tài liệu nào khác, kể cả file này: **Resend đổi region là
   đổi hostname**. Lấy đúng danh sách nó hiện ra cho domain của fen.

4. Thêm **DMARC** — Resend không đòi, nhưng Gmail và Yahoo hạ điểm nặng nếu
   thiếu, thư dễ vào spam. Bản ghi TXT ở `_dmarc.<domain gửi>`, bắt đầu an toàn
   bằng:

   ```
   v=DMARC1; p=none; rua=mailto:<email fen>
   ```

   `p=none` là "chỉ báo cáo, chưa chặn gì" — đúng chỗ để bắt đầu. Siết lên
   `p=quarantine` rồi `p=reject` sau khi đọc báo cáo vài tuần thấy sạch.

5. Đợi DNS lan. Thường vài phút tới một giờ, có nhà cung cấp lâu hơn. Bấm
   **Verify** ở Resend.

6. Đổi địa chỉ gửi trong `infra/.env` sang domain đã xác minh:

   ```
   MAIL_FROM="KidoGame <no-reply@mail.kidogame.vn>"
   ```

7. Kiểm lại:

   ```bash
   node infra/mail-check.mjs
   ```

   Lần này phải **8/8**. Có key thật rồi thì script tự hỏi Resend lấy đúng danh
   sách bản ghi của domain fen, rồi so với DNS công cộng — nó kiểm cái DNS đang
   thật sự trả về, không tin trạng thái Resend cache lại. Bản ghi bị nhà cung cấp
   DNS ghi đè sau lần verify là chuyện có thật.

8. Con đường thật, lần này bằng một hòm thư **khác** (giờ gửi được tới bất kỳ ai):

   ```bash
   node infra/mail-journey.mjs --email <hòm thư khác của fen>
   ```

   Bấm link **từ trong hòm thư thật**. `mail-check --send` chỉ chứng minh Resend
   *nhận* thư; nó không chứng minh thư tới hòm thư, không chứng minh thư thoát
   Spam, và không chứng minh link trong thư trỏ đúng chỗ.

**Xong bước 8 là mốc "xong" của cả dự án.**

---

## Ba biến placeholder khác trong `infra/.env`, dễ bỏ sót

Không thuộc Resend nhưng cùng một loại lỗi: giá trị `.local` nhìn như đã cấu hình.

| Biến | Đang là | Vấn đề |
|---|---|---|
| `OPERATOR_NAME` | `KidoGame (thử local)` | Hiện trên trang **Điều khoản** |
| `OPERATOR_EMAIL` | `lienhe@kidogame.local` | **Địa chỉ liên hệ pháp lý** — chỗ người bị xâm phạm bản quyền và phụ huynh gửi khiếu nại tới. Không đọc được thư ở đây là một lỗ thật, không phải lỗi hiển thị |
| `ADMIN_EMAIL` | `admin@kidogame.local` | Caddy đưa cho Let's Encrypt để cảnh báo chứng chỉ sắp hết hạn |

`OPERATOR_*` cố ý **không** đánh sập trang khi thiếu — trang `/dieu-khoan` chỉ hiện
một khối cảnh báo. Đánh sập cả web vì một dòng chữ thì tệ hơn. Nhưng khối cảnh báo
đó **đang hiện với người dùng thật**, nên phải điền trước khi mở.

Cả ba biến này phải là hòm thư **đọc được thật**, và nên khác `MAIL_FROM` (địa chỉ
`no-reply` thường không nhận thư).

---

## BẪY CŨ, ĐÃ VÁ: đường gửi thật ở dev từng làm đổ 146 phép kiểm

Bốn bộ e2e — `e2e-auth`, `e2e-email`, `e2e-moderation`, `e2e-takedown`, tổng **146
phép kiểm** — đọc link xác minh từ `/tmp/kg-mail.log`, tức từ nội dung thư mà
server in ra log.

Trước đây việc in ra log gắn liền với chuyện *không có đường gửi thật*: đặt
`RESEND_API_KEY` thật vào môi trường dev là `sendMail` đi Resend, log không còn
link, **cả bốn bộ đổ** — và đổ ở bước đầu tiên nên triệu chứng trông y như luồng
xác minh email bị hỏng, không chỉ vào cấu hình chút nào.

**Nay không còn.** `ghiLaiChoDev` tách khỏi việc gửi: ở dev, mọi lá thư đều vào
hộp thư `/dev/thu` và ra log **bất kể** sau đó đi bằng console, SMTP hay Resend.
Nhãn trong khung log nói rõ nó đi đường nào, ví dụ
`┌─ MAIL (gửi thật qua SMTP smtp.gmail.com)`.

Nên bật SMTP ở máy dev để thử gửi thật là an toàn — đã kiểm: `e2e-auth` 25/25 và
`e2e-email` 22/22 với `SMTP_HOST` trỏ vào một cổng không ai lắng nghe, tức mọi lá
thư đều gửi trượt mà bộ kiểm vẫn xanh.

Còn ở **production** thì `ghiLaiChoDev` không bao giờ được gọi: in mail chứa token
ra log production là rò token.

### Nhưng nó sinh ra một bẫy MỚI, cũng đã vá

Bật SMTP thật ở dev thì bộ kiểm không đổ nữa — chúng **gửi thật**. Sáu bộ e2e gửi
thư tới `e2e-…@kidogame.test`, hàng chục lá mỗi lượt chạy. Gmail nhận, cố phát tới
một domain không tồn tại, rồi trả bounce. Hàng chục bounce một lượt chạy đúng là
dấu hiệu Google dùng để chấm một tài khoản là nguồn spam, và cái mất không phải
một lá thư trượt mà là hòm thư của người vận hành bị hạ điểm — hậu quả lộ ra sau,
ở dạng "thư của KidoGame tự nhiên hay vào Spam".

`sendMail` nay chặn ở dev mọi địa chỉ thuộc TLD dành riêng cho thử nghiệm:
`.test`, `.example`, `.invalid`, `.localhost`, `.local` (RFC 2606 và RFC 6761 giữ
chúng để không ai đăng ký được, nên chặn không thể chặn oan ai). Thư vẫn vào
`/dev/thu` và ra log, nên bộ kiểm không biết khác biệt — nhãn log là
`┌─ MAIL (địa chỉ thử nghiệm — KHÔNG gửi ra ngoài)`.

Đã kiểm với SMTP Gmail thật đang bật: `e2e-email` 22/22, `e2e-auth` 25/25,
`e2e-moderation` 61/61, và **16** lá thư bị chặn đúng lúc — không lá nào rời máy.

Ở production KHÔNG chặn: ở đó một địa chỉ `.test` là dữ liệu sai, cần được thấy là
gửi trượt chứ không phải im lặng bỏ qua.

---

## Sáu loại thư đang chờ đường gửi

| Thư | Thiếu thì sao |
|---|---|
| Xác minh email | **Chặn cứng** — không tạo được tài khoản con |
| Đặt lại mật khẩu | **Chặn cứng** — mất mật khẩu là mất tài khoản |
| Bé vừa đăng game | Bố mẹ không biết con đăng gì |
| Game đang tạm ẩn | Bố mẹ không biết game bị ẩn và vì sao |
| Yêu cầu gỡ bản quyền | Người báo cáo không biết đã nhận được |
| Kết quả yêu cầu gỡ | Người báo cáo không biết kết quả |

Hai cái đầu chặn cứng. Bốn cái sau mất đi thì hệ thống vẫn chạy — và đó mới là
phần đáng lo, vì không ai phát hiện ra.
