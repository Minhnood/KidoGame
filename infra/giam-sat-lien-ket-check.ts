/**
 * Tab "Theo dõi" của khu quản trị nói ĐÚNG SỰ THẬT về ba công cụ.
 *
 * VÌ SAO CÓ BỘ NÀY. Cái tab ấy tồn tại để người trực liếc một cái là biết công cụ nào
 * còn sống. Một cái chấm xanh vẽ sẵn — do cấu hình có giá trị, chứ không do gọi thử —
 * còn tệ hơn không có chấm nào: nó bảo "Umami vẫn chạy" đúng vào hôm container Umami
 * chết, và người trực tin nó nên không đi xem.
 *
 * VÌ SAO KHÔNG ĐO QUA TRÌNH DUYỆT: bốn trạng thái cần dựng là bốn bộ biến môi trường
 * khác nhau, mà biến của Next đọc lúc máy chủ khởi động. Đo qua HTTP thì phải khởi động
 * lại dev server bốn lần. `docLienKetGiamSat` nhận `env` truyền vào chính là để chỗ này
 * dựng đủ bốn trạng thái trong một lượt, và bộ e2e chỉ còn phải kiểm phần vẽ ra màn hình.
 *
 * Chạy:
 *   cd apps/web && pnpm exec tsx ../../infra/giam-sat-lien-ket-check.ts
 */

import { createServer, type Server } from 'node:http';
import { docLienKetGiamSat } from '../apps/web/src/lib/giam-sat-lien-ket';

const results: { ten: string; ok: boolean }[] = [];
const check = (ten: string, ok: boolean, chiTiet = '') => {
  results.push({ ten, ok });
  console.log(`${ok ? '✅' : '❌'} ${ten}${chiTiet ? ` — ${chiTiet}` : ''}`);
};

/** Máy chủ giả trả về đúng một mã, để dựng từng trạng thái. */
function dung(ma: number, cham = 0): Promise<{ goc: string; dong: () => void; duong: string[] }> {
  const duong: string[] = [];
  return new Promise((ok) => {
    const s: Server = createServer((req, res) => {
      duong.push(req.url ?? '');
      const tra = () => {
        res.writeHead(ma, ma === 302 ? { location: '/dang-nhap' } : {});
        res.end('x');
      };
      if (cham) setTimeout(tra, cham);
      else tra();
    });
    s.listen(0, '127.0.0.1', () => {
      const cong = (s.address() as { port: number }).port;
      ok({ goc: `http://127.0.0.1:${cong}`, dong: () => s.close(), duong });
    });
  });
}

const mixpanelBat = { MIXPANEL_TOKEN: 'token-thu', MIXPANEL_ID_SALT: 'muoi-du-dai-1234567' };
const lay = (ds: Awaited<ReturnType<typeof docLienKetGiamSat>>, id: string) =>
  ds.find((l) => l.id === id)!;

/* --- 1. Chưa cấu hình gì: không cái nào được vẽ là đang chạy ------------------- */
{
  const ds = await docLienKetGiamSat({});
  check('Ba công cụ luôn được liệt kê đủ', ds.length === 3, ds.map((l) => l.id).join(', '));
  check(
    'Chưa cấu hình: Umami và GlitchTip đều ghi "chưa bật"',
    lay(ds, 'umami').trangThai === 'chua-cau-hinh' && lay(ds, 'glitchtip').trangThai === 'chua-cau-hinh'
  );
  check(
    'Chưa cấu hình thì KHÔNG có đường dẫn để bấm nhầm',
    lay(ds, 'umami').url === '' && lay(ds, 'glitchtip').url === ''
  );
  check(
    'Thiếu biến Mixpanel: ghi "chưa bật", không phải "đang chạy"',
    lay(ds, 'mixpanel').trangThai === 'chua-cau-hinh'
  );
}

