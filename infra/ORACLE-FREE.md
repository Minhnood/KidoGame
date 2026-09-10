# Dựng VPS miễn phí trên Oracle Cloud (ARM) + tên miền

Bản hướng dẫn cho **bản chạy thử**: một VPS ARM miễn phí vĩnh viễn ở Singapore và
một tên miền, đủ để `docker compose up` lần đầu.

**File này dừng ở lúc VPS và DNS đã sẵn sàng.** Từ đó trở đi đi theo mục
[Triển khai lên VPS (M5)](../README.md#triển-khai-lên-vps-m5) trong README — phần
`.env`, `db:deploy`, `db:make-admin`, `db:repackage` đã viết kỹ ở đó, đừng viết lại.

> Nhắc lại cảnh báo của README: **stack này chưa `docker compose up` lần nào.** Coi
> buổi đầu là buổi gỡ lỗi, đừng coi là buổi phát hành.

---

## 0. Vì sao Oracle, và cái giá phải trả

| | Oracle Always Free (ARM) | Hetzner CX22 |
|---|---|---|
| Giá | **$0 vĩnh viễn** | ~$4.59/tháng (tính theo giờ) |
| Cấu hình | 2 OCPU ARM / **12GB RAM** / 50GB | 2 vCPU x86 / 4GB / 40GB |
| Độ trễ về VN | **~30–40ms** (Singapore) | ~180ms (US West), không có DC châu Á |

Đổi lại **ba** thứ, biết trước thì không bị bất ngờ:

1. **Oracle đổi điều kiện mà không thông báo.** Ngày 15/6/2026 gói này bị cắt từ
   4 OCPU/24GB xuống 2 OCPU/12GB — không blog, không email, chỉ sửa tài liệu. Nên
   đừng đặt lên đây thứ gì mất là đau; đây là máy để thử.
2. **"Out of Capacity"** là chuyện thường khi tạo instance ARM.
3. **Instance Always Free để không dùng có thể bị thu hồi.**

Stack này chạy ARM được — đã kiểm từng thứ, không đoán: `node:24-bookworm-slim`,
`postgres:17`, `caddy:2` đều có bản arm64; `infra/Dockerfile` không ghim
`--platform`; dependency không có `sharp`/`canvas`/`puppeteer`. Prisma và Tailwind 4
có binary native nhưng image được **build ngay trên máy đó**, nên target `native`
tự khớp. Nếu sau này chuyển sang build ở nơi khác rồi push image thì phải khai
`binaryTargets` cho Prisma — build tại chỗ thì không cần.

---

## 1. Chọn region — BƯỚC KHÔNG ĐẢO LẠI ĐƯỢC

Làm sai bước này là phải xoá tài khoản làm lại từ đầu, nên đọc trước khi bấm.

Tài khoản Oracle có một **home region cố định, đổi không được sau khi tạo**, và
**tài nguyên Always Free chỉ tồn tại trong home region đó**. Chọn Frankfurt rồi mai
muốn máy ở Singapore thì không có đường nào ngoài làm lại tài khoản mới.

**Chọn `Singapore (ap-singapore-1)`.** Hai lý do trùng nhau: gần Việt Nam nhất trong
các region Oracle, và là một trong những region còn capacity ARM dễ nhất.

Tạo tài khoản ở https://signup.oraclecloud.com — cần thẻ để xác minh (nó charge thử
khoảng $1 rồi hoàn lại).

### `Billing Country` KHÔNG phải chỗ chọn region — đã vấp một lần

Wizard hỏi **`Country/Territory` ở bước 1**, rồi sang bước 2 (Account Information)
thì trường đó thành **chỉ-đọc**. Đây là **quốc gia thanh toán**: Oracle đối chiếu nó
với thẻ và xuất hoá đơn theo nó. Nó **không** quyết định máy đặt ở đâu.

Rất dễ chọn Singapore ở đây vì tưởng đang chọn datacenter — **đã xảy ra**, và phải
đăng ký lại từ đầu vì bước 2 không cho sửa. Tệ hơn: quốc gia thanh toán khoá lệch với
thẻ thì **chặn cả bước nâng lên Pay As You Go** (có ca thật trên Oracle Community),
tức chặn đúng việc bắt buộc phải làm trước ngày thứ 30 ở mục 2 bên dưới. Một cái bẫy
hẹn giờ 30 ngày, nổ đúng lúc trên máy đã có dữ liệu.

| Trường | Điền | Sửa được sau? |
|---|---|---|
| `Billing Country` (bước 1) | **quốc gia của THẺ** — Việt Nam | không |
| `Home Region` (bước 2) | **Singapore (ap-singapore-1)** | không |

