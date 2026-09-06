import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { appOrigin } from '@/lib/mail';
import { getAdmin } from '@/lib/session';
import { actionLabel, hanXoaHan, NGAY_GIU_GAME_DA_GO, ngayVi } from '@/lib/moderation';
import { slaDueAt, TAKEDOWN_SLA_WORKING_DAYS } from '@/lib/operator';
import { coViecGap, docViecCoHan, SAP_XOA_NGAY } from '@/lib/viec-co-han';
import { MAX_UNRESOLVED_GROUPS } from '@/lib/error-log';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { CotTheoNgay, DonutTrangThai } from '../bieu-do';

export const dynamic = 'force-dynamic';

/**
 * "12 phút trước" thay cho "13:41:07 5/9/2026".
 *
 * Câu hỏi thật khi liếc danh sách hoạt động là "cái này vừa xảy ra hay từ tuần
 * trước", và một dấu thời gian tuyệt đối bắt người đọc tự trừ hai con số để trả lời
 * — mỗi dòng một lần, tám dòng một lượt. Quá một ngày thì đổi ngược lại: lúc đó
 * "hôm nào" mới là thứ cần biết, và "97 giờ trước" là một phép trừ nữa.
 *
 * Dấu thời gian tuyệt đối KHÔNG mất: nó nằm trong `dateTime` và `title` của thẻ
 * `<time>`, tức di chuột vào là thấy, và trình đọc màn hình vẫn lấy được.
 */
function khiNao(luc: Date, bayGio: Date): string {
  const giay = Math.max(0, Math.round((bayGio.getTime() - luc.getTime()) / 1000));
  if (giay < 60) return 'vừa xong';
  if (giay < 3600) return `${Math.floor(giay / 60)} phút trước`;
  if (giay < 86400) return `${Math.floor(giay / 3600)} giờ trước`;
  return luc.toLocaleDateString('vi-VN');
}

/**
 * Một ô số.
 *
 * `href` là BẮT BUỘC, không phải tuỳ chọn. Một con số trên bảng tổng quan mà không
 * bấm được là một câu đố: người trực đọc "4 game cần xem" rồi vẫn phải tự đi tìm bốn
 * game đó ở tab khác, với đúng bộ lọc — và nếu họ chọn nhầm bộ lọc thì con số không
 * khớp danh sách, mà không ai biết bên nào sai.
 *
 * `gap` = ô đang có việc. Chỉ tô đỏ khi việc đó CÓ HẠN hoặc KHÔNG HOÀN TÁC ĐƯỢC, chứ
 * không tô mọi số khác 0: nếu cả bảng cùng đỏ thì màu đỏ thôi không còn nghĩa gì, và
 * thứ thật sự gấp — một yêu cầu gỡ quá hạn trả lời, một game sắp bị xoá vĩnh viễn —
 * chìm lẫn vào giữa những con số chỉ đang bận.
 */
function O({
  so,
  nhan,
  phu,
  href,
  muc = 'viec',
  testId,
}: {
  so: number;
  nhan: string;
  phu: string;
  href: string;
  /**
   * Con số này là VIỆC hay là SỐ NỀN.
   *
   * `nen` không bao giờ tô màu, kể cả khi khác 0 — "6 game đang hiện" không phải một
   * việc chưa ai làm, nó là tỉ lệ để đọc mấy con số bên trên. Bản trước dùng một cờ
   * `gap` hai trạng thái nên cả nhóm Số nền cũng lên vạch cam, tức bảng nói có ba
   * việc đang chờ trong khi không có việc nào.
   */
  muc?: 'gap' | 'viec' | 'nen';
  testId: string;
}) {
  const coViec = so > 0 && muc !== 'nen';
  const gap = muc === 'gap';
  /*
   * VẠCH MÀU BÊN TRÁI, không phải nền màu.
   *
   * Cần một tín hiệu đọc được bằng ĐUÔI MẮT, vì mười hai ô giống hệt nhau thì phải
   * đọc từng cái mới biết cái nào đang có việc — đúng thứ mà một bảng tổng quan tồn
   * tại để khỏi phải làm. Ba mức: đỏ (gấp), cam (có việc), xám (rỗng).
   *
   * Vạch chứ không tô nền cả thẻ: đổi nền là đổi cặp màu của MỌI dòng chữ nằm trên
   * nó, tức ba cặp mới cho mỗi mức, chín phép đo thêm vào `contrast-check` cho một
   * thứ mà một vạch 4px nói xong. Viền không phải chữ nên không có ngưỡng đọc nào bị
   * động tới.
   */
  const vach = gap && coViec ? 'border-l-danger' : coViec ? 'border-l-accent' : 'border-l-border';
  return (
    <Link
      href={href}
      data-testid={testId}
      data-so={so}
      className={[
        'group block border-l-4 p-5 no-underline transition-colors',
        MAT_THE,
        vach,
        'hover:border-accent hover:border-l-accent',
        gap && coViec ? 'border-danger-border' : '',
      ].join(' ')}
    >
      <p
        className={[
          /*
             `tabular-nums` để cột số không nhảy khi 9 thành 10, và `leading-none` vì
             con số cao 40px mà mang theo cả khoảng dòng mặc định thì cách nhãn bên
             dưới xa hơn hẳn khoảng cách giữa nhãn và dòng phụ — mắt sẽ đọc nó như
             một khối rời chứ không phải cùng một thẻ.
          */
          'text-[2.5rem] font-extrabold leading-none tabular-nums',
            gap && coViec
            ? 'text-danger'
            : coViec || (muc === 'nen' && so > 0)
              ? 'text-ink'
              : 'text-ink-soft/70',
        ].join(' ')}
      >
        {so}
      </p>
      <p className="mt-2.5 font-bold text-ink group-hover:text-accent-text">{nhan}</p>
      <p className="mt-1 text-sm leading-snug text-ink-soft">{phu}</p>
    </Link>
  );
}

