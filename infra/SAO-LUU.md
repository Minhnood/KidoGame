# Sao lưu và phục hồi

Đo được, không phỏng đoán. Mọi lệnh trong file này đã chạy thật trên VPS ngày
10/9/2026 và kết quả ghi ngay bên dưới lệnh.

---

## 1. Cái gì được sao lưu

Đúng **hai** thứ, vì đó là toàn bộ dữ liệu không sinh lại được:

| Volume | Cách sao lưu | Ra file |
|---|---|---|
| `pgdata` | `pg_dump -Fc` | `db-<ngày>-<giờ>.dump` |
| `storage` | `tar czf` | `storage-<ngày>-<giờ>.tar.gz` |

Mọi thứ khác — image, `node_modules`, `.next`, chứng chỉ Caddy — dựng lại được từ
repo hoặc xin lại được, nên không sao lưu.

**Thứ tự trong `backup.sh` là nội dung chứ không phải thẩm mỹ:** dump DB **trước**,
đóng gói storage **sau**. Lúc đăng game, file xuống đĩa trước rồi mới tạo hàng
trong DB, và file không bao giờ bị xoá (tên file là hash nội dung). Nên mọi hàng
trong dump đều đã có file tương ứng từ trước, và file ấy chắc chắn còn nguyên khi
`tar` chạy. Làm ngược lại thì dump có thể chứa game mà file của nó chưa nằm trong
tar — phục hồi ra một game bấm vào là 404.

---

## 2. Bản sao lưu nằm ở đâu

| Nơi | Đường dẫn | Giữ | Ai tạo |
|---|---|---|---|
| VPS | `/root/KidoGame/infra/backups` | **7** bản mỗi loại | service `backup`, 3:00 hằng ngày |
| Máy Mac | `~/KidoGame-sao-luu` | **30** bản mỗi loại | `infra/keo-sao-luu.sh` qua launchd, 9:00 và 21:00 |

> `BACKUP_HOST_DIR=./backups` trong `.env` là đường dẫn **tương đối với thư mục
> chứa `docker-compose.yml`**, tức `infra/`. Không phải gốc repo. Đoán nhầm chỗ này
> là lỗi đầu tiên gặp phải lúc dựng `keo-sao-luu.sh`.

### Vì sao KÉO chứ không ĐẨY

`backup.sh` có sẵn `push_offsite()`: VPS tự `rsync` bản sao lưu sang máy khác.
Đường đó **không được dùng**, cố ý.

Đẩy nghĩa là VPS phải cầm một khoá SSH mở được vào máy đích, và chạy `rsync
--delete` lên đó. Nên ai chiếm được VPS thì cũng chiếm luôn quyền xoá sạch bản sao
lưu — bằng đúng cái khoá và đúng cái lệnh mà hệ thống tự đặt sẵn cho họ. Không
phải chuyện giả tưởng: máy này bị dò mật khẩu SSH **434 lần**, fail2ban đã cấm
**79 lượt** và đang chặn **14 IP** tính tới 10/9/2026.

Kéo thì đảo chiều tin cậy: máy Mac cầm khoá vào VPS, **VPS không cầm gì cả** và
không biết bản sao lưu được cất ở đâu.

**Cái giá, nói thẳng:** lượt kéo chỉ chạy khi máy Mac đang bật. Máy tắt cả tuần thì
bản ở đây cũ cả tuần. Vì thế `--kiem` luôn báo tuổi của bản mới nhất, và không bao
giờ nói "ổn" khi chưa đo.

### Vì sao KHÔNG `--delete`, và vì sao giữ 30 chứ không 7

Hệ quả trực tiếp của đoạn trên. VPS giữ 7 bản; máy Mac giữ 30. Bật `--delete` là
mỗi lượt kéo lại đồng bộ đúng cái việc **xoá** của bên kia sang bên này — tức tự
tay vứt bỏ lợi thế vừa giành được: có ai xoá sạch `/backups` trên VPS thì lượt kéo
kế tiếp lặp lại việc xoá đó ở đây. Rác tích lại thì `xoay_vong()` dọn theo luật
của **máy này**.

### Vì sao KHÔNG `--partial`

`backup.sh` dùng `--partial` vì đường truyền ở VN hay đứt. Ở đây thì không, và lý
do là nó ghép với `--ignore-existing` thành một cái bẫy vĩnh viễn: `--partial` giữ
phần đã tải **dưới đúng tên thật** khi đứt giữa chừng, rồi `--ignore-existing` của
lượt sau thấy tên đó đã tồn tại và bỏ qua — một file cụt nằm lại mãi mãi, mang
đúng tên một bản sao lưu hoàn chỉnh. Không có `--partial` thì rsync ghi vào tên tạm
rồi mới đổi tên lúc xong.

