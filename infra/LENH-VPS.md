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

### Đổi App Password của Gmail — 🖥 **MÁY MAC**

Làm khi mật khẩu 16 ký tự ấy lỡ lọt ra đâu đó: dán nhầm vào chat, vào ảnh chụp màn
hình, vào file theo repo.

Trước hết vào `https://myaccount.google.com/apppasswords`, **xoá cái cũ**, tạo cái
mới. Rồi:

```
infra/doi-smtp-pass.sh
```

Script hỏi mật khẩu mới (gõ không hiện lên màn hình), sao lưu bản cũ ra ngoài repo,
sửa **cả ba** nơi — `apps/web/.env`, `infra/.env`, và `.env` trên VPS — rồi tự hỏi
Gmail xem mật khẩu mới có dùng được không.

Ba nơi phải khớp nhau, và sửa tay ba file là ba cơ hội gõ sai. Cách hỏng thì im
lặng: web vẫn chạy, trang chủ vẫn xanh, chỉ có thư xác minh ngừng đi — phụ huynh
không xác minh được thì con họ không đăng được game, mà không có gì báo cho ai biết.

Script dừng lại trước khi đụng tới VPS nếu Gmail từ chối mật khẩu mới, nên gõ sai
thì production vẫn đang chạy bình thường bằng mật khẩu cũ.

> Sau khi đổi, việc **bắt buộc** còn lại là mở web thật, đăng ký một tài khoản phụ
> huynh và **bấm** link trong thư xác minh. Gửi được thư và bấm được link là hai câu
> hỏi khác nhau.

---

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
