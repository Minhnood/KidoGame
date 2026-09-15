# Lệnh chạy VPS — tra nhanh

Muốn làm gì thì tìm mục đó, chép nguyên khối lệnh, dán vào Terminal, bấm Enter.

**Mỗi khối là MỘT lệnh.** Không có dòng chú thích nào nằm trong khối — mọi thứ
trong khung xám đều là lệnh gõ được.

Trên đầu mỗi mục có ghi **chạy ở đâu**:

- 🖥 **MÁY MAC** — Terminal trên máy của fen
- ☁️ **VPS** — sau khi đã `ssh kidovps`, dấu nhắc đổi thành `root@vmi...`

Ra khỏi VPS về lại máy Mac: gõ `exit`.

---

## 0. Vào VPS

🖥 **MÁY MAC**

```
ssh kidovps
```

Không hỏi mật khẩu. Hỏi mật khẩu tức là khoá SSH có vấn đề — dừng lại, đừng gõ gì.

Vào rồi thì dấu nhắc đổi thành `root@vmi...`. Từ đó mọi lệnh gõ vào là chạy **trên
máy chủ**, không phải máy fen.

---

## 1. Web còn sống không

🖥 **MÁY MAC** — không cần vào VPS

```
curl -s -o /dev/null -w "%{http_code}\n" https://app.37-60-251-95.sslip.io
```

Ra **200** là sống.

Kiểm cả ba đường một lượt:

```
for u in app play admin; do printf "$u: "; curl -s -o /dev/null -w "%{http_code}\n" https://$u.37-60-251-95.sslip.io; done
```

Đúng phải ra **app: 200**, **play: 404**, **admin: 404**.

> **`play` trả 404 là ĐÚNG.** Nó chỉ phát file game theo đường dẫn, không có trang
> chủ. `admin` cũng 404 ở gốc vì trang đăng nhập nằm ở `/admin/dang-nhap`.

---

## 2. Năm container còn chạy không

☁️ **VPS**

```
cd /root/KidoGame/infra && docker compose ps
```

Phải thấy đủ **5 dòng**: `db`, `web`, `caddy`, `backup`, `prune`. Cột `STATUS` ghi
`Up`. Riêng `db` và `web` còn có thêm `(healthy)`.

Thiếu dòng nào, hoặc thấy `Restarting`, thì xem log của nó ở mục 3.

---

## 3. Xem log

☁️ **VPS**

Log của web, 50 dòng cuối:

```
cd /root/KidoGame/infra && docker compose logs --tail=50 web
```

Đổi `web` thành `db`, `caddy`, `backup`, hoặc `prune` để xem cái khác.

Xem chạy trực tiếp, dòng mới hiện ra ngay:

```
cd /root/KidoGame/infra && docker compose logs -f web
```

Thoát chế độ đó: bấm **`Ctrl+C`**. Nó chỉ dừng việc xem, **không** dừng web.

---

## 4. Đưa code mới lên (deploy)

Ba bước, làm đúng thứ tự.

### 4a. Chép code lên — 🖥 **MÁY MAC**

```
rsync -az --stats --exclude node_modules --exclude .next --exclude storage --exclude backups --exclude .env /Users/MAC/Work/KidoGame/ kidovps:/root/KidoGame/
```

> Phải là `--stats`, **KHÔNG** phải `--info=progress2`. macOS dùng openrsync, nó
> không hiểu `--info=` và sẽ in một khối `usage:` rồi **không chuyển file nào** —
> mà mã thoát vẫn báo thành công.

### 4b. Kiểm đã chép đủ chưa — 🖥 **MÁY MAC**

```
rsync -acn --itemize-changes --exclude node_modules --exclude .next --exclude storage --exclude backups --exclude .env --exclude .git /Users/MAC/Work/KidoGame/ kidovps:/root/KidoGame/
```

**Không in dòng nào = hai bên giống hệt nhau.** Còn dòng nào là chưa chép xong.

### 4c. Dựng lại — ☁️ **VPS**

```
cd /root/KidoGame/infra && docker compose up -d --build
```

**Mất 5–15 phút.** Cứ để chạy, đừng bấm `Ctrl+C` giữa chừng.