/* --- 2. Dịch vụ sống: 200 và 302 đều là sống ---------------------------------- */
{
  const umami = await dung(200);
  const loi = await dung(302);
  const ds = await docLienKetGiamSat({ STATS_ORIGIN: umami.goc, ERRORS_ORIGIN: loi.goc });

  check('Trả 200 thì ghi đang chạy', lay(ds, 'umami').trangThai === 'song');
  /* GlitchTip đá về trang đăng nhập bằng 302, và đó VẪN là đang chạy. Coi 302 là chết
     thì tab này báo động giả mỗi ngày, và báo động giả hằng ngày thì người ta tắt não. */
  check('Trả 302 về trang đăng nhập vẫn là đang chạy', lay(ds, 'glitchtip').trangThai === 'song');
  check(
    'Gọi GlitchTip ở /_health/ chứ không phải trang chủ',
    loi.duong.includes('/_health/'),
    loi.duong.join(' ')
  );
  check('Gọi Umami ở gốc', umami.duong.includes('/'), umami.duong.join(' '));
  check(
    'Có đường dẫn để mở, và là đúng địa chỉ đã cấu hình',
    lay(ds, 'umami').url === umami.goc && lay(ds, 'glitchtip').url.startsWith(loi.goc)
  );
  umami.dong();
  loi.dong();
}

/* --- 3. Dịch vụ chết: 500, và cổng không ai nghe ------------------------------ */
{
  const nam = await dung(500);
  const ds = await docLienKetGiamSat({ STATS_ORIGIN: nam.goc });
  check('Trả 500 thì ghi KHÔNG trả lời', lay(ds, 'umami').trangThai === 'chet');
  nam.dong();
}
{
  /* Dựng rồi đóng ngay: cổng chắc chắn không còn ai nghe, mà không phải đoán một số cổng. */
  const tat = await dung(200);
  tat.dong();
  const ds = await docLienKetGiamSat({ ERRORS_ORIGIN: tat.goc });
  check('Không ai nghe cổng thì ghi KHÔNG trả lời', lay(ds, 'glitchtip').trangThai === 'chet');
  check(
    'Dịch vụ chết vẫn giữ đường dẫn để người trực đi xem',
    lay(ds, 'glitchtip').url.startsWith(tat.goc)
  );
}

/* --- 4. Mixpanel: bật thì nói bật, nhưng KHÔNG vẽ chấm xanh ------------------- */
{
  const ds = await docLienKetGiamSat(mixpanelBat);
  const mp = lay(ds, 'mixpanel');
  check(
    'Mixpanel bật: ghi "đang bật, không tự đo được", KHÔNG ghi đang chạy',
    mp.trangThai === 'khong-do-duoc',
    mp.trangThai
  );
  check('Mixpanel luôn có đường dẫn tới mixpanel.com', mp.url === 'https://mixpanel.com/');
  check(
    'Thiếu một trong hai biến Mixpanel vẫn là chưa bật',
    lay(await docLienKetGiamSat({ MIXPANEL_TOKEN: 'token-thu' }), 'mixpanel').trangThai ===
      'chua-cau-hinh'
  );
}

/* --- 5. Dịch vụ treo không được kéo trang quản trị treo theo ------------------ */
{
  /* Chậm 6 giây, quá hạn 2,5 giây trong `giam-sat-lien-ket.ts`. Không có hạn chờ thì
     một container treo làm cả trang quản trị không mở được — tức công cụ theo dõi kéo
     sập đúng chỗ người ta vào để xử lý sự cố. */
  const cham = await dung(200, 6000);
  const batDau = Date.now();
  const ds = await docLienKetGiamSat({ STATS_ORIGIN: cham.goc });
  const giay = (Date.now() - batDau) / 1000;
  check('Dịch vụ treo: bỏ cuộc trong vòng 4 giây', giay < 4, `${giay.toFixed(1)}s`);
  check('Dịch vụ treo được ghi là KHÔNG trả lời', lay(ds, 'umami').trangThai === 'chet');
  cham.dong();
}

const dat = results.filter((r) => r.ok).length;
console.log(`\n${dat}/${results.length} phép kiểm đạt.`);
process.exit(dat === results.length ? 0 : 1);
