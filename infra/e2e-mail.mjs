/**
 * Tiện ích dùng chung cho các bộ e2e phải XÁC MINH EMAIL của phụ huynh.
 *
 * Vì sao gần như mọi bộ e2e đều cần: `createChild` từ chối tạo tài khoản cho bé khi
 * email phụ huynh chưa xác minh (xem `src/lib/auth.ts`), và đường duy nhất để xác
 * minh là bấm link trong thư. Ở dev, thư được in ra stdout của server, nên bài test
 * đọc link từ file log mà server đang ghi vào.
 *
 * Gom vào một chỗ chứ không chép sang từng bộ: cả bốn bộ cần đúng một logic, mà logic
 * đó có một cái bẫy về thời gian (xem `taoPhuHuynhDaXacMinh`). Chép ra bốn bản thì
 * sớm muộn ba bản mất phần chống bẫy.
 */
import fs from 'node:fs';

/**
 * Bắt buộc phải có MAIL_LOG, thoát ngay nếu thiếu.
 *
 * Thoát với thông báo nói rõ phải làm gì, chứ không để bài test chạy tiếp rồi đổ ở
 * một phép kiểm chẳng liên quan — đó là kiểu thất bại làm người ta đi sửa nhầm chỗ.
 */
export function batBuocMailLog(tenBo) {
  const p = process.env.MAIL_LOG ?? '';
  if (!p || !fs.existsSync(p)) {
    console.error(`${tenBo}: thiếu MAIL_LOG hoặc file không tồn tại: ${p || '(chưa đặt)'}`);
    console.error('');
    console.error('Bộ này phải tạo tài khoản cho bé, mà việc đó đòi email phụ huynh ĐÃ XÁC MINH,');
    console.error('và link xác minh chỉ có trong thư. Ở dev thư được in ra stdout của server:');
    console.error('');
    console.error('  pnpm --filter @kidogame/web dev > /tmp/kg-mail.log 2>&1 &');
    console.error('  MAIL_LOG=/tmp/kg-mail.log node infra/<bộ>.mjs');
    process.exit(1);
  }
  return p;
}

/** Link xác minh MỚI NHẤT trong log, hoặc null. */
export function linkXacMinhMoiNhat(mailLog) {
  const log = fs.readFileSync(mailLog, 'utf8');
  const all = log.match(/https?:\/\/[^\s│]+\/xac-minh-email\?token=[A-Za-z0-9_-]+/g);
  return all ? all[all.length - 1] : null;
}

/**
 * Chờ một lá mail GỬI TỚI `to` mà nội dung khớp `re`.
 *
 * Cắt log theo từng khối mail rồi mới đối chiếu, chứ không grep cả file: grep cả file
 * thì "có chuỗi này ở đâu đó" và "có chuỗi này trong CÙNG lá thư gửi tới người đó" là
 * một, nên phép kiểm sẽ xanh cả khi mail gửi nhầm người.
 */
export async function choMailToi(mailLog, to, re, timeoutMs = 20000) {
  const den = Date.now() + timeoutMs;
  while (Date.now() < den) {
    const log = fs.readFileSync(mailLog, 'utf8');
    const found = log
      .split('┌─ MAIL')
      .slice(1)
      .some((block) => {
        const body = block.split('└─')[0] ?? '';
        const toLine = body.split('\n').find((line) => line.includes('tới:')) ?? '';
        return toLine.includes(to) && re.test(body);
      });
    if (found) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Trả về một hàm `taoPhuHuynhDaXacMinh(ctx, email)` -> `{ page, verified }`.
 *
 * Hàm trả về đăng ký một phụ huynh mới rồi bấm link xác minh của CHÍNH người đó.
 *
 * CÁI BẪY mà `linkTruoc` xử lý: log được ghi bất đồng bộ, nên đọc "link mới nhất" ngay
 * sau khi đăng ký có thể trúng link của phụ huynh TRƯỚC. Khi đó bài test xác minh lại
 * một tài khoản đã xác minh rồi, còn tài khoản vừa tạo thì vẫn chưa — và nó sẽ đổ ở
 * một phép kiểm khác hẳn, cách đó vài chục dòng. Vì vậy phải chờ tới khi thấy một link
 * KHÁC link đã thấy lần trước.
 */
export function taoBoXacMinh(mailLog, { appOrigin, matKhau }) {
  const bamLink = taoBoBamLink(mailLog, { appOrigin });

  return async function taoPhuHuynhDaXacMinh(ctx, email) {
    const page = await ctx.newPage();
    await page.goto(`${appOrigin}/dang-ky`, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#password', matKhau);
    await page.click('[data-testid=auth-form] button[type=submit]');
    await page.waitForURL(/phu-huynh/, { timeout: 20000 }).catch(() => {});

    const verified = await bamLink(page);
    return { page, verified };
  };
}

/**
 * Trả về `bamLink(page)` cho trường hợp phụ huynh ĐÃ được bộ test tự đăng ký.
 *
 * Chờ một link xác minh MỚI xuất hiện trong log, mở nó bằng `page` đang truyền vào
 * (nên nó dùng đúng phiên của phụ huynh đó), rồi đưa `page` về `/phu-huynh` để bên
 * gọi dùng tiếp như trước. Trả về true nếu trang xác minh báo thành công.
 *
 * Xem `taoBoXacMinh` để hiểu vì sao phải so với link trước đó.
 *
 * ĐIỀU KIỆN DÙNG: phải gọi `taoBoBamLink(...)` TRƯỚC khi đăng ký phụ huynh. Nó chụp
 * "link mới nhất lúc này" ngay khi được tạo; tạo nó sau khi đăng ký thì nó chụp luôn
 * chính lá thư vừa gửi, rồi ngồi đợi một lá thư khác cho tới khi hết thời gian. Đã vấp
 * thật ở e2e-discovery.
 */
export function taoBoBamLink(mailLog, { appOrigin }) {
  let linkTruoc = linkXacMinhMoiNhat(mailLog);

  return async function bamLink(page) {
    let link = null;
    const den = Date.now() + 20000;
    while (Date.now() < den) {
      const moi = linkXacMinhMoiNhat(mailLog);
      if (moi && moi !== linkTruoc) {
        link = moi;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!link) return false;
    linkTruoc = link;

    await page.goto(link, { waitUntil: 'networkidle' });
    const text = await page.locator('body').innerText();
    const ok = /đã được xác minh/i.test(text);

    await page.goto(`${appOrigin}/phu-huynh`, { waitUntil: 'networkidle' });
    return ok;
  };
}