### Vì sao đích là `~/KidoGame-sao-luu`, không phải `~/Documents`

macOS bật iCloud Drive thì `~/Documents` và `~/Desktop` được **đồng bộ lên mây**
theo mặc định. Gói này chứa dump Postgres và toàn bộ file của trẻ: email phụ
huynh, hash mật khẩu, tên và ngày sinh của bé, file `.sb3` các con làm ra. Đặt nó
vào thư mục iCloud là lặng lẽ chuyển dữ liệu cá nhân của trẻ em sang máy chủ ở
nước ngoài — đúng loại việc mà `GIAM-SAT.md` mục 3 đã từ chối làm với Sentry và
Google Analytics. Không thể từ chối ở đó rồi làm ở đây chỉ vì ở đây nó đi qua
Finder.

Thư mục nhà (`~`) không nằm trong iCloud Drive, kể cả khi "Desktop & Documents
Folders" đang bật. Cũng **không** đặt trong repo: `git status` sẽ bày ra một thư
mục lạ, và cách sửa quen tay cho việc đó là `git add -A`.

---

## 3. Lệnh hằng ngày

```bash
# Tren may Mac — keo mot luot roi tu kiem
infra/keo-sao-luu.sh

# Chi hoi trang thai, khong keo gi
infra/keo-sao-luu.sh --kiem

# Lich tu dong (da cai)
launchctl print gui/$(id -u)/vn.kidogame.keo-sao-luu | grep -E "runs|last exit"
launchctl kickstart -p gui/$(id -u)/vn.kidogame.keo-sao-luu   # chay ngay
tail -30 ~/Library/Logs/kidogame-keo-sao-luu.log
```

### Bẫy: `pg_restore` trên máy Mac cũ hơn dump

`pg_restore` của Homebrew trên máy này là **16.14**, dump do **`pg_dump` 17.11**
trong container tạo ra. Bản cũ hơn **từ chối** đọc file của bản mới hơn:

```
pg_restore: error: unsupported version (1.16) in file header
```