Đăng ký lại thì mở **cửa sổ ẩn danh** (tránh state cũ của wizard); email báo trùng thì
dùng biến thể dấu chấm của Gmail — Oracle coi là chuỗi khác, thư vẫn về đúng hòm.

Chọn Việt Nam ở billing **không** làm mất Singapore ở home region: hai trường độc
lập, và Singapore vốn là region Oracle gần Việt Nam nhất nên luôn có trong danh sách.

### Bức tường thẻ — chỗ dừng thật của nhiều người ở VN

Oracle **chỉ nhận** Visa/Mastercard/Amex/Discover, kể cả debit **không đòi PIN**.
**Từ chối hẳn**: thẻ ATM nội địa/Napas, thẻ ảo, thẻ dùng một lần, prepaid, debit đòi
PIN. Bộ xử lý là CyberSource.

Trước khi bấm, bật trong app ngân hàng **hai công tắc riêng** — *Thanh toán trực
tuyến* **và** *Thanh toán quốc tế* — rồi kiểm **hạn mức online** (nhiều ngân hàng để
mặc định 0đ). Bật một cái rồi tưởng xong là chỗ vấp thường nhất.

**Trượt rồi thì đừng thử lại ngay.** Sau một lần bị merchant nước ngoài từ chối,
ngân hàng thường tự khoá thẻ với giao dịch quốc tế — lúc đó bật công tắc trong app
**không mở được nữa**, phải gọi hotline in ở mặt sau thẻ. Và thử lại nhiều lần thì
CyberSource đánh dấu rủi ro, khoá cả thẻ lẫn tài khoản một thời gian.

**PayPal không phải đường thoát:** PayPal ở Việt Nam cũng phải liên kết đúng loại thẻ
quốc tế đó.

