# Cách làm mail cho KidoGame

Code mail đã xong hết. Việc còn lại là hạ tầng: một tài khoản Resend, một key, và
ba bản ghi DNS. Tài liệu này đi từ trạng thái hiện tại tới lúc một phụ huynh thật
nhận được thư thật.

Kiểm trạng thái bất cứ lúc nào:

```bash
node infra/mail-check.mjs
```

Hôm viết file này: **4/8**. Chưa đạt: key dùng được, SPF, DKIM, DMARC.

---

## Hiểu trước: mail hỏng ở đây KHÔNG kêu

`sendMail` trong `apps/web/src/lib/mail.ts` có một chốt an toàn: ở production mà
**thiếu** `RESEND_API_KEY` thì nó ném lỗi rõ ràng. Nhưng `infra/.env` đang có key
**placeholder** (`re_…ocal`), nên chốt đó không bao giờ chạy — code đi thẳng vào
Resend và ăn 401.

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

## GIAI ĐOẠN 1 — gửi được thư, CHƯA CẦN DOMAIN

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

## BẪY: đừng đặt key thật vào môi trường dev

Bốn bộ e2e — `e2e-auth`, `e2e-email`, `e2e-moderation`, `e2e-takedown`, tổng **146
phép kiểm** — đọc link xác minh từ `/tmp/kg-mail.log`, tức từ transport `console`
(`sendViaConsole` in nguyên nội dung thư ra log server).

Có `RESEND_API_KEY` trong môi trường là `sendMail` đi Resend, log không còn link,
**cả bốn bộ đổ**. Và chúng đổ ở bước đầu tiên nên triệu chứng trông như luồng xác
minh email bị hỏng, không như lỗi cấu hình.

`RESEND_API_KEY` chỉ thuộc `infra/.env` (production). Máy dev để trống — transport
`console` là mặc định và nó cố ý in cả token, vì người chạy dev chính là người cần
bấm link.

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