Đây là đúng luật đã ghi trong `Dockerfile.backup` ("pg_dump lệch major với server
là nó TỪ CHỐI chạy"), chỉ khác chiều và khác máy. **Dump không sai.** Script báo
`BỎ QUA` chứ không báo `HỎNG` cho trường hợp này — báo hỏng là cách chắc chắn nhất
để người ta học cách bỏ qua dòng đỏ mỗi ngày, rồi bỏ qua luôn cái ngày dump hỏng
thật.

Muốn kiểm được nội dung ngay trên máy Mac:

```bash
brew install postgresql@17
KEO_PG_RESTORE=/opt/homebrew/opt/postgresql@17/bin/pg_restore infra/keo-sao-luu.sh --kiem
```

Không cài cũng không sao — phục hồi thật thì chạy trong container `postgres:17`,
ở đó phiên bản luôn khớp (xem mục 4).

---

## 4. PHỤC HỒI — đã chạy thật, không phải lý thuyết

Một bản sao lưu chưa từng phục hồi thử thì chưa phải bản sao lưu, nó là một file
lớn. Dưới đây là đúng những lệnh đã chạy trên VPS ngày 10/9/2026, kèm kết quả.

### 4.1 Thử phục hồi mà KHÔNG đụng vào DB thật

Làm việc này định kỳ. Nó dựng một Postgres rời, nạp dump vào đó, đếm lại, rồi xoá
container đi — DB đang chạy không bị chạm tới một lần nào.

```bash
ssh kidovps
DUMP=/root/KidoGame/infra/backups/db-20260910-030000.dump   # doi ten file

docker run -d --name kido-thu-phuc-hoi \
  -e POSTGRES_PASSWORD=thu -e POSTGRES_DB=thu postgres:17
until docker exec kido-thu-phuc-hoi pg_isready -U postgres -d thu; do sleep 2; done

docker cp "$DUMP" kido-thu-phuc-hoi:/tmp/d.dump
docker exec kido-thu-phuc-hoi pg_restore -U postgres -d thu \
  --no-owner --no-privileges /tmp/d.dump

docker exec kido-thu-phuc-hoi psql -U postgres -d thu -c \
  'select (select count(*) from "Parent") p, (select count(*) from "Child") c,
          (select count(*) from "Game") g, (select count(*) from "Tag") t;'

docker rm -f kido-thu-phuc-hoi
```

**Kết quả đo được 10/9/2026:** `Parent=2 Child=1 Game=1 Tag=4`, **13 bảng** — khớp
đúng từng con số với DB đang chạy.

### 4.2 Kiểm gói file game

```bash
T=/root/KidoGame/infra/backups/storage-20260910-030000.tar.gz
rm -rf /tmp/thu-storage && mkdir -p /tmp/thu-storage
tar xzf "$T" -C /tmp/thu-storage

# So NOI DUNG, khong so dung luong: du lam tron theo block va hai ben khac nhau
cd /tmp/thu-storage && find . -type f | sort | xargs md5sum | md5sum
docker run --rm -v kidogame_storage:/s:ro alpine \
  sh -c 'cd /s && find . -type f | sort | xargs md5sum | md5sum'

rm -rf /tmp/thu-storage
```

**Kết quả 10/9/2026:** hai dòng md5 **trùng khít** (`8d8727ce93…`), 4 file mỗi bên.
So dung lượng thì ra `25M` và `24.1M` — đó là `du` làm tròn theo block trên hai hệ
thống file khác nhau, **không** phải lệch nội dung. Đây chính là chỗ dễ kết luận
sai; hash mới là câu trả lời.

### 4.3 Phục hồi THẬT sau khi mất máy

Chỉ làm khi đã mất dữ liệu thật. **Đọc hết trước khi gõ dòng đầu tiên.**

```bash
# 0. Dung stack lai. KHONG dung `down -v` — `-v` xoa named volume, tuc xoa
#    dung cai dang dinh phuc hoi.
cd /root/KidoGame/infra && docker compose stop web prune caddy

# 1. Dua file sao luu len may (tu may Mac)
rsync -a --stats ~/KidoGame-sao-luu/db-<ngay>.dump \
  ~/KidoGame-sao-luu/storage-<ngay>.tar.gz kidovps:/root/khoi-phuc/

# 2. Nap DB. --clean --if-exists de ghi de len schema dang co.
docker compose up -d db
docker compose cp /root/khoi-phuc/db-<ngay>.dump db:/tmp/d.dump
docker compose exec -T db pg_restore -U kidogame -d kidogame \
  --clean --if-exists --no-owner --no-privileges /tmp/d.dump

# 3. Nap file game vao named volume
docker run --rm -v kidogame_storage:/s -v /root/khoi-phuc:/b:ro alpine \
  sh -c 'cd /s && tar xzf /b/storage-<ngay>.tar.gz'

# 4. Bat lai va DEM LAI, dung tin la xong vi khong co dong do nao
docker compose up -d
docker compose exec -T db psql -U kidogame -d kidogame -c \
  'select (select count(*) from "Parent") p, (select count(*) from "Game") g;'
curl -sI https://app.37-60-251-95.sslip.io | head -1
```

**Bước 4 không phải thủ tục.** Cả `pg_restore` lẫn `tar` đều có thể chạy xong mà
không làm được gì có ích, và không in ra dòng đỏ nào. Đúng bài học của commit
`80dfec0`: "không ném lỗi" là một tín hiệu rất yếu.

---

## 5. Cái này KHÔNG chống được gì

Nói ra để không ai tưởng nhầm là đã xong:

- **Máy Mac tắt.** Lượt kéo chỉ chạy khi máy bật. Chạy `--kiem` để biết bản trong
  tay đang bao nhiêu tuổi, đừng đoán.
- **Cả hai máy cùng mất** (cháy nhà, mất cắp cả hai). Muốn chống thì cần một bản
  thứ ba ở nơi khác về mặt địa lý — kho lưu trữ trả tiền, hoặc một máy khác.
- **Hỏng âm thầm lâu ngày.** Giữ 30 bản ở máy Mac tức lùi lại được khoảng một
  tháng. Dữ liệu hỏng từ 40 ngày trước thì mọi bản đang giữ đều đã mang cái hỏng đó.
- **Bản sao lưu bị đọc trộm.** File nằm nguyên dạng, **không mã hoá**, ở cả hai
  máy. Ai vào được máy Mac là đọc được email phụ huynh và hash mật khẩu. Đây là
  đánh đổi có ý thức: mã hoá thêm một khoá phải giữ, và mất khoá thì mất luôn bản
  sao lưu — hỏng theo cách tệ hơn hẳn cái nó chống.

Việc canh xem lượt sao lưu có còn chạy không nằm ở `GIAM-SAT.md` mục 8: mỗi đêm hệ
thống tự hỏi bản mới nhất bao nhiêu tuổi và gửi thư nếu quá 26 giờ.