> **Trong lúc đổi container, web trả 502 vài giây.** Bình thường. Nếu UptimeRobot
> nhắn "site is DOWN" ngay sau khi deploy thì gần như chắc là chuyện này — kiểm lại
> bằng mục 1 rồi hãy lo.

### Khi nào cần `--build`, khi nào không

| Vừa đổi gì | Lệnh |
|---|---|
| Code (file `.ts`, `.tsx`) | `docker compose up -d --build` |
| Chỉ `.env` | `docker compose up -d` |
| Không đổi gì, chỉ muốn khởi động lại | `docker compose restart web` |

> **Đổi `.env` thì PHẢI `up -d`, KHÔNG được `restart`.** Biến môi trường chỉ đi vào
> container lúc **TẠO**. `restart` giữ nguyên container cũ với giá trị cũ, nên cấu
> hình mới bị bỏ qua **trong im lặng** và mọi thứ trông như đã chạy.

---

## 5. Khởi động lại khi web đơ

☁️ **VPS**

```
cd /root/KidoGame/infra && docker compose restart web
```

Vẫn không được thì khởi động lại tất cả:

```
cd /root/KidoGame/infra && docker compose up -d
```

---

## 6. Sao lưu

### Sao lưu ngay lập tức — ☁️ **VPS**

```
cd /root/KidoGame/infra && docker compose exec -T backup /backup.sh once
```

Nên chạy **trước mỗi lần deploy lớn**.

### Xem đang giữ những bản nào — ☁️ **VPS**

```
ls -lh /root/KidoGame/infra/backups
```

### Kéo bản sao lưu về máy Mac — 🖥 **MÁY MAC**

```
/Users/MAC/Work/KidoGame/infra/keo-sao-luu.sh
```

Cái này **tự chạy lúc 9 giờ sáng và 9 giờ tối**, chỉ gõ tay khi muốn kéo ngay.

### Chỉ hỏi bản ở máy Mac bao nhiêu tuổi — 🖥 **MÁY MAC**

```
/Users/MAC/Work/KidoGame/infra/keo-sao-luu.sh --kiem
```

Cách phục hồi ở [`SAO-LUU.md`](SAO-LUU.md) mục 4.

---

## 7. Chạy phép canh máy chủ

☁️ **VPS**

Bảy phép canh: ba đường web, chứng chỉ, đĩa, tuổi bản sao lưu, lỗi mới.

```
cd /root/KidoGame/infra && docker compose exec -T prune sh -c "cd /app/apps/web && pnpm --filter @kidogame/web db:canh-gac"
```

Lệnh này **chỉ in ra**, không gửi thư cho ai. Cái tự động chạy lúc 4 giờ sáng mỗi
đêm và chỉ báo khi có vấn đề.

---

## 8. Xem dữ liệu trong database

☁️ **VPS**

Đếm số phụ huynh, bé, game:

```
cd /root/KidoGame/infra && docker compose exec -T db psql -U kidogame -d kidogame -c 'select (select count(*) from "Parent") phu_huynh, (select count(*) from "Child") be, (select count(*) from "Game") game;'
```

Mở psql để tự gõ truy vấn:

```
cd /root/KidoGame/infra && docker compose exec db psql -U kidogame -d kidogame
```

Trong psql: `\dt` xem danh sách bảng, `\q` để thoát.

> Tên bảng phải bọc trong **dấu nháy kép**: `"Parent"` chứ không phải `Parent`.
> Không có nháy thì Postgres tự chuyển thành chữ thường và báo *relation does not
> exist*, nghe như mất bảng.

---

## 9. Đĩa còn bao nhiêu

☁️ **VPS**

```
df -h /
```

Cột `Use%` vượt **85%** là phải dọn. Phép canh ở mục 7 tự cảnh báo ở mốc đó.

Xem cái gì chiếm đĩa — **ba lệnh riêng, chạy từng cái một**:

```
du -sh /var/lib/docker/volumes/kidogame_storage/_data
```

```
du -sh /root/KidoGame/infra/backups
```

```
du -sh /var/lib/docker
```

