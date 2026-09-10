# Báo động qua Telegram

Bật kênh báo động thứ hai, đứng cạnh email. **Miễn phí, không cần thẻ, khoảng 5 phút.**

Đây là file làm theo từng bước, không phải file giải thích. Phần "vì sao" ở
[`GIAM-SAT.md`](GIAM-SAT.md) mục 8; phần code ở `apps/web/src/lib/telegram.ts`.

---

## Vì sao bật, gọn trong ba câu

Mọi tầng giám sát của hệ thống đổ về **cùng một hòm thư Gmail**. Mất quyền vào hòm
thư đó là mù hoàn toàn, trong khi mọi bảng điều khiển vẫn nói là đang theo dõi bình
thường. Và ngay cả khi hòm thư còn nguyên, thư báo động nằm chung với mọi thư khác
nên bị đọc muộn hàng giờ — đúng lúc mà giá trị của một báo động nằm ở chỗ đọc sớm.

Telegram **không thay** email. Cả hai cùng gửi, mỗi lần báo động.

> UptimeRobot cũng có tích hợp Telegram, nhưng **nằm sau gói trả phí** (đã thử
> 10/9/2026). Cách dưới đây không dùng cái đó: bot là của mình, Bot API miễn phí,
> không nhà cung cấp nào khoá được.

---

## Phần 1 — Tạo bot (làm trên điện thoại hoặc Telegram máy tính)

### Bước 1. Mở `@BotFather`

Trong Telegram, tìm **`@BotFather`** — tài khoản có **dấu tích xanh**. Có nhiều tài
khoản giả tên giống hệt; chỉ cái có tích xanh là thật. Bấm **Start**.

### Bước 2. Tạo bot

Gõ:

```
/newbot
```

Nó hỏi hai câu:

| Nó hỏi | Trả lời |
|---|---|
| *Alright, a new bot. How are we going to call it?* | Tên hiển thị, gõ gì cũng được — ví dụ `KidoGame canh gac` |
| *Now let's choose a username* | **Bắt buộc kết thúc bằng `bot`** — ví dụ `kidogame_canhgac_bot` |

Username trùng người khác thì nó bắt chọn lại, cứ thêm số vào cuối.

### Bước 3. Chép lại TOKEN

BotFather trả về một khối chữ, trong đó có dòng dạng:

```
123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Đó là **token**. Chép để đó.

> **Token là mật khẩu của bot.** Ai có nó thì gửi tin giả danh bot được. Đừng chụp
> màn hình đăng lên đâu, đừng dán vào file nào ngoài `infra/.env`.
>
> Lỡ lộ thì nhắn BotFather `/revoke` để đổi token mới — bot vẫn giữ nguyên.

### Bước 4. ⚠ BẤM START VÀ NHẮN CHO BOT MỘT CÂU

BotFather đưa sẵn link tới bot vừa tạo (dạng `t.me/kidogame_canhgac_bot`). Bấm vào,
bấm **Start**, rồi **gõ một câu bất kỳ** cho nó — `chao` cũng được.

**Đây là bước hay bỏ sót nhất, và nó bắt buộc.** Telegram **cấm bot nhắn trước cho
người lạ**. Không nhắn trước thì code chạy đúng, log in ra bình thường, mà tin nhắn
**không bao giờ tới** — và lỗi trả về là `chat not found`, nghe như sai ID chứ không
hề nói ra nguyên nhân thật.

Bot không trả lời gì đâu, đúng như vậy. Nó chỉ cần *nghe thấy* một câu từ fen.

### Bước 5. Lấy CHAT ID

Mở trong trình duyệt, thay `<TOKEN>` bằng token ở bước 3:

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Chữ `bot` dính liền token, không có dấu cách. Ví dụ:
`https://api.telegram.org/bot123456789:AAF-xxx/getUpdates`

Trang trả về một khối chữ lộn xộn. Tìm đoạn:

```
"chat":{"id":987654321,
```

Con số đó là **chat id**. Chép để đó.

**Ra `{"ok":true,"result":[]}` rỗng** nghĩa là chưa làm bước 4 — quay lại nhắn cho
bot một câu rồi mở lại trang này.

---

## Phần 2 — Cắm vào hệ thống

Cần sửa `infra/.env` ở **hai nơi**: máy Mac và VPS. Hai file khác nhau, không tự
đồng bộ.

> `.env` **không** đi theo `rsync` lúc deploy (nó nằm trong danh sách loại trừ), và
> `.gitignore` chặn nó khỏi git. Nên phải sửa tay ở cả hai chỗ.