function Nhom({
  title,
  phu,
  children,
}: {
  title: string;
  phu?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      {/* Tiêu đề nhóm kèm một vạch chạy hết bề ngang: ba nhóm ô vuông giống nhau xếp
          liền nhau thì ranh giới giữa chúng chỉ còn là khoảng trắng, mà khoảng trắng
          thì cùng một cỡ với khoảng cách giữa các ô trong nhóm. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
        <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
        {phu && <p className="text-sm text-ink-soft">{phu}</p>}
      </div>
      {/*
        Một cột trên điện thoại. Ô số ép thành hai cột ở 390px thì con số to phải thu
        nhỏ lại, mà con số chính là thứ duy nhất cần đọc được từ xa trên bảng này.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

/**
 * Bảng tổng quan: một màn hình trả lời "hôm nay có việc gì gấp không".
 *
 * VÌ SAO CẦN, khi đã có hai tab hàng đợi: hai tab kia trả lời "có gì trong hàng",
 * không trả lời "cái nào sắp muộn". Ba thứ trên trang này KHÔNG đọc ra được từ hàng
 * đợi dù có ngồi đọc hết:
 *
 *  - Yêu cầu gỡ bản quyền QUÁ HẠN trả lời. Hàng đợi xếp cũ nhất lên đầu, nhưng "cũ
 *    nhất" và "đã quá hạn" là hai chuyện; hạn tính theo NGÀY LÀM VIỆC nên một yêu
 *    cầu gửi chiều thứ sáu và một yêu cầu gửi sáng thứ hai không cùng một đồng hồ.
 *  - Game đã gỡ SẮP BỊ XOÁ HẲN. Sau hạn đó nút "Cho hiện lại" không còn gì để hiện
 *    lại — đây là việc duy nhất trong cả khu quản trị mà bỏ lỡ là mất vĩnh viễn, và
 *    nó lại nằm trong bộ lọc "Đã gỡ", tức chỗ ít người mở nhất.
 *  - Game bị HỆ THỐNG tự siết mà chưa người nào xem. Bộ lọc "Cần xem" gộp chúng
 *    chung với game chỉ mới bị báo cáo, trong khi hai nhóm này khác hẳn nhau: nhóm
 *    kia đang chờ xem, nhóm này đang BỊ PHẠT rồi mà chưa ai đọc nội dung.
 *
 * Việc số 7 trong danh sách trước khi mở cửa cho người thật là "người trực đọc hàng
 * chờ hằng ngày". Trang này là thứ họ mở đầu tiên mỗi ngày.
 */
export default async function AdminTongQuanPage() {
  /* Kiểm quyền ở TỪNG trang, không chỉ ở layout — xem chú thích trong `admin/layout.tsx`. */
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

  const bayGio = new Date();
  const truoc24h = new Date(bayGio.getTime() - 86400_000);
  const truoc7ngay = new Date(bayGio.getTime() - 7 * 86400_000);
  /* Mốc của biểu đồ cột: 00:00 của ngày cách đây 13 ngày, để cột đầu tiên là một ngày
     TRỌN chứ không phải một ngày bị cắt ở giữa — cột thấp hơn thực tế thì người đọc
     kết luận sai về xu hướng, và không có gì trên hình nói rằng nó bị cắt. */
  const truoc14ngay = new Date(bayGio.getFullYear(), bayGio.getMonth(), bayGio.getDate() - 13);

  /*
   * Việc CÓ HẠN đọc từ `lib/viec-co-han.ts`, không tính tại chỗ.
   *
   * Thư nhắc hằng đêm đọc đúng hàm này. Hai chỗ tự tính "cái nào sắp muộn" là hai câu
   * trả lời khác nhau cho cùng một câu hỏi, và lệch ở đây nghĩa là bảng này nói không
   * có việc gấp trong khi lá thư nói có ba.
   */
  const viec = await docViecCoHan(bayGio);

  const [
    canXem,
    heThongTuSiet,
    theoTrangThai,
    gameGanDay,
    loiGanDay,
    baoLoiChuaXuLy,
    chuaBamDongHo,
    nhomLoiChuaXuLy,
    loiMoi24h,
    gameDangHien,
    gameMoi7ngay,
    beMoi7ngay,
    beDangKhoa,
    phuHuynhChuaXacMinh,
    baoCaoMoi24h,
  ] = await Promise.all([
    prisma.game.count({
      where: { OR: [{ reportCount: { gt: 0 } }, { status: { not: 'PUBLISHED' } }] },
    }),
    prisma.game.count({ where: { status: { in: ['LIMITED', 'HIDDEN'] } } }),
    /* Bốn số cho biểu đồ tròn. `groupBy` một lượt thay vì bốn phép `count`: bốn
       trạng thái là một PHÂN HOẠCH, nên hỏi bằng bốn truy vấn rời là mở đường cho
       bốn con số đọc ở bốn thời điểm khác nhau — cộng lại không bằng tổng, và biểu
       đồ phần-trên-tổng nói sai tỉ lệ mà không có gì báo. */
    prisma.game.groupBy({ by: ['status'], _count: { _all: true } }),
    /* Game 14 ngày qua, lấy về `createdAt` rồi đếm theo ngày ở JS.
       KHÔNG dùng `date_trunc` trong SQL thô: gom theo ngày phải theo múi giờ của
       người xem (container khai `TZ=Asia/Ho_Chi_Minh`), và Postgres gom theo múi giờ
       của phiên — hai cái lệch nhau thì mọi game đăng sau 17:00 rơi sang ngày hôm
       sau, im lặng. Số hàng ở đây là số game 14 ngày, tức nhỏ theo định nghĩa. */
    prisma.game.findMany({
      where: { createdAt: { gte: truoc14ngay } },
      select: { createdAt: true },
    }),
    /* Lỗi cho biểu đồ thứ ba. Đọc `firstSeenAt` chứ KHÔNG `lastSeenAt`: câu hỏi là
       "hôm đó có lỗi MỚI nào xuất hiện không", còn `lastSeenAt` nhảy sang hôm nay mỗi
       lần một lỗi cũ lặp lại — dùng nó thì mọi lỗi cũ dồn hết vào cột cuối và biểu đồ
       nói rằng hôm nay vừa sinh ra hai chục lỗi mới. */
    prisma.errorLog.findMany({
      where: { firstSeenAt: { gte: truoc14ngay } },
      select: { firstSeenAt: true, count: true },
    }),
    prisma.bugReport.count({ where: { resolvedAt: null } }),
    /* Game đã gỡ mà `removedAt` còn null: gỡ từ TRƯỚC khi có cột này. Job dọn không
       xoá chúng, nó bấm đồng hồ ở lượt chạy kế tiếp — nên đây không phải việc của
       người trực, chỉ là một con số để không ai hoảng khi thấy nó ở bộ lọc "Đã gỡ". */
    prisma.game.count({ where: { status: 'REMOVED', removedAt: null } }),
    prisma.errorLog.count({ where: { resolvedAt: null } }),
    prisma.errorLog.count({ where: { lastSeenAt: { gte: truoc24h } } }),
    prisma.game.count({ where: { status: 'PUBLISHED' } }),
    prisma.game.count({ where: { createdAt: { gte: truoc7ngay } } }),
    prisma.child.count({ where: { createdAt: { gte: truoc7ngay } } }),
    prisma.child.count({ where: { isLocked: true } }),
    prisma.parent.count({ where: { emailVerifiedAt: null } }),
    prisma.report.count({ where: { createdAt: { gte: truoc24h } } }),
  ]);

  const goQuaHan = viec.goQuaHan.length;
  const sapXoa = viec.gameSapXoa.length;
  const quaHanXoa = viec.gameQuaHanXoa.length;
  const soGoDangMo = viec.goQuaHan.length + viec.goSapToiHan.length + viec.goConHan.length;
  /* "Gấp" = đúng ba ô có vạch đỏ ở nhóm đầu. Cố ý KHÔNG gồm "cần xem" hay "báo cáo
     mới": hai cái đó gần như luôn khác 0 ở một trang đang sống, nên gộp vào là dòng
     yên tĩnh dưới đây không bao giờ hiện, mà một câu không bao giờ hiện thì bằng
     không có. */
  const khongCoViecGap = !coViecGap(viec) && nhomLoiChuaXuLy === 0;
  const cuNhat = viec.cuNhat;

  /* --- Dữ liệu hai biểu đồ ------------------------------------------------- */

  const soTheoTrangThai = (st: string) =>
    theoTrangThai.find((t) => t.status === st)?._count._all ?? 0;
  const tongGame = theoTrangThai.reduce((t, x) => t + x._count._all, 0);

  /* Thứ tự bốn múi là thứ tự MỨC SIẾT tăng dần, không phải thứ tự số lớn đến nhỏ:
     người đọc lần theo vành để thấy "càng đi càng nặng", và sắp theo số thì cùng một
     trạng thái nhảy chỗ mỗi lần dữ liệu đổi — màu phải đi theo trạng thái, không đi
     theo hạng. */
  const mucDonut = [
    {
      nhan: 'Đang hiện',
      so: soTheoTrangThai('PUBLISHED'),
      mau: 'fill-bd-hien',
      mauO: 'bg-bd-hien',
      href: '/admin?loc=dang-hien',
    },
    {
      nhan: 'Ẩn khỏi danh sách',
      so: soTheoTrangThai('LIMITED'),
      mau: 'fill-bd-siet',
      mauO: 'bg-bd-siet',
      href: '/admin?loc=an-mem',
    },
    {
      nhan: 'Đã ẩn hẳn',
      so: soTheoTrangThai('HIDDEN'),
      mau: 'fill-bd-an',
      mauO: 'bg-bd-an',
      href: '/admin?loc=da-an',
    },
    {
      nhan: 'Đã gỡ',
      so: soTheoTrangThai('REMOVED'),
      mau: 'fill-bd-go',
      mauO: 'bg-bd-go',
      href: '/admin?loc=da-go',
    },
  ];

  /*
   * Mười bốn ngày, dựng từ MẢNG NGÀY chứ không từ dữ liệu.
   *
   * Gom theo `createdAt` rồi vẽ những khoá gom được thì ngày không có game nào sẽ
   * không có cột — và một chuỗi 14 ngày mất ba ngày ở giữa đọc như một chuỗi 11 ngày
   * liên tục, tức hình nói sai về nhịp đăng game. Ngày trống phải có mặt và bằng 0.
   */
  const khoaNgay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const demTheoNgay = new Map<string, number>();
  for (const g of gameGanDay) {
    const k = khoaNgay(g.createdAt);
    demTheoNgay.set(k, (demTheoNgay.get(k) ?? 0) + 1);
  }
  /*
   * Cột lỗi đếm SỐ LẦN (`count`), không đếm số nhóm.
   *
   * Một nhóm là một loại lỗi; số lần là số người thật đã gặp nó. Đếm nhóm thì một lỗi
   * nổ vào mặt hai trăm người trông y như một lỗi xảy ra đúng một lần — mà khoảng cách
   * giữa hai điều đó là toàn bộ lý do biểu đồ này tồn tại.
   */
  const demLoiTheoNgay = new Map<string, number>();
  for (const l of loiGanDay) {
    const k = khoaNgay(l.firstSeenAt);
    demLoiTheoNgay.set(k, (demLoiTheoNgay.get(k) ?? 0) + l.count);
  }

  const ngayCot = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(bayGio.getFullYear(), bayGio.getMonth(), bayGio.getDate() - (13 - i));
    return {
      nhan: `${d.getDate()}/${d.getMonth() + 1}`,
      nhanDay: d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }),
      so: demTheoNgay.get(khoaNgay(d)) ?? 0,
    };
  });

  const ngayCotLoi = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(bayGio.getFullYear(), bayGio.getMonth(), bayGio.getDate() - (13 - i));
    return {
      nhan: `${d.getDate()}/${d.getMonth() + 1}`,
      nhanDay: d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }),
      so: demLoiTheoNgay.get(khoaNgay(d)) ?? 0,
    };
  });

  /*
   * Vết kiểm duyệt gần nhất. Truy vấn RIÊNG, không nhét vào `Promise.all` ở trên:
   * nhóm kia là mười bốn phép đếm trả về số, còn cái này kéo cả hàng kèm quan hệ.
   * Gộp lại chỉ để có một khối trông gọn thì mất đúng chỗ dễ đọc nhất khi sau này
   * phải hỏi "truy vấn nào đang nặng".
   */
  const vet = await prisma.moderationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      actorId: true,
      action: true,
      note: true,
      createdAt: true,
      game: { select: { id: true, title: true } },
      child: { select: { displayName: true, username: true } },
    },
  });

  /*
   * `actorId` là chuỗi thường, KHÔNG phải khoá ngoại — nó chứa id phụ huynh, id
   * admin, hoặc đúng chữ "system". Nên phải tra ngược ra email bằng một truy vấn gộp
   * chứ không join được. Không tra thì màn hình chỉ hiện cuid vô nghĩa, mà cột này
   * tồn tại đúng để trả lời "ai đã làm".
   */
  const idNguoiLam = [...new Set(vet.map((v) => v.actorId))].filter((id) => id !== 'system');
  const emailTheoId = new Map(
    (
      await prisma.parent.findMany({
        where: { id: { in: idNguoiLam } },
        select: { id: true, email: true },
      })
    ).map((p) => [p.id, p.email])
  );
  const tenNguoiLam = (id: string) =>
    id === 'system' ? 'hệ thống' : (emailTheoId.get(id) ?? id);

  return (
    <>
      <PageTitle
        title="Tổng quan"
        lead={`Việc cần làm hôm nay, và vài con số nền. Cập nhật lúc ${bayGio.toLocaleTimeString('vi-VN')}.`}
      />

      {/*
        Một dòng cảnh báo ở TRÊN CÙNG, chỉ khi có thứ đã muộn hoặc sắp mất.
        Ô số đã tô đỏ rồi, nhưng đỏ trong một lưới mười hai ô là thứ mắt quen đi sau
        vài ngày; câu chữ đặt trên đầu trang thì không.
      */}
      {goQuaHan > 0 && (
        <Notice tone="error" role="alert">
          <strong>
            {goQuaHan} yêu cầu gỡ bản quyền đã quá hạn trả lời {TAKEDOWN_SLA_WORKING_DAYS} ngày
            làm việc.
          </strong>{' '}
          Đây là hạn đã hứa công khai trên <Link href="/dieu-khoan">trang điều khoản</Link> với
          người ngoài, không phải hạn nội bộ.
        </Notice>
      )}
      {sapXoa + quaHanXoa > 0 && (
        <Notice tone="warn" role="status">
          <strong>{sapXoa + quaHanXoa} game đã gỡ sắp bị xoá hẳn.</strong> Sau hạn đó thì hàng
          dữ liệu, bản đã đóng gói, ảnh bìa và file <code>.sb3</code> gốc của bé đều đi hẳn —
          nút &quot;Cho hiện lại&quot; không còn gì để hiện lại.
        </Notice>
      )}
      {/*
        NÓI RA KHI KHÔNG CÓ VIỆC GẤP, chứ không để bốn số 0 tự nói hộ.
        Bốn ô 0 và một trang chưa tải xong nhìn giống nhau, và "chắc nó chưa chạy" là
        kết luận rẻ hơn "hôm nay không có gì" — người trực sẽ đi kiểm lại bằng tay,
        tức bảng này không tiết kiệm cho họ việc gì cả. Một câu khẳng định thì đắt hơn
        hẳn để nghi ngờ.
      */}
      {khongCoViecGap && (
        <Notice tone="info" role="status">
          <span data-testid="tq-yen">
            <strong>Không có việc gấp.</strong> Không yêu cầu gỡ nào quá hạn, không game nào
            sắp bị xoá hẳn, không nhóm lỗi nào chưa xử lý.
          </span>
        </Notice>
      )}

      <Nhom
        title="Việc có hạn"
        phu="bỏ lỡ là muộn hạn đã hứa, hoặc mất vĩnh viễn"
      >
        <O
          testId="o-go-qua-han"
          so={goQuaHan}
          nhan="Yêu cầu gỡ quá hạn"
          phu={
            soGoDangMo === 0
              ? 'Hàng đợi bản quyền đang rỗng'
              : cuNhat
                ? `Cũ nhất nhận ngày ${ngayVi(cuNhat)}, hạn ${ngayVi(slaDueAt(cuNhat))}`
                : ''
          }
          href="/admin"
          muc="gap"
        />
        <O
          testId="o-go-dang-mo"
          so={soGoDangMo}
          nhan="Yêu cầu gỡ đang mở"
          phu={`Hạn trả lời ${TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc mỗi yêu cầu`}
          href="/admin"
        />
        <O
          testId="o-sap-xoa"
          so={sapXoa + quaHanXoa}
          nhan="Sắp xoá hẳn"
          phu={
            quaHanXoa > 0
              ? `${quaHanXoa} game đã quá hạn, sẽ xoá ở lượt dọn kế tiếp`
              : `Còn ${SAP_XOA_NGAY} ngày hoặc ít hơn để cho hiện lại`
          }
          href="/admin?loc=da-go"
          muc="gap"
        />
        <O
          testId="o-loi-chua-xu-ly"
          so={nhomLoiChuaXuLy}
          nhan="Nhóm lỗi chưa xử lý"
          phu={`Trần ${MAX_UNRESOLVED_GROUPS} nhóm · ${loiMoi24h} nhóm có lỗi mới trong 24 giờ`}
          href="/admin/loi"
        />
      </Nhom>

      {/*
        HAI BIỂU ĐỒ, và chúng trả lời câu khác hẳn lưới ô số bên trên.
        Ô số trả lời "còn bao nhiêu việc"; hai hình này trả lời "hệ thống đang ở hình
        dạng nào" — phần lớn game nằm ở trạng thái nào, và nhịp đăng game mấy tuần qua
        có gì lạ không. Cả hai là câu hỏi về TỈ LỆ và về NHỊP, hai thứ mà một con số
        đơn lẻ không trả lời được, nên chúng là hình chứ không phải thêm hai ô nữa.

        Đặt ngay SAU nhóm "Việc có hạn" và TRƯỚC hai nhóm ô số còn lại. Ranh giới đó
        không phải tuỳ ý: nhóm đầu là bốn ô có đồng hồ chạy — bỏ lỡ là muộn hạn đã hứa
        hoặc mất vĩnh viễn — nên nó phải nằm trên màn hình đầu tiên, trước cả một hình
        đẹp. Hai nhóm sau ("Nội dung chờ người xem", "Số nền") thì không có hạn nào, và
        chúng đọc dễ hơn khi đã biết hệ thống đang ở hình dạng nào.
      */}
      {/*
        HAI cột, và thẻ thứ ba chiếm CẢ hàng dưới. Đã thử hai cách kia và đo cả hai:

        · ba cột (443px mỗi thẻ) — vành donut không còn chỗ nằm cạnh chú giải nên nó
          xuống dòng, thẻ cao 553px, và grid kéo hai thẻ bên cạnh cao theo, để lại hai
          khoảng trắng lớn;
        · hai cột mà thẻ thứ ba không span — nó nằm một mình bên trái và bỏ trống hẳn
          một ô bên phải, đọc như thiếu mất một hình.

        Cách này thì hàng trên có vành nằm cạnh chú giải (thẻ ~320px), hàng dưới là
        biểu đồ lỗi rộng cả trang với hình canh giữa. Không thẻ nào trống rỗng.
      */}
      <section className="mb-9 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={`p-5 ${MAT_THE}`} data-testid="tq-donut">
          <h2 className="mb-1 text-lg font-extrabold tracking-tight">Game đang ở đâu</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Bốn trạng thái, cộng lại bằng tổng số game. Bấm một dòng để mở hàng đợi đã lọc.
          </p>
          {tongGame === 0 ? (
            <p className="text-ink-soft">Chưa có game nào.</p>
          ) : (
            <DonutTrangThai muc={mucDonut} tong={tongGame} nhanTong="game" />
          )}
        </div>

        <div className={`p-5 ${MAT_THE}`} data-testid="tq-cot">
          <h2 className="mb-1 text-lg font-extrabold tracking-tight">Game mới mỗi ngày</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Mười bốn ngày gần nhất, kể cả ngày không có game nào.
          </p>
          <CotTheoNgay ngay={ngayCot} nhanBang="Số game đăng mỗi ngày, 14 ngày gần nhất" />
        </div>

        {/*
          Thẻ thứ ba: LỖI. Dùng lại đúng component cột của thẻ bên trên chứ không vẽ
          hình thứ ba — hai chuỗi đếm theo ngày thì cùng một hình, và người trực học
          cách đọc nó một lần.

          CỐ Ý KHÔNG gộp hai chuỗi vào một biểu đồ. Chúng cùng đơn vị ("mỗi ngày bao
          nhiêu cái") nhưng khác bậc độ lớn hoàn toàn — vài game một ngày so với có thể
          hàng trăm lượt lỗi — nên chung một trục thì chuỗi nhỏ dán bẹt xuống đáy, còn
          hai trục là thứ không bao giờ được làm: tỉ lệ giữa hai thang là tuỳ ý, nên
          biểu đồ tự bịa ra một mối tương quan không có trong dữ liệu.
        */}
        <div className={`p-5 xl:col-span-2 ${MAT_THE}`} data-testid="tq-cot-loi">
          <h2 className="mb-1 text-lg font-extrabold tracking-tight">Lỗi mỗi ngày</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Số LẦN người dùng gặp lỗi, tính theo ngày lỗi xuất hiện lần đầu.{' '}
            <Link href="/admin/loi">Mở tab Lỗi</Link>
            {baoLoiChuaXuLy > 0 && (
              <>
                {' — '}
                <strong className="text-danger">
                  {baoLoiChuaXuLy} báo lỗi của người dùng đang chờ
                </strong>
              </>
            )}
          </p>
          {/* Mười bốn ngày không lỗi thì nói THẲNG đó là tin tốt, không vẽ một khung
              trắng cao ba trăm pixel: một biểu đồ rỗng và một biểu đồ chưa tải xong
              trông giống nhau. Cùng luật đã dùng cho donut khi chưa có game nào. */}
          {ngayCotLoi.every((d) => d.so === 0) ? (
            <p className="text-ink-soft">Không có lỗi nào trong 14 ngày qua. Đây là tin tốt.</p>
          ) : (
            <CotTheoNgay ngay={ngayCotLoi} nhanBang="Số lần gặp lỗi mỗi ngày, 14 ngày gần nhất" />
          )}
        </div>
      </section>

      <Nhom title="Nội dung chờ người xem" phu="chưa có hạn, nhưng có trẻ con ở đầu bên kia">
        <O
          testId="o-can-xem"
          so={canXem}
          nhan="Game cần xem"
          phu="Có báo cáo, hoặc đang không ở trạng thái hiện bình thường"
          href="/admin?loc=can-xem"
        />
        <O
          testId="o-tu-siet"
          so={heThongTuSiet}
          nhan="Bị hệ thống tự siết"
          phu="Ẩn mềm hoặc ẩn hẳn theo ngưỡng báo cáo, chưa người nào xem nội dung"
          href="/admin?loc=an-mem"
        />
        <O
          testId="o-bao-cao-24h"
          so={baoCaoMoi24h}
          nhan="Báo cáo mới 24 giờ"
          phu="Gồm cả báo cáo của khách, loại không tính vào ngưỡng tự ẩn"
          href="/admin?loc=can-xem"
        />
        <O
          testId="o-be-khoa"
          so={beDangKhoa}
          nhan="Tài khoản bé đang khoá"
          phu="Bé bị khoá thì không đăng nhập được nữa, kể cả bằng phiên cũ"
          href="/admin?loc=tat-ca"
        />
      </Nhom>

      <Nhom title="Số nền" phu="để đọc mấy con số trên kia theo tỉ lệ nào">
        <O
          testId="o-game-hien"
          so={gameDangHien}
          nhan="Game đang hiện"
          phu={`${gameMoi7ngay} game mới trong 7 ngày`}
          href="/admin?loc=dang-hien"
          muc="nen"
        />
        <O
          testId="o-be-moi"
          so={beMoi7ngay}
          nhan="Bé mới trong 7 ngày"
          phu="Tài khoản do phụ huynh tạo hộ"
          href="/admin?loc=tat-ca"
          muc="nen"
        />
        <O
          testId="o-chua-xac-minh"
          so={phuHuynhChuaXacMinh}
          nhan="Phụ huynh chưa xác minh"
          phu="Chưa xác minh thì không tạo được tài khoản cho con, và báo cáo không tính ngưỡng"
          href="/admin?loc=tat-ca"
          muc="nen"
        />
        <O
          testId="o-chua-bam-dong-ho"
          so={chuaBamDongHo}
          nhan="Đã gỡ, chưa bấm đồng hồ"
          phu="Gỡ từ trước khi có cột hạn — lượt dọn kế tiếp sẽ bấm giờ, không xoá"
          href="/admin?loc=da-go"
          muc="nen"
        />
      </Nhom>

      {/*
        VIỆC ĐÃ LÀM, không phải việc phải làm — và đó là lý do nó đứng riêng ở cuối.
        Lưới ô số bên trên trả lời "còn gì chưa xong"; khối này trả lời hai câu khác
        mà số đếm không bao giờ trả lời được: "ai vừa động vào cái gì" và "hệ thống có
        đang tự ẩn game hàng loạt không". Vết của `system` nằm chung một danh sách với
        vết của người, cố ý: một tràng AUTO_HIDE liên tiếp là dấu hiệu có người đang
        dùng nút báo cáo để đánh hội đồng, và nó chỉ lộ ra khi xếp cạnh nhau theo thời
        gian.
      */}
      <section className="mb-9">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
          <h2 className="text-lg font-extrabold tracking-tight">Hoạt động gần đây</h2>
          <p className="text-sm text-ink-soft">tám thao tác mới nhất, của người và của hệ thống</p>
        </div>
        {vet.length === 0 ? (
          <p className="text-ink-soft">Chưa có thao tác kiểm duyệt nào được ghi.</p>
        ) : (
          <ul className={`list-none space-y-0 p-0 ${MAT_THE}`} data-testid="tq-hoat-dong">
            {vet.map((v, i) => {
              /* Việc của HỆ THỐNG đánh dấu khác việc của người. Cả hai phải nằm chung
                 một danh sách theo thời gian (một tràng AUTO_HIDE liên tiếp là dấu
                 hiệu có người đang dùng nút báo cáo để đánh hội đồng, và nó chỉ lộ ra
                 khi xếp cạnh nhau), nhưng "ai làm" là câu hỏi đầu tiên người trực hỏi
                 về mỗi dòng — nên nó phải trả lời được mà không cần đọc hết dòng. */
              const laHeThong = v.actorId === 'system';
              return (
                <li
                  key={v.id}
                  className={`flex flex-wrap items-baseline gap-x-2 px-5 py-3 text-sm ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  {/* Cột thời gian đứng TRƯỚC và rộng cố định: mắt đi dọc một cột thẳng
                      để tìm "cái nào vừa xảy ra", chứ không nhặt dấu thời gian ở cuối
                      mỗi dòng dài ngắn khác nhau. */}
                  <time
                    dateTime={v.createdAt.toISOString()}
                    title={v.createdAt.toLocaleString('vi-VN')}
                    className="w-24 shrink-0 tabular-nums text-ink-soft"
                  >
                    {khiNao(v.createdAt, bayGio)}
                  </time>
                  {/* Cả hai nhãn dùng chung nền `bg` — cặp màu đã có phép đo trong
                      `contrast-check` cho cả `ink-soft` lẫn `accent-text`. Phân biệt
                      bằng MÀU CHỮ chứ không bằng nền thứ hai: một nền mới là một cặp
                      mới phải đo, cho một khác biệt mà màu chữ đã nói xong. */}
                  <span
                    className={`shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-xs font-bold ${
                      laHeThong ? 'text-ink-soft' : 'text-accent-text'
                    }`}
                  >
                    {laHeThong ? 'hệ thống' : tenNguoiLam(v.actorId)}
                  </span>
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{actionLabel(v.action)}</span>
                    {v.game && (
                      <>
                        {' · '}
                        {/* Link sang trang game trên APP origin: cửa quản trị chỉ cho
                            quyền GHI, quyền ĐỌC một game đã ẩn nằm ở cửa site. */}
                        <a href={`${appOrigin()}/game/${v.game.id}`}>{v.game.title}</a>
                      </>
                    )}
                    {v.child && (
                      <>
                        {' · bé '}
                        {v.child.displayName} ({v.child.username})
                      </>
                    )}
                    {v.note && <span className="text-ink-soft"> · {v.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm text-ink-soft">
        Hạn giữ game đã gỡ hiện là <strong>{NGAY_GIU_GAME_DA_GO} ngày</strong>, tính từ lúc gỡ.
        Một game gỡ hôm nay sẽ bị xoá hẳn khoảng ngày {ngayVi(hanXoaHan(bayGio))}.
      </p>
    </>
  );
}