> **Vì sao không gộp một dòng.** Hai lý do, cả hai đều làm mất số liệu trong im lặng.
>
> `/srv/storage` **không tồn tại trên host** — đó là đường dẫn *bên trong container*.
> Trên host nó nằm ở `/var/lib/docker/volumes/kidogame_storage/_data`. Gõ
> `du -sh /srv/storage` thì ra lỗi, mà kèm `2>/dev/null` là lỗi biến mất luôn.
>
> Và `du` **không đếm lại thư mục nó đã đi qua**. Volume nằm *bên trong*
> `/var/lib/docker`, nên gộp chung một lệnh với `/var/lib/docker` đứng trước thì
> dòng storage **không in ra dòng nào cả** — không báo lỗi, chỉ là biến mất.

Dọn image Docker cũ không dùng nữa:

```
docker image prune -a -f
```

---

## 10. Bảo mật

☁️ **VPS**

Xem fail2ban đang chặn ai:

```
fail2ban-client status sshd
```

Xem tường lửa:

```
ufw status
```

### Chặn ghi đè nhánh `main` — 🖥 **MÁY MAC**, chạy một lần

```
git config core.hooksPath infra/git-hooks
```

Sau lệnh này, `git push --force` hay xoá nhánh `main`/`dev` **từ máy này** sẽ bị chặn
kèm danh sách commit sắp mất. Cố tình muốn thì `CHO_PHEP_GHI_DE=1` đặt trước lệnh.

Vì sao là hook chứ không phải bảo vệ nhánh trên GitHub: GitHub **không cho** bảo vệ
nhánh trên repo **private** ở gói Free (API trả 403, đo 12/9). Hai đường mở khoá là
trả tiền GitHub Pro, hoặc công khai repo — mà công khai thì **không được**, vì lịch
sử git còn một commit mang mật khẩu (`5d4e3f9`, trong `infra/ORACLE-FREE.md` — file nay
đã gỡ nhưng commit cũ vẫn giữ nó), và công khai
là phơi nó ra vĩnh viễn kể cả khi file đã gỡ.

> Hook chỉ bảo vệ **máy này**. Ai clone repo ở máy khác thì nó không biết gì cả —
> đừng nhầm nó với bảo vệ nhánh thật.

### Đổi App Password của Gmail — 🖥 **MÁY MAC**

Làm khi mật khẩu 16 ký tự ấy lỡ lọt ra đâu đó: dán nhầm vào chat, vào ảnh chụp màn
hình, vào file theo repo.

⚠️ **Máy Mac và VPS gửi thư bằng HAI tài khoản Gmail KHÁC NHAU:**

| Nơi | Tài khoản gửi |
|---|---|
| 🖥 máy Mac (`infra/.env`, `apps/web/.env`) | `mail-chinh@example.com` |
| ☁️ VPS (`infra/.env`) | `mail-du-phong@example.com` |

Mỗi App Password chỉ hợp với **đúng tài khoản tạo ra nó**, nên dán mật khẩu của bên
này sang bên kia là bên kia **câm lặng**: Gmail từ chối mọi lá thư, web vẫn chạy,
trang chủ vẫn xanh, chỉ thư xác minh ngừng đi — và phụ huynh không xác minh được thì
con họ không đăng được game.

Chạy **không kèm gì** trước, để xem nơi nào đang dùng tài khoản nào:

```
infra/doi-smtp-pass.sh
```

Rồi vào `https://myaccount.google.com/apppasswords` — **đăng nhập đúng tài khoản của
nơi định đổi** — xoá cái cũ, tạo cái mới. Sau đó chọn một nơi:

```
infra/doi-smtp-pass.sh --mac
```

```
infra/doi-smtp-pass.sh --vps
```

Script hỏi Gmail xem cặp tài khoản + mật khẩu có dùng được không **trước khi sửa bất
cứ file nào**, nên gõ sai thì không có gì bị đụng tới. Nó cũng từ chối nếu mật khẩu
vừa gõ trùng cái đang dùng — nghĩa là chưa thu hồi ở Google, và cái lộ ra vẫn còn
dùng được.

> Sau khi đổi, việc **bắt buộc** còn lại là mở web thật, đăng ký một tài khoản phụ
> huynh và **bấm** link trong thư xác minh. Gửi được thư và bấm được link là hai câu
> hỏi khác nhau.

---

## 11. Trực hằng ngày — việc của người, không phải của máy

Game hiện công khai **ngay khi bé đăng**, không ai duyệt trước. Cả cơ chế đó đứng
trên một giả định: có người đọc hàng đợi. Máy đã làm hết phần nó làm được — thư nhắc
khi có việc có hạn, canh gác khi máy chủ có vấn đề — nhưng **thư chỉ nhắc, nó không
đọc hộ**.

