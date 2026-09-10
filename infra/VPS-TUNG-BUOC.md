# Dựng KidoGame lên VPS — từng bước một

Làm theo thứ tự từ bước 1 tới bước 15. Mỗi bước có **gõ gì** và **sẽ thấy gì**.
Thấy khác thì dừng lại, xem mục [Khi có gì sai](#khi-có-gì-sai) ở cuối.

Không cần tên miền. Không cần thẻ. Viết cho VPS Contabo (x86, Ubuntu/Debian).

---

## Trước hết: có HAI máy, đừng gõ lẫn

| | Là gì | Dấu nhắc trông như |
|---|---|---|
| **MÁY MAC** | máy fen đang ngồi | `macbook@MacBook-Air ~ %` |
| **VPS** | máy thuê của Contabo | `root@vmi123456:~#` |

**Cách kiểm đang ở máy nào:** nhìn chữ trước dấu `@`. Không chắc thì gõ `hostname`.

Mỗi khối lệnh dưới đây đều ghi rõ **[MAC]** hoặc **[VPS]**. Gõ sai máy là nguồn sai
số một của cả quy trình này.

**Mở tab mới trên Mac:** `Cmd+T`.

---

## Bước 0 — Cần cài gì trên VPS? Gần như không

Cả hệ thống chạy trong Docker, nên trên VPS chỉ cần **hai** thứ: **Docker** (bước 8)
và **git** (thường có sẵn; không có thì `sudo apt-get install -y git`).

**ĐỪNG cài mấy thứ này** — chúng không giúp gì mà còn phá:

| Đừng cài | Vì sao |
|---|---|
| Node.js, pnpm | đã nằm trong image, cài trên host không ai dùng |
| PostgreSQL | `db` là container; bản trên host chiếm cổng 5432 và gây lẫn |
| nginx, Apache | **chiếm cổng 80/443**, Caddy không bind được → cả web sập |
| control panel (aaPanel, Webmin…) | kéo theo cả nginx và MySQL, đúng hai thứ trên |

**Kiểm xem có ai chiếm cổng chưa.** Contabo cho chọn image lúc mua, và nếu fen lỡ
chọn bản kèm LAMP/control panel thì cổng 80 đã bị giữ:

**[VPS]**

```bash
sudo ss -tlnp | grep -E ':(80|443|5432) '
```

Thấy gì: **không in ra dòng nào** là tốt. In ra dòng nào thì gỡ thứ đang chiếm, ví dụ
`sudo apt-get purge -y apache2` hoặc `sudo systemctl disable --now nginx`.

**Tường lửa:** Contabo mặc định không chặn gì, khác Oracle. Nếu fen tự bật `ufw` thì
phải mở đủ ba cổng, không thì tự khoá mình ra ngoài:

**[VPS]**

```bash
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443    # chỉ khi dùng ufw
```

**Múi giờ:** không cần làm gì. `.env.example` đã có `TZ=Asia/Ho_Chi_Minh` và compose
áp nó cho cả `web`, `backup`, `prune`. Chuyện này quan trọng hơn vẻ ngoài của nó: thư
gửi phụ huynh có câu "sau ngày này thì file mất hẳn", chạy UTC là lệch một ngày.

---

# Phần 1 — Bảo mật (bước 1–6)

Contabo gửi mật khẩu root **qua email**, và cổng 22 của VPS đang mở ra Internet. Bot
sẽ thử đoán mật khẩu trong vòng vài phút. Nên làm phần này trước khi cài gì.

## Bước 1 — Đổi mật khẩu root

**[VPS]**

```bash
passwd
```

Gõ mật khẩu mới hai lần. **Không hiện ký tự nào khi gõ** — bình thường, cứ gõ tiếp.

Thấy gì: `passwd: password updated successfully`

## Bước 2 — Tạo user thường

**[VPS]** Thay `minh` bằng tên fen muốn.

```bash
adduser minh
usermod -aG sudo minh
```

`adduser` sẽ hỏi mật khẩu, rồi hỏi họ tên / số điện thoại — mấy cái đó **cứ Enter bỏ
qua**, cuối cùng gõ `Y`.

Thấy gì: `Adding user 'minh' ...` rồi về lại dấu nhắc.

Vì sao cần: chạy mọi thứ bằng `root` thì một lệnh gõ sai là phá cả máy. User thường
có `sudo` khi cần.

## Bước 3 — Tạo khoá trên MAC

Mở **tab mới** trên Mac (`Cmd+T`). **Đừng đóng tab SSH đang mở.**

**[MAC]**

```bash
ssh-keygen -t ed25519 -C kidogame-vps -f ~/.ssh/kidogame-vps
```

Nó hỏi passphrase — **cứ Enter hai lần** để trống.

Thấy gì: một hình vuông ký tự lạ (`+--[ED25519 256]--+`). Đó là bình thường.

Vì sao chạy trên MAC: lệnh này sinh ra hai file — khoá **riêng** và khoá **công
khai**. Khoá riêng là thứ chứng minh fen là fen, nên nó phải nằm ở máy fen ngồi.

## Bước 4 — Đưa khoá công khai lên VPS

**[MAC]** Thay `<IP>` bằng IP trong email Contabo.

```bash
ssh-copy-id -i ~/.ssh/kidogame-vps.pub minh@<IP>
```

Nó hỏi mật khẩu của user `minh` (mật khẩu fen đặt ở bước 2).

Thấy gì: `Number of key(s) added: 1`

## Bước 5 — Thử đăng nhập bằng khoá

**[MAC]**

```bash
ssh -i ~/.ssh/kidogame-vps minh@<IP>
```

Thấy gì: vào thẳng, **không hỏi mật khẩu**. Dấu nhắc thành `minh@vmi...:~$`.

> **Bước 6 chỉ làm khi bước 5 đã vào được không cần mật khẩu.** Chưa được thì
> đừng làm bước 6 — xem [Khi có gì sai](#khi-có-gì-sai).

## Bước 6 — Tắt đăng nhập bằng mật khẩu

**[VPS]** (trong phiên vừa đăng nhập bằng khoá)

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Rồi mở **tab thứ ba** trên Mac và thử lại:

**[MAC]**

```bash
ssh -i ~/.ssh/kidogame-vps minh@<IP>
```

Vào được thì phần 1 xong, giờ mới được đóng mấy tab cũ.

Vì sao giữ tab cũ: `restart ssh` **không ngắt phiên đang mở**. Nếu bước này làm sai
thì mọi kết nối mới bị từ chối, và phiên cũ là đường duy nhất để sửa lại.

---

# Phần 2 — Cài Docker (bước 7–9)

## Bước 7 — Xem VPS chạy OS gì

**[VPS]**

```bash
. /etc/os-release && echo "$ID $VERSION_ID"
```

Thấy gì: `ubuntu 24.04` hoặc `debian 12`. Cả hai đều dùng được lệnh ở bước 8.

## Bước 8 — Cài Docker

**[VPS]** Dán **cả khối** một lần.

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
. /etc/os-release
sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Mất 1–2 phút. Xong thì **thoát SSH rồi đăng nhập lại** — không làm vậy thì lệnh
`docker` báo permission denied.

**[VPS]**

```bash
exit
```

**[MAC]**

```bash
ssh -i ~/.ssh/kidogame-vps minh@<IP>
```

## Bước 9 — Kiểm Docker và RAM

**[VPS]**

```bash
docker version --format '{{.Server.Arch}}'
free -m | awk '/Mem:/{print $2" MB RAM"}'
```

Thấy gì: `amd64`, rồi số RAM.

**Nếu RAM dưới 4000 MB** thì thêm swap, không thì bước 13 sẽ chết giữa lúc build:

**[VPS]**

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

# Phần 3 — Lấy code lên VPS (bước 10–11)

Repo `Minhnood/KidoGame` là **private**, nên `git clone` trên VPS sẽ đòi xác thực.
Bỏ hẳn chuyện đó đi: đẩy code thẳng từ máy Mac.

## Bước 10 — Lối tắt `ssh`, để mọi lệnh sau ngắn lại

Làm một lần rồi từ đó gõ `ssh kidovps` thay cho cả dòng dài, và `rsync` cũng dùng
được cái tên đó.

**[MAC]** — thay `<IP>` bằng IPv4 của VPS.

```bash
cat >> ~/.ssh/config <<'EOF'
Host kidovps
  HostName <IP>
  User minh
  IdentityFile ~/.ssh/kidogame-vps
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh kidovps hostname
```

Thấy gì: tên máy VPS, không hỏi mật khẩu.

`User minh` là user tạo ở bước 2 — đổi thành tên fen đã đặt. Nếu bỏ qua bước 2 và
vẫn dùng `root` thì ghi `User root`, nhưng lúc đó bước 6 đã tắt login root nên hai
thứ chỏi nhau.

## Bước 11 — Đẩy code lên bằng `rsync`

**[MAC]** — một lệnh, chạy từ **máy Mac**, không phải trong VPS.

```bash
rsync -az --stats \
  --exclude node_modules --exclude .next --exclude storage \
  --exclude backups --exclude .env \
  ~/Work/KidoGame/ kidovps:KidoGame/
```

Thấy gì: một bảng số, dòng cần nhìn là **`Number of files transferred`**. Lần đầu
là vài nghìn; những lần sau chỉ vài chục — đúng số file vừa sửa.

> **`--stats` chứ KHÔNG phải `--info=progress2`.** macOS không dùng rsync của GNU mà
> dùng **openrsync** (`rsync --version` in ra `protocol version 29`), và bản đó
> **không hiểu `--info=`**. Gõ vào thì nó in một khối `usage:` dài rồi **không chuyển
> file nào** — mà nếu đang nối lệnh qua `|` thì mã thoát vẫn là 0, nên nhìn qua y như
> vừa chạy xong. Đã mất một lượt deploy vì đúng chuyện này ngày 9/9: bảo là xong,
> mà trên VPS không có file mới nào.
>
> **Cách kiểm chắc chắn** sau mỗi lần đẩy — chạy lại đúng lệnh trên nhưng thêm
> `-n` (chạy khô) và `-c` (so theo nội dung, không so theo giờ sửa file):
>
> ```bash
> rsync -acn --itemize-changes \
>   --exclude node_modules --exclude .next --exclude storage \
>   --exclude backups --exclude .env --exclude .git \
>   ~/Work/KidoGame/ kidovps:KidoGame/
> ```
>
> Không in ra dòng nào nghĩa là hai bên giống hệt.

Đường đích `kidovps:KidoGame/` không có dấu `/` đầu, nên nó là **thư mục nhà của
user** — `/home/minh/KidoGame` với user thường, `/root/KidoGame` nếu đang là root.
Viết vậy thì lệnh đúng cho cả hai, khỏi phải sửa theo.

Mất 10–30 giây. Muốn cập nhật code về sau thì chạy lại đúng lệnh này.

**Vì sao `rsync` chứ không phải `git clone`:**

- **Không cần làm gì trên GitHub** — bớt đúng ba nhịp dễ vấp nhất của cả quy trình.
- **Không có khoá GitHub nào nằm trên VPS.** Deploy key chỉ mở một repo, nhưng
  Personal Access Token thì mở **mọi** repo của fen — mà token là thứ người ta hay
  dán vào cho nhanh.
- **Code đang sửa dở trên máy đi theo luôn**, không phải commit rồi push trước.

**Cái gì bị loại, và vì sao:**

| Loại | Vì sao |
|---|---|
| `node_modules` | mấy trăm MB, image tự cài lại lúc build |
| `.next` | bản build của máy Mac, VPS build lại |
| `storage` | game của máy dev; VPS chạy trắng cho sạch |
| `backups` | bản sao lưu local |
| **`.env`** | **chứa mật khẩu SMTP** — VPS dùng `.env` riêng, tạo ở bước 12 |

`.git` **có** đi theo (khoảng 8MB), nên trên VPS vẫn `git log` được.

> **Đổi lại:** VPS không có remote GitHub nên **không `git pull` được**. Với bản thử
> thì đủ. Muốn `git pull` thì tạo khoá trên VPS bằng
> `ssh-keygen -t ed25519 -f ~/.ssh/kidogame_deploy -N ""`, dán nửa `.pub` vào
> **github.com/Minhnood/KidoGame → Settings → Deploy keys** (**đừng** tích "Allow
> write access"), rồi khai `Host github.com` trong `~/.ssh/config` của VPS.

---

# Phần 4 — Chạy (bước 12–15)

## Bước 12 — Điền file `.env`

**[VPS]**

```bash
cd ~/KidoGame/infra
cp -n .env.example .env
openssl rand -hex 24
```

Dòng cuối in ra một chuỗi dài — **copy nó**, đó là mật khẩu database.

> **`-n` nghĩa là "đã có `.env` rồi thì đừng đụng vào".** Quan trọng ở những lần
> chạy SAU: `cp` không có `-n` sẽ ghi đè file đang chạy, không hỏi gì, và file đó
> không theo git nên mất là mất hẳn — mật khẩu database, App Password mail, tất cả.
> `-n` bỏ qua thì **im lặng**, không in gì; muốn chắc thì `ls -l .env` trước.

Rồi mở file:

**[VPS]**

```bash
nano .env
```

> **Mấy dòng dưới đây là NỘI DUNG SỬA TRONG FILE, không phải lệnh gõ vào shell.**

Tìm và sửa **bốn dòng** này. Thay `1-2-3-4` bằng IP của fen, đổi dấu `.` thành `-`
(ví dụ IP `194.60.201.7` thì viết `194-60-201-7`):

```
POSTGRES_PASSWORD=<dán chuỗi vừa copy>
APP_DOMAIN=app.1-2-3-4.sslip.io
PLAYER_DOMAIN=play.1-2-3-4.sslip.io
ADMIN_DOMAIN=admin.1-2-3-4.sslip.io
```

Lưu và thoát nano: `Ctrl+O` → `Enter` → `Ctrl+X`.

**Cứ điền `ADMIN_DOMAIN`.** Để trống thì khu quản trị không có host riêng, `/admin`
nằm chung trên app domain — chạy được, nhưng mất một lớp phòng thủ. (Trước đây để
trống còn làm Caddy chết hẳn và kéo sập cả web; đã sửa trong `docker-compose.yml`.)

`sslip.io` là dịch vụ phân giải `<gì-cũng-được>.<ip>.sslip.io` về đúng IP đó, nên
không cần mua tên miền. Mua sau thì đổi ba dòng này rồi `docker compose up -d`.

## Bước 13 — Dựng stack

**[VPS]**

```bash
docker compose up -d --build
```

Lần đầu mất **5–15 phút**. Xong thì:

**[VPS]**

```bash
docker compose run --rm web pnpm --filter @kidogame/web db:deploy
docker compose ps
```

Thấy gì: năm dòng, `db` và `web` phải là `Up ... (healthy)`.

`db:deploy` chạy ba việc: `db push` dựng schema, `db:constraints` áp ràng buộc
CHECK, và `db:tags` tạo bốn danh mục game. Việc thứ ba mới thêm — trước đó danh mục
chỉ được tạo trong `db:seed`, mà `db:seed` cũng tạo tài khoản admin demo có mật khẩu
nằm công khai trong repo, nên một bản deploy làm đúng thì **không có danh mục nào**:
ô chọn ở trang upload trống, dãy lọc trang chủ trống, và không có gì báo lỗi.

## Bước 14 — Cắm mail, bắt buộc nếu muốn tự đăng ký

**Bỏ qua bước này thì không tạo được tài khoản nào.** Xác minh email là bắt buộc để
phụ huynh tạo tài khoản cho bé, và trên VPS `NODE_ENV=production` nên hộp thư dev
`/dev/thu` **tắt hẳn** — cố ý, vì in thư chứa token ra log production là rò token.

Cách rẻ nhất là SMTP Gmail. Vào **https://myaccount.google.com/apppasswords**, tạo
một App Password (cần tài khoản đã bật xác minh hai bước), nó cho **16 ký tự**.

Rồi sửa trong `.env` — **nội dung file, không phải lệnh shell**:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail cua fen>
SMTP_PASS=<16 ky tu, XOA HET DAU CACH>
MAIL_FROM="KidoGame <đúng cái gmail ở SMTP_USER>"
```

**Ba cái bẫy ở đây, cả ba đã mất thời gian thật:**

1. **App Password chỉ dùng được với ĐÚNG tài khoản Google đã tạo ra nó.** Có nhiều
   Gmail thì rất dễ tạo trong lúc trình duyệt đang đăng nhập tài khoản khác. Lỗi trả
   về là `535-5.7.8 Username and Password not accepted`, không hề nhắc chuyện lệch
   tài khoản. Kiểm bằng ảnh đại diện góc phải trên trang App Passwords.
2. **`MAIL_FROM` phải trùng `SMTP_USER`.** Gmail **âm thầm viết lại** người gửi thành
   địa chỉ đã xác thực, không báo lỗi — để lệch là thư đi với người gửi khác hẳn cái
   mình khai, và không có gì đỏ ở đâu.
3. **Xoá dấu cách trong 16 ký tự.** Google hiện nó thành bốn nhóm cho dễ đọc nhưng
   dấu cách không thuộc mật khẩu.

Xong thì **`up -d`, KHÔNG phải `restart`** — biến môi trường chỉ vào container lúc
**TẠO**, nên `restart` chạy lại container cũ với env cũ và mail vẫn không đi:

**[VPS]**

```bash
docker compose up -d
docker compose run --rm web node infra/mail-check.mjs
```

Phải thấy **7/7 mục đạt**. Rồi gửi thật một lá:

```bash
docker compose run --rm web node infra/mail-check.mjs --send <email cua fen>
```

Mở hòm thư kiểm. **Vào Spam cũng tính là hỏng** — Gmail dùng chung dễ vào spam hơn
domain riêng có DKIM, đó là cái giá của đường rẻ này.

## Bước 15 — Mở web

**[VPS]** Kiểm chứng chỉ đã cấp chưa:

```bash
docker compose logs caddy --tail 20
```

Rồi mở trên trình duyệt: `https://app.1-2-3-4.sslip.io`

Tạo tài khoản admin cho fen:

**[VPS]**

```bash
docker compose run --rm web pnpm --filter @kidogame/web db:make-admin <email-cua-fen>
```

Xong. Khu quản trị ở `https://admin.1-2-3-4.sslip.io/admin/dang-nhap`.

---

# Khi có gì sai

| Triệu chứng | Nguyên nhân thường gặp | Làm gì |
|---|---|---|
| Bước 5 vẫn hỏi mật khẩu | khoá công khai chưa lên đúng chỗ | làm lại bước 4, xem có báo `added: 1` |
| Sau bước 6 không vào được | `sshd_config` sai | dùng **tab SSH cũ** sửa lại, hoặc VNC console trong panel Contabo |
| `docker: permission denied` | chưa đăng nhập lại sau bước 8 | `exit` rồi ssh vào lại |
| Bước 11 `rsync` báo `command not found` | gõ trên VPS chứ không phải trên Mac | `exit` về Mac rồi chạy lại |
| Bước 11 `rsync` báo `rsync: not found` phía xa | VPS thiếu rsync | `ssh kidovps sudo apt-get install -y rsync` |
| Bước 13 chết giữa lúc build | hết RAM | thêm swap ở bước 9 rồi chạy lại |
| `caddy` `Restarting`, log có `server block without any key` | một biến domain trong `.env` bị đặt thành RỖNG | điền tên vào, rồi `docker compose up -d`. Kiểm trước bằng `node infra/caddy-config-check.mjs` |
| Web báo `Authentication failed against database` | đổi `POSTGRES_PASSWORD` sau khi DB đã tạo | xem ghi chú dưới |
| Caddy không xin được cert | sslip.io chưa trỏ đúng, hoặc cổng 80 bị chặn | `dig +short app.1-2-3-4.sslip.io` phải ra đúng IP |
| Mail báo `535-5.7.8` | App Password thuộc tài khoản Google KHÁC `SMTP_USER` | tạo lại App Password trên đúng tài khoản đó |
| `mail-check` xanh mà thư không tới | thư vào Spam | Gmail dùng chung dễ vào spam; vào Spam tính là hỏng |
| Ô chọn danh mục ở `/upload` trống | `Tag` rỗng | `docker compose run --rm web pnpm --filter @kidogame/web db:tags` |
| Đổi `.env` rồi mà không có tác dụng | dùng `restart` thay vì `up -d` | env chỉ vào container lúc TẠO — chạy `docker compose up -d` |

**Về lỗi mật khẩu database:** Postgres chỉ áp `POSTGRES_PASSWORD` **lần đầu** lúc tạo
dữ liệu. Đổi biến đó sau khi DB đã chạy thì DB vẫn giữ mật khẩu cũ. Sửa:

**[VPS]**

```bash
cd ~/KidoGame/infra
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)
docker compose exec -T db psql -U kidogame -d postgres -c "ALTER USER kidogame WITH PASSWORD '$PW'"
docker compose restart web
```

**KHÔNG bao giờ chạy `docker compose down -v`.** Cờ `-v` xoá volume, mà `storage` là
named volume — nó giữ toàn bộ game đã đóng gói. Muốn dừng thì `docker compose down`
(không có `-v`).

---

## Năm việc còn thiếu để mở cho người thật

Bản này đủ để **thử**. Chưa đủ để mở cho phụ huynh và trẻ thật:

1. **Tên miền thật.** `sslip.io` không gửi được mail từ domain riêng (không khai được
   SPF/DKIM), và một địa chỉ có IP trong tên thì không ai tin.
2. **Một domain riêng cho player.** Bản này để `app.` và `play.` cùng một domain gốc,
   nên trình duyệt coi chúng là *same-site* — cookie `SameSite=Lax` của trẻ vẫn đi
   kèm request từ game về app. Xem `docker-compose.yml:19`.
3. **`OPERATOR_NAME` / `OPERATOR_EMAIL`** trong `.env`. Thiếu thì thư gửi ra không có
   `Reply-To`, mà sáu lá thư trong hệ thống bảo người nhận "trả lời thư này".
4. **Tắt đăng nhập bằng mật khẩu và tắt login `root`** — phần 1, nếu lúc dựng nhanh
   đã bỏ qua. Đây không phải lo xa: đo trên một VPS Contabo mới, sau **23 giờ** đã có
   **26.466 lần** bị thử đoán mật khẩu SSH, khoảng 19 lần mỗi phút, từ bot quét cả
   Internet. Tên chúng thử nhiều nhất là `admin`, `user`, `deploy`, `test`. Đếm lại
   trên máy mình bằng:
   `journalctl -u ssh --no-pager | grep -ciE "Failed password|Invalid user"`
5. **Người trực đọc hàng đợi `/admin` hằng ngày.** Game hiện công khai ngay khi đăng,
   không qua duyệt trước — cơ chế kiểm soát nằm ở phía sau, và nó cần người.
