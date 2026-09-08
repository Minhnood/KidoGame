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

# Phần 3 — Lấy code lên VPS (bước 10–12)

Repo `Minhnood/KidoGame` là **private**, nên VPS cần khoá riêng để đọc.

## Bước 10 — Tạo khoá cho VPS đọc GitHub

**[VPS]**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kidogame_deploy -N ""
cat ~/.ssh/kidogame_deploy.pub
```

Thấy gì: một dòng dài bắt đầu bằng `ssh-ed25519 AAAA...`. **Copy cả dòng đó.**

> Khoá này khác khoá ở bước 3. Bước 3 là để **Mac vào VPS**; bước này là để **VPS
> đọc GitHub**. Quy tắc: khoá riêng luôn sinh ở máy khởi xướng kết nối.

## Bước 11 — Dán khoá vào GitHub

Trên trình duyệt: **github.com/Minhnood/KidoGame → Settings → Deploy keys →
Add deploy key**.

- Title: `vps-contabo`
- Key: dán dòng vừa copy
- **ĐỪNG tích** "Allow write access" — server chỉ cần đọc

Bấm **Add key**.

## Bước 12 — Clone repo

**[VPS]**

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/kidogame_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
git clone -b dev git@github.com:Minhnood/KidoGame.git
```

Lần đầu nó hỏi `Are you sure you want to continue connecting?` — gõ `yes`.

Thấy gì: `Cloning into 'KidoGame'...` rồi `done.`

---

# Phần 4 — Chạy (bước 13–15)

## Bước 13 — Điền file `.env`

**[VPS]**

```bash
cd ~/KidoGame/infra
cp .env.example .env
openssl rand -hex 24
```

Dòng cuối in ra một chuỗi dài — **copy nó**, đó là mật khẩu database.

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

**`ADMIN_DOMAIN` tuyệt đối đừng để trống.** Để rỗng là Caddy chết hẳn và kéo sập cả
web, mà thông báo lỗi không hề nhắc tới `ADMIN_DOMAIN` — mất hàng giờ để tìm.

`sslip.io` là dịch vụ phân giải `<gì-cũng-được>.<ip>.sslip.io` về đúng IP đó, nên
không cần mua tên miền. Mua sau thì đổi ba dòng này rồi `docker compose up -d`.

## Bước 14 — Dựng stack

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
| Bước 12 báo `Permission denied (publickey)` | chưa dán deploy key, hoặc dán thiếu | làm lại bước 11, copy **cả** dòng |
| Bước 14 chết giữa lúc build | hết RAM | thêm swap ở bước 9 rồi chạy lại |
| `caddy` `Restarting` | `ADMIN_DOMAIN` để trống | điền vào `.env`, rồi `docker compose up -d` |
| Web báo `Authentication failed against database` | đổi `POSTGRES_PASSWORD` sau khi DB đã tạo | xem ghi chú dưới |
| Caddy không xin được cert | sslip.io chưa trỏ đúng, hoặc cổng 80 bị chặn | `dig +short app.1-2-3-4.sslip.io` phải ra đúng IP |

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

## Ba việc còn thiếu để mở cho người thật

Bản này đủ để **thử**. Chưa đủ để mở cho phụ huynh và trẻ thật:

1. **Tên miền thật.** `sslip.io` không gửi được mail từ domain riêng (không khai được
   SPF/DKIM), và một địa chỉ có IP trong tên thì không ai tin.
2. **Một domain riêng cho player.** Bản này để `app.` và `play.` cùng một domain gốc,
   nên trình duyệt coi chúng là *same-site* — cookie `SameSite=Lax` của trẻ vẫn đi
   kèm request từ game về app. Xem `docker-compose.yml:19`.
3. **`OPERATOR_NAME` / `OPERATOR_EMAIL`** trong `.env`. Thiếu thì thư gửi ra không có
   `Reply-To`, mà sáu lá thư trong hệ thống bảo người nhận "trả lời thư này".