### Mỗi ngày một lần, khoảng một phút — 🖥 **bất kỳ máy nào**

Mở `https://admin.37-60-251-95.sslip.io/admin/tong-quan`.

Thấy dòng **“Không có việc gấp.”** → xong, đóng lại. Đó là câu khẳng định, không
phải bốn ô số 0 để tự đoán.

Thấy số khác 0 ở nhóm **“Việc có hạn”** thì:

| Ô | Nghĩa là gì | Làm gì |
|---|---|---|
| **Yêu cầu gỡ quá hạn** | Đã lỡ hạn **hứa công khai** ở `/dieu-khoan` | Trả lời ngay, đây là nghĩa vụ pháp lý chứ không phải mong muốn nội bộ |
| **Sắp xoá hẳn** | Game đã gỡ, sắp mất file gốc | Việc **duy nhất** bỏ lỡ là mất vĩnh viễn. Quyết cho hiện lại hay để xoá |
| **Báo cáo bị bỏ quên** | Người thật đã bấm báo cáo, quá 2 ngày chưa ai xem | Mở game đó xem. Trên trang mà người chơi là trẻ con, đây là ô đáng nhìn trước |
| **Nhóm lỗi chưa xử lý** | Lỗi xảy ra ở máy người dùng thật | Đọc `/admin/loi`, đánh dấu đã xử lý sau khi sửa |

### Mỗi tuần một lần: hỏi xem đường thư còn sống không

**Đây không phải việc thừa.** Cả hai kênh báo động đều **im lặng khi mọi thứ tốt** —
thư nhắc chỉ gửi khi có việc, canh gác chỉ gửi khi có vấn đề. Nghĩa là “tuần này
không nhận được thư nào” và “SMTP đã chết từ thứ ba” **trông giống hệt nhau** từ phía
hòm thư.

🖥 **MÁY MAC** — hỏi thẳng Gmail, không gửi thư cho ai:

```
node infra/mail-check.mjs
```

Muốn chắc tới mức nhận được thư thật thì thêm địa chỉ của mình:

```
node infra/mail-check.mjs --send mail-chinh@example.com
```

> ⚠️ Lệnh này đọc `infra/.env` **trên máy Mac**, tức nó kiểm tài khoản
> `mail-chinh@example.com`. **VPS gửi bằng tài khoản khác**
> (`mail-du-phong@example.com`) — xem mục 10. Muốn biết production còn gửi được
> không thì cách chắc nhất là mở web thật, đăng ký một tài khoản phụ huynh bằng hòm
> thư có thật, và **bấm** link xác minh.

### Thư tuần — lá thư DUY NHẤT gửi kể cả khi không có gì xảy ra

Mỗi **thứ Hai** có một lá thư tóm tắt tuần: bao nhiêu gia đình mới, bé mới, game mới,
các bé khen nhau bao nhiêu lần, hàng đợi quản trị còn gì.

Nó vừa là báo cáo sản phẩm, vừa là cách lấp đúng khoảng trống vừa nói ở trên. Nhưng
**luật đọc nó ngược với hai lá kia**:

| Lá thư | Im lặng nghĩa là |
|---|---|
| Nhắc việc có hạn | **tốt** — không có việc nào tới hạn |
| Canh máy chủ | **tốt** — máy chủ không có vấn đề |
| **Thư tuần** | **XẤU** — đầu tuần mà không thấy nó thì tự mở trang quản trị, đừng chờ |

Nó là bước 5/5 của `prune.sh`, chạy cùng đồng hồ 4:00 với bốn bước kia — không thêm
service nào. Sáu đêm trong bảy, bước này in một dòng rồi thoát.

Đổi ngày gửi: `THU_TUAN_NGAY=4` trong `infra/.env` (1 = thứ Hai). Tắt hẳn:
`THU_TUAN=off`.

---

## 12. Dashboard thống kê (Umami)

Mở `https://stats.37-60-251-95.sslip.io`, đăng nhập `admin`. Mật khẩu KHÔNG nằm trong
repo hay trong hội thoại nào — nó được sinh ngẫu nhiên trên VPS lúc cài (14/9/2026):

```bash
ssh kidovps 'cat /root/KidoGame/infra/umami-admin.txt'; echo
```