Không mở được thẻ thì đừng cố — xem [Nếu Oracle không đi được](#8-nếu-oracle-không-đi-được).

---

## 2. Bẫy 30 ngày, ghi ngay vào lịch

Tài khoản mới vào **trial 30 ngày**. Hết trial mà **không nâng lên Pay As You Go**
thì instance **bị xoá**, kể cả khi nó nằm gọn trong hạn mức Always Free.

Nâng lên PAYG **không** làm mất phần miễn phí: Always Free vẫn miễn phí, thẻ chỉ ở
đó nếu vượt hạn mức. Vào **Billing → Upgrade and Manage Payment**.

Đặt nhắc trước hạn vài ngày. Đây là cách mất máy phổ biến nhất trên Oracle, và nó
mất im lặng.

---

## 3. Tạo instance

**Compute → Instances → Create instance.**

| Trường | Điền | Ghi chú |
|---|---|---|
| Image | **Canonical Ubuntu 24.04** | phải là bản **aarch64**, không phải x86 |
| Shape | **VM.Standard.A1.Flex** | trong tab **Ampere**, không phải AMD |
| OCPU / RAM | **2** và **12 GB** | gõ tay, mặc định thấp hơn hạn mức |
| Boot volume | mặc định (~50GB) | đo được **5MB/game**, thừa sức |
| SSH keys | dán **public key** của fen | đừng chọn mật khẩu |

Chưa có key thì tạo trên máy fen:

```bash
ssh-keygen -t ed25519 -C kidogame-oracle -f ~/.ssh/kidogame-oracle
cat ~/.ssh/kidogame-oracle.pub     # dán chuỗi này vào Oracle
```

Gặp **"Out of Capacity"**: đổi Availability Domain rồi thử lại. Vẫn không được thì
dừng — quay về Hetzner theo giờ (~$0.31 cho một cuối tuần), đừng ngồi thử lại cả tối.

### Giữ IP lại: đổi sang Reserved

Mặc định instance nhận **ephemeral public IP**. Nó sống qua reboot, nhưng gắn chặt
vào instance — dựng lại máy là mất IP, và lúc đó **ba bản ghi DNS đang trỏ vào hư
không** trong khi Caddy thì đang cố xin chứng chỉ.

Đổi ngay: **Instance → Attached VNICs → chọn VNIC → IPv4 Addresses → Edit →
`Reserved public IP` → Reserve new**.

---

## 4. Mở cổng — HAI TẦNG, và đây là bẫy lớn nhất của Oracle

Mở xong tầng một mà quên tầng hai thì cổng vẫn đóng. Cách nó hỏng lừa người: SSH
vẫn vào bình thường (cổng 22 được mở sẵn), `docker compose up` vẫn xanh, năm service
vẫn healthy — chỉ **Caddy xin chứng chỉ thất bại**, và dòng lỗi ACME nhìn y như lỗi
DNS chưa trỏ. Đi sửa DNS thì không sửa được gì cả, vì DNS không sai.

### Tầng 1 — Security List của VCN

**Networking → Virtual Cloud Networks → VCN của fen → Subnets → subnet →
Security Lists → Default Security List → Add Ingress Rules.**

Thêm hai rule:

| Source CIDR | IP Protocol | Destination Port Range |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

### Tầng 2 — iptables ngay trong máy

Image Ubuntu của Oracle **cài sẵn `netfilter-persistent` và `iptables-persistent`**,
chặn 80/443 bất kể tầng 1 đã mở. SSH vào rồi:

```bash
ssh -i ~/.ssh/kidogame-oracle ubuntu@<IP>
sudo apt-get purge -y netfilter-persistent iptables-persistent
```

Sau lệnh này **Security List là tường lửa duy nhất** — nên giữ nó đúng ba cổng
**22, 80, 443**, đừng mở thêm gì.

Không muốn purge thì chèn rule rồi lưu (phải `iptables-legacy`, không phải
`iptables`):

```bash
sudo iptables-legacy -I INPUT -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables-legacy -I INPUT -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### Kiểm từ MÁY KHÁC, không kiểm từ trong máy

Kiểm bằng `curl localhost` trong chính instance thì **luôn xanh** dù cả hai tầng còn
đóng — nó không đi qua tường lửa nào. Chạy trên máy fen:

```bash
nc -zv <IP> 80 && nc -zv <IP> 443
```

Chưa có gì lắng nghe cổng 80 thì nó vẫn báo đóng, nên cách gọn là dựng tạm một
listener trong instance rồi thử lại:

```bash
# trong instance
sudo python3 -m http.server 80
# trên máy fen — phải thấy trang index
curl -sI http://<IP>/ | head -1
```

Thấy `HTTP/1.0 200 OK` là cả hai tầng đã mở. `Ctrl+C` để tắt listener tạm.

---

## 5. Cài Docker (arm64)

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

**Thoát SSH rồi vào lại** để nhóm `docker` có hiệu lực, rồi kiểm kiến trúc:

```bash
docker version --format '{{.Server.Arch}}'   # phải in: arm64
```

Không cần swap: 12GB RAM đủ cho `next build`. (Chỉ máy 2–4GB mới cần, và đó là chỗ
`next build` hay OOM giữa đường.)

---

## 6. Tên miền và DNS

Bản chạy thử dùng **một tên miền** với ba subdomain. Đây đúng bằng mặc định trong
`Caddyfile` (`app.kidogame.vn` / `play.kidogame.vn`), nên không phải sửa Caddyfile.

Mua `.xyz` ở Porkbun (~$1–3/năm) hoặc Cloudflare Registrar (~$10.46/năm, bán đúng
giá gốc, gia hạn cùng giá). Rồi thêm **ba bản ghi `A`** cùng trỏ về IP đã reserve,
**TTL 300** cho lần đầu để sửa sai nhanh:

```
app.<domain>     A   <IP>
play.<domain>    A   <IP>
admin.<domain>   A   <IP>
```

Kiểm **trước khi** `docker compose up`, vì Caddy xin chứng chỉ ngay lúc khởi động và
DNS chưa trỏ là thất bại:

```bash
dig +short app.<domain> play.<domain> admin.<domain>
```

Ba dòng phải ra đúng IP đó. Ra rỗng thì đợi TTL, đừng khởi động Caddy — Let's Encrypt
có giới hạn số lần thử thất bại, và đốt hết thì phải chờ hàng giờ.

### Muốn $0 hoàn toàn

`duckdns.org` phân giải cả `*.tên-của-fen.duckdns.org`, nên ba subdomain trên vẫn
chạy và Caddy vẫn xin được chứng chỉ. Đổi lại **mail từ domain riêng không làm được**
(không control được DKIM) — dùng đường **Gmail SMTP + App Password** đã wire sẵn
trong `mail.ts`, và bỏ qua phần Resend.

### Một tên miền: cái gì bị yếu đi

`docker-compose.yml:19` viết **hai domain là yêu cầu bảo mật**. Dùng một domain là
cố ý đi chệch, nên phải biết chệch ở đâu:

- **Còn nguyên:** cookie phiên là host-only nên không lọt sang player subdomain.
- **Mất:** trình duyệt coi `play.<domain>` và `app.<domain>` là **same-site**, nên
  cookie `SameSite=Lax` của đứa trẻ vẫn đi kèm request từ game về app. Hai domain
  riêng thì thành cross-site và cookie đứng ngoài hẳn.

Tình huống thật sau lưng câu đó: một game do người lạ upload đọc được phiên của đứa
trẻ đang đăng nhập. **Chấp nhận được cho bản thử không có dữ liệu trẻ thật. Không
chấp nhận được khi mở cho người thật** — lúc đó mua domain thứ hai, đổi
`PLAYER_DOMAIN` trong `infra/.env` rồi `docker compose up -d` (không cần `--build`,
CSP dựng lại theo request trong `src/middleware.ts`).

---

## 7. Xong. Bước tiếp

Đến đây fen có: instance ARM chạy, hai cổng mở đã kiểm từ ngoài, Docker arm64, và ba
subdomain trỏ đúng IP.

Tiếp theo là `git clone`, `cp -n .env.example .env` rồi `docker compose up -d --build` —
đi theo [README, mục Triển khai lên VPS (M5)](../README.md#triển-khai-lên-vps-m5).

Hai nhóm biến trong `.env` mà bản thử vẫn phải khai, và **cả hai đều không làm stack
đổ nếu bỏ trống** — đó chính là lý do phải nhắc ở đây:

- **Đường gửi mail: `SMTP_*` hoặc `RESEND_API_KEY`, phải có một.** Không biến nào
  trong nhóm này khai dạng `:?` (`docker-compose.yml:99` nói rõ vì sao: compose
  không diễn đạt được "một trong hai", nên `:?` trên một đường sẽ chặn cả stack đối
  với người đã cấu hình xong đường kia). Hệ quả: **cấu hình mail thiếu không lộ ra
  lúc `up`** — năm service vẫn healthy, trang chủ vẫn chạy — mà lộ ra lúc một phụ
  huynh thật bấm nút và không nhận được thư xác minh, tức là lúc họ đã bỏ đi. Chạy
  **`node infra/mail-check.mjs`** trước khi mở web; đó là chỗ trả lời có/không cho cả
  hai đường. Khai cả hai thì **SMTP thắng Resend**.

  Và **giá trị giữ chỗ kiểu `re_xxx` không tính là đã cấu hình**: image đặt
  `NODE_ENV=production` (`Dockerfile:78`), nên lá thư đầu tiên **ném lỗi** chứ không
  rơi về transport console như trên máy dev. Trên VPS thì phải là key thật hoặc
  `SMTP_*` thật.
- **`OPERATOR_NAME` / `OPERATOR_EMAIL`** — thiếu thì thư gửi ra **không có
  `Reply-To`**, mà sáu lá thư trong hệ thống bảo người nhận "trả lời thư này" (một
  trong số đó là đường duy nhất để phụ huynh lấy lại file `.sb3` của con trước ngày
  xoá vĩnh viễn). Bước nhắc việc quá hạn cũng từ chối gửi. Bỏ trống là đang thử một
  hệ thống khác với hệ thống sẽ chạy thật. Kiểm bằng
  `cd apps/web && pnpm exec tsx ../../infra/tra-loi-thu-check.ts`.

---

## 8. Nếu Oracle không đi được

Chỗ dừng gần như luôn là **bước xác minh thẻ**, không phải chỗ nào kỹ thuật. Nếu đã
gọi hotline mà thẻ vẫn không mở được thanh toán quốc tế thì **đừng cố thêm** — càng
thử càng bị khoá lâu, và cái đang chặn không nằm trong tầm sửa của mình.

Hai đường thay thế, chọn theo cái đang thiếu:

**Thiếu thẻ quốc tế → VPS Việt Nam, trả bằng chuyển khoản/QR.** Không cần thẻ, không
có bước xác minh nào để trượt. VinaHost từ ~119k/tháng, AZDIGI từ ~100k, Vietnix từ
157k. Lấy gói **≥4GB RAM** — thấp hơn thì `next build` OOM giữa đường, và nó chết
không ra dòng lỗi nào chỉ đúng chỗ. Đây **không phải bản kém hơn**: độ trễ ~10–30ms,
tốt hơn cả Oracle Singapore.

**Có thẻ nhưng muốn rẻ nhất → Hetzner, tính theo giờ.** CX22 (2 vCPU / 4GB / 40GB)
trần ~$4.59/tháng nhưng tính theo giờ, nên **xoá server sau mỗi buổi** thì một cuối
tuần 48 tiếng ≈ **$0.31**. Đổi lại không có DC châu Á: ~180ms từ VN (US West),
~250–300ms (EU). Gói 4GB thì **thêm swap trước khi build**.

Cả hai đường đều là **x86**, nên bỏ qua phần arm64 ở mục 0 và mục 5 — `docker version
--format '{{.Server.Arch}}'` sẽ in `amd64`, đúng như vậy là được. Mục **4 (mở cổng hai
tầng)** và phần **reserved IP ở mục 3** là chuyện riêng của Oracle, bỏ luôn: VPS
thường không có tường lửa tầng hai và IP đã tĩnh sẵn.

Mọi thứ còn lại — domain, ba bản ghi DNS, `dig` kiểm trước khi `up`, cài Docker, hai
nhóm biến trong `.env` ở mục 7 — giữ y nguyên.
