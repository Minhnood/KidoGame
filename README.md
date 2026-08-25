# KidoGame

Nền tảng để trẻ em đăng tải và chia sẻ game Scratch.

Trẻ upload file `.sb3`, server kiểm tra rồi đóng gói thành HTML standalone và
phục vụ nó trên **một origin riêng, trong iframe sandbox**.

## Chạy ở máy local

Cần: Node 20+, pnpm, PostgreSQL đang chạy.

```bash
pnpm install
createdb kidogame

cd apps/web
cp .env.example .env          # sửa DATABASE_URL cho đúng user của bạn
pnpm db:push                  # tạo bảng + áp dụng constraints.sql
pnpm db:seed                  # tạo tài khoản demo
```

Mở hai cửa sổ terminal:

```bash
# App origin
pnpm --filter @kidogame/web dev            # http://localhost:3000

# Player origin — PHẢI chạy từ thư mục gốc repo
node infra/player-server.mjs               # http://127.0.0.1:3001
```

> Player chạy ở `127.0.0.1` chứ không phải `localhost` là có chủ đích: cookie
> **không** phân biệt theo port, nên chỉ đổi port thì session của app vẫn lọt
> sang. Khác hostname mới là cách ly thật.

## Kiểm thử

```bash
pnpm --filter @kidogame/sb3 test           # 33 unit test, gồm fixture độc hại

# End-to-end, cần cả hai server ở trên đang chạy + Chrome
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-check.mjs   # 14 kiểm tra
SB3_FIXTURE=/đường/dẫn/tới/game.sb3 node infra/e2e-auth.mjs    # 19 kiểm tra
```

`e2e-auth.mjs` tự tạo tài khoản với email ngẫu nhiên nên chạy lại nhiều lần được.
Dọn dữ liệu test:

```sql
delete from "Parent" where email like 'e2e-%@kidogame.test';
```

`infra/e2e-check.mjs` kiểm cả các tính chất bảo mật, không chỉ chức năng: iframe
trỏ đúng player origin, có sandbox, cookie phiên không rò sang player origin, và
file HTML đổi tên `.sb3` bị từ chối.

## Giao diện

Tailwind v4, cấu hình CSS-first. **Design token nằm trong `@theme` ở
`src/app/globals.css`** — đổi màu thương hiệu, bo góc, cỡ chữ chỉ sửa ở đó.

Vài lựa chọn có chủ đích cho đối tượng trẻ em:

- Vùng chạm tối thiểu 48px (`--spacing-touch`), không phải 44px như web người lớn.
- Font Nunito có bộ dấu tiếng Việt đầy đủ, `next/font` self-host nên lúc chạy
  không có request nào ra Google — hợp CSP `default-src 'self'`.
- `line-height` rộng hơn mặc định vì dấu tiếng Việt sẽ chạm nhau.
- Ô chọn file là component tự làm (`file-picker.tsx`), không dùng
  `<input type="file">` trần — trình duyệt tự vẽ chữ "Choose File" bằng tiếng Anh
  và CSS không đổi được.

## Tài khoản và phân quyền

Ba vai, và ranh giới giữa chúng là có chủ đích:

- **Phụ huynh** — tài khoản duy nhất có email. Tạo tài khoản cho con, khoá/mở khoá,
  đổi mật khẩu cho con, **ẩn game của con**. KHÔNG đăng game hộ con.
- **Bé** — không email, không tên thật. Chỉ bé mới đăng được game, để game ghi công
  đúng người làm.
- **Khách** — chỉ xem và chơi.

Phiên lưu trong DB, **không dùng JWT**: phụ huynh phải thu hồi được phiên của con
ngay lập tức (khoá tài khoản, đổi mật khẩu). JWT đã phát ra thì không gọi về được.

Mật khẩu băm bằng scrypt của `node:crypto` (N=2^16), không thêm dependency native.
Băm mật khẩu **chỉ ở `src/lib/password.ts`** — đừng tự gọi scrypt ở chỗ khác, hai
bên lệch định dạng là hash không verify được mà không ai báo lỗi.

Chống dò mật khẩu khoá theo danh tính (email/username), **không theo IP**: cả một
lớp học hay một gia đình thường dùng chung IP.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/sb3` | Kiểm tra, chuẩn hoá, đóng gói, thumbnail. **Toàn bộ phần bảo mật nằm ở đây.** |
| `apps/web` | Next.js + Tailwind v4: giao diện, API, Prisma |
| `apps/web/src/components` | Bộ component dùng chung (button, field, notice, card, file-picker) |
| `infra` | Server tĩnh cho dev, Caddyfile cho production, script e2e |
| `storage` | File theo địa chỉ nội dung: `sb3/`, `html/`, `thumb/` |

## Vài điều dễ vấp

- **Sửa `packages/sb3` xong phải build lại**: `pnpm --filter @kidogame/sb3 build`.
  Nó nằm trong `serverExternalPackages` nên Next dùng `dist/`, không dùng `src/`.
- **Đổi `next.config.ts` thì phải restart dev server**, Next không hot-reload file này.
- `infra/player-server.mjs` và `infra/Caddyfile` phải giữ cùng bộ header. Sửa một
  bên nhớ sửa bên kia — e2e chỉ kiểm được bản dev.
- **Selector trong e2e chỉ dùng `data-testid` hoặc thuộc tính ngữ nghĩa** (`role`),
  không bám vào class trang trí. Bám vào class là đổi giao diện một cái là test vỡ hàng loạt.
- Next tự render một route-announcer rỗng cũng mang `role="alert"`. Khi tìm hộp lỗi
  phải khoanh phạm vi (`form [role=alert]`), không thì `.first()` bắt trúng cái rỗng.
- **Click submit trong e2e phải khoanh vào đúng form.** Thanh điều hướng có nút
  "Đăng xuất" cũng là `<button type="submit">`, nên `click('button[type=submit]')`
  sẽ đăng xuất giữa bài test và làm test đổ ở chỗ khác hẳn.
- `prisma db push` không tạo được CHECK constraint. Chúng nằm trong
  `prisma/constraints.sql`, script `db:push` đã tự gọi — nhưng nếu bạn chạy
  `prisma db push` trực tiếp thì phải chạy `pnpm db:constraints` sau đó.

## Trạng thái

Xong: M0 (đóng gói player), M1 (upload → chơi được), M2 (auth phụ huynh/bé).
Chưa làm: tìm kiếm và tag (M3), nút report + trang admin (M4), Docker Compose (M5).

Tài khoản demo sau khi seed: `demo@kidogame.local` / `demo1234ab` (phụ huynh),
`beminh` / `be1234` (bé).