Đăng nhập được rồi thì nên tự đổi mật khẩu trong dashboard (Settings → Profile) và
xoá file đó: `ssh kidovps 'rm /root/KidoGame/infra/umami-admin.txt'`. Mật khẩu mặc
định `admin`/`umami` đã bị đổi ngay lúc cài — máy dò tới tên miền này chỉ vài giây sau
khi Caddy xin chứng chỉ.

Số liệu **không** nằm trong bản sao lưu. Mất VPS là mất lịch sử lượt xem, không mất gì
của bé.

## 13. Theo dõi lỗi (GlitchTip)

Mở `https://loi.37-60-251-95.sslip.io`. Tài khoản quản trị và mật khẩu sinh ngẫu nhiên
trên VPS lúc cài (14/9/2026) — dòng 1 là email, dòng 2 là mật khẩu:

```bash
ssh kidovps 'cat /root/KidoGame/infra/glitchtip-admin.txt'; echo
```

Đổi mật khẩu trong dashboard (Profile) rồi xoá file đó được. Không ai tự đăng ký được:
tài khoản mới chỉ tạo bằng lời mời từ trong dashboard.

Tổ chức `kidogame`, project `web`. DSN của project lưu ở `/root/.gt-dsn` (600) — nó
chỉ dùng phía server, không bao giờ đưa xuống trình duyệt.

Dựng lại từ đầu trên máy mới, đúng thứ tự này (máy dò tới hostname mới vài giây sau
khi Caddy xin chứng chỉ):

```bash
cd /root/KidoGame/infra
# 1. GLITCHTIP_DB_PASSWORD, GLITCHTIP_SECRET_KEY = openssl rand -hex 32; ERRORS_DOMAIN để trống
bash tao-db-glitchtip.sh
docker compose up -d --no-deps glitchtip        # chờ healthy
bash tao-admin-glitchtip.sh
# 2. giờ mới đặt ERRORS_DOMAIN=loi.<...> trong .env
docker compose up -d --no-deps glitchtip caddy
# 3. tạo tổ chức, team, project `web` trong dashboard; DSN dạng nội bộ vào GLITCHTIP_DSN
# 4. luật "mỗi lỗi mới một thư" — project mới KHÔNG có luật nào, lỗi ghi mà không ai nhận thư
bash tao-bao-dong-glitchtip.sh
```

Lỗi **không** nằm trong bản sao lưu, và tự xoá sau 30 ngày (`GLITCHTIP_RETENTION_DAYS`).

## ⛔ NHỮNG LỆNH KHÔNG BAO GIỜ GÕ

| Lệnh | Nó làm gì |
|---|---|
| `docker compose down -v` | **`-v` XOÁ VOLUME** — mất sạch database và toàn bộ file game của các bé. Không hoàn lại được. |
| `docker system prune -a --volumes` | Như trên, cộng thêm xoá mọi thứ khác. |
| `rm -rf /` hoặc `rm -rf /*` | Xoá cả máy chủ. |

`docker compose down` (**không** có `-v`) thì an toàn — chỉ dừng container, dữ liệu
còn nguyên. Nhưng đã có mục 5 rồi thì gần như không cần tới nó.

### Trong panel Contabo cũng có một nút cấm

**"Reset root password"** — **KHÔNG BẤM.** Mật khẩu `root` trên VPS đang bị khoá
(hash bắt đầu bằng `!`), nên không ai đăng nhập bằng mật khẩu được, kể cả sau
12.456 lượt dò. Bấm nút đó là **đặt lại một mật khẩu cho root**, tức tự tay mở lại
đúng cái cửa đang đóng.

---

## Gõ sai thì sao

- Đang chạy dở, muốn dừng: **`Ctrl+C`**
- Màn hình đầy chữ, muốn dọn: **`Ctrl+L`** hoặc gõ `clear`
- Kẹt trong một trình soạn thảo lạ, không thoát được: bấm **`Ctrl+X`** (nano), hoặc
  gõ `:q!` rồi Enter (vim)
- Muốn về máy Mac: gõ `exit`

Không chắc thì **đừng đoán** — chụp màn hình hỏi lại. Mọi lệnh trong file này đều
an toàn, cái nguy hiểm nằm ở bảng ⛔ bên trên.