### Trên VPS

```bash
ssh kidovps
```

```bash
nano /root/KidoGame/infra/.env
```

Tìm hai dòng này (kéo xuống gần cuối, mục *Báo động qua Telegram*):

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Điền giá trị vào **ngay sau dấu `=`**, không có dấu cách, không có dấu nháy:

```
TELEGRAM_BOT_TOKEN=123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=987654321
```

Lưu và thoát nano: **`Ctrl+O`** → **`Enter`** → **`Ctrl+X`**.

Rồi nạp lại:

```bash
cd /root/KidoGame/infra && docker compose up -d
```

> **`up -d` chứ KHÔNG phải `restart`.** Biến môi trường chỉ đi vào container lúc
> **TẠO**, nên `restart` giữ nguyên container cũ với giá trị cũ — cấu hình mới bị bỏ
> qua trong im lặng, và mọi thứ trông như đã chạy.
>
> Không cần `--build`: chỉ đổi cấu hình, không đổi code.

### Trên máy Mac (tuỳ chọn)

Chỉ cần nếu fen muốn chạy phép canh bằng tay trên máy mình. Sửa cùng hai dòng đó
trong `infra/.env` ở máy Mac.

---

## Phần 3 — Thử

```bash
ssh kidovps
```

```bash
cd /root/KidoGame/infra && docker compose exec -T prune sh -c "cd /app/apps/web && pnpm --filter @kidogame/web db:canh-gac"
```

Lệnh này **chỉ IN ra**, không gửi gì. Nó cho biết bảy phép canh đang thấy gì.

Muốn thử gửi thật thì ép một phép canh đỏ bằng cách trỏ vào thư mục không có thật:

```bash
cd /root/KidoGame/infra && docker compose exec -T -e BACKUP_DIR=/thu-mot-cai-khong-co prune sh -c "cd /app/apps/web && pnpm --filter @kidogame/web db:canh-gac --gui"
```

Đúng thì Telegram nhận được tin, và log in ra dòng:

```
[telegram] đã gửi — chat=987654321 id=42
```

`id=` là số hiệu tin nhắn do Telegram cấp. **Có số đó nghĩa là Telegram xác nhận đã
nhận** — không phải "chạy xong mà không báo lỗi".

---

## Khi nào Telegram sẽ nhắn cho fen

Mỗi đêm **4 giờ sáng**, hệ thống tự chạy bảy phép canh. **Chỉ nhắn khi có vấn đề.**

Im lặng = mọi thứ ổn. Nhưng nhớ một điều: im lặng **cũng** là dấu hiệu của việc cả
cơ chế canh đã chết. Hai chuyện đó nhìn từ điện thoại giống hệt nhau — đó là lý do
vẫn cần UptimeRobot ping từ ngoài, xem [`GIAM-SAT.md`](GIAM-SAT.md) mục 4.

---

## Hỏng thì đọc đây

| Log nói gì | Nguyên nhân | Sửa |
|---|---|---|
| `chưa cấu hình TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, bỏ qua kênh này` | Chưa điền, hoặc điền rồi mà chạy `restart` thay vì `up -d` | Kiểm lại `.env`, rồi `docker compose up -d` |
| `HTTP 401, Telegram nói: Unauthorized` | Token sai hoặc đã bị `/revoke` | Lấy token mới từ BotFather |
| `HTTP 400, Telegram nói: chat not found` | **Chưa bấm Start / chưa nhắn cho bot** (bước 4), hoặc chat id sai | Nhắn cho bot một câu rồi lấy lại chat id |
| `HTTP 400, Telegram nói: chat_id is empty` | Điền token nhưng quên chat id | Điền nốt |
| `không gọi được api.telegram.org` | VPS mất mạng ra ngoài | Kiểm mạng; mail vẫn đi bình thường |

**Telegram trượt KHÔNG làm mất thư email.** Hai kênh chạy độc lập, và log cuối mỗi
lượt nói rõ đi được mấy đường:

```
[canh-gac] đã báo 1 vấn đề qua 2/2 kênh
```

Ra `1/2` là một kênh trượt — đọc dòng lỗi ngay trên đó. Ra `0/2` thì bước canh trả
mã lỗi, và `prune.sh` in `LỖI: bước canh máy chủ thất bại` — có vấn đề cần báo mà
không báo được cho ai, nặng hơn chính cái vấn đề đó.
