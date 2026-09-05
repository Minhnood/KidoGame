import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { appOrigin } from '@/lib/mail';
import { getAdmin } from '@/lib/session';
import { actionLabel, hanXoaHan, NGAY_GIU_GAME_DA_GO, ngayVi } from '@/lib/moderation';
import { slaDueAt, TAKEDOWN_SLA_WORKING_DAYS } from '@/lib/operator';
import { MAX_UNRESOLVED_GROUPS } from '@/lib/error-log';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';

export const dynamic = 'force-dynamic';

/** Số ngày trước hạn xoá hẳn thì coi là "cửa sổ cứu sắp đóng". */
const SAP_XOA_NGAY = 2;

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
  gap = false,
  testId,
}: {
  so: number;
  nhan: string;
  phu: string;
  href: string;
  gap?: boolean;
  testId: string;
}) {
  const coViec = so > 0;
  return (
    <Link
      href={href}
      data-testid={testId}
      data-so={so}
      className={[
        'block p-5 no-underline',
        MAT_THE,
        'hover:border-accent',
        gap && coViec ? 'border-danger-border' : '',
      ].join(' ')}
    >
      <p
        className={[
          'text-4xl font-extrabold tabular-nums',
          gap && coViec ? 'text-danger' : coViec ? 'text-ink' : 'text-ink-soft',
        ].join(' ')}
      >
        {so}
      </p>
      <p className="mt-1 font-bold text-ink">{nhan}</p>
      <p className="mt-0.5 text-sm text-ink-soft">{phu}</p>
    </Link>
  );
}

function Nhom({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 text-xl font-extrabold tracking-tight">{title}</h2>
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

  /*
   * Mốc so cho hạn xoá hẳn, tính NGƯỢC từ `removedAt` chứ không xuôi từ hôm nay:
   * game quá hạn là game có `removedAt` cũ hơn N ngày. Cùng phép so mà
   * `prisma/prune-removed.ts` dùng, nên hai chỗ không thể lệch nhau.
   */
  const mocQuaHan = new Date(bayGio.getTime() - NGAY_GIU_GAME_DA_GO * 86400_000);
  const mocSapXoa = new Date(
    bayGio.getTime() - (NGAY_GIU_GAME_DA_GO - SAP_XOA_NGAY) * 86400_000
  );

  const [
    goDangMo,
    canXem,
    heThongTuSiet,
    sapXoa,
    quaHanXoa,
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
    /* Lấy cả `createdAt` chứ không chỉ đếm: hạn SLA tính theo ngày làm việc nên phải
       tính từng dòng, không có phép so nào trong SQL làm được việc đó. Hàng đợi này
       cố ý không phân trang và luôn nhỏ — nếu nó lớn thì bản thân điều đó đã là sự cố. */
    prisma.takedownRequest.findMany({
      where: { status: 'OPEN' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.game.count({
      where: { OR: [{ reportCount: { gt: 0 } }, { status: { not: 'PUBLISHED' } }] },
    }),
    prisma.game.count({ where: { status: { in: ['LIMITED', 'HIDDEN'] } } }),
    prisma.game.count({
      where: { status: 'REMOVED', removedAt: { not: null, lte: mocSapXoa, gt: mocQuaHan } },
    }),
    prisma.game.count({ where: { status: 'REMOVED', removedAt: { lte: mocQuaHan } } }),
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

  const goQuaHan = goDangMo.filter((r) => slaDueAt(r.createdAt) < bayGio).length;
  const cuNhat = goDangMo[0]?.createdAt ?? null;

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

      <Nhom title="Việc có hạn">
        <O
          testId="o-go-qua-han"
          so={goQuaHan}
          nhan="Yêu cầu gỡ quá hạn"
          phu={
            goDangMo.length === 0
              ? 'Hàng đợi bản quyền đang rỗng'
              : cuNhat
                ? `Cũ nhất nhận ngày ${ngayVi(cuNhat)}, hạn ${ngayVi(slaDueAt(cuNhat))}`
                : ''
          }
          href="/admin"
          gap
        />
        <O
          testId="o-go-dang-mo"
          so={goDangMo.length}
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
          gap
        />
        <O
          testId="o-loi-chua-xu-ly"
          so={nhomLoiChuaXuLy}
          nhan="Nhóm lỗi chưa xử lý"
          phu={`Trần ${MAX_UNRESOLVED_GROUPS} nhóm · ${loiMoi24h} nhóm có lỗi mới trong 24 giờ`}
          href="/admin/loi"
        />
      </Nhom>

      <Nhom title="Nội dung chờ người xem">
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

      <Nhom title="Số nền">
        <O
          testId="o-game-hien"
          so={gameDangHien}
          nhan="Game đang hiện"
          phu={`${gameMoi7ngay} game mới trong 7 ngày`}
          href="/admin?loc=dang-hien"
        />
        <O
          testId="o-be-moi"
          so={beMoi7ngay}
          nhan="Bé mới trong 7 ngày"
          phu="Tài khoản do phụ huynh tạo hộ"
          href="/admin?loc=tat-ca"
        />
        <O
          testId="o-chua-xac-minh"
          so={phuHuynhChuaXacMinh}
          nhan="Phụ huynh chưa xác minh"
          phu="Chưa xác minh thì không tạo được tài khoản cho con, và báo cáo không tính ngưỡng"
          href="/admin?loc=tat-ca"
        />
        <O
          testId="o-chua-bam-dong-ho"
          so={chuaBamDongHo}
          nhan="Đã gỡ, chưa bấm đồng hồ"
          phu="Gỡ từ trước khi có cột hạn — lượt dọn kế tiếp sẽ bấm giờ, không xoá"
          href="/admin?loc=da-go"
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
        <h2 className="mb-3 text-xl font-extrabold tracking-tight">Hoạt động gần đây</h2>
        {vet.length === 0 ? (
          <p className="text-ink-soft">Chưa có thao tác kiểm duyệt nào được ghi.</p>
        ) : (
          <ul className={`list-none space-y-0 p-0 ${MAT_THE}`} data-testid="tq-hoat-dong">
            {vet.map((v, i) => (
              <li
                key={v.id}
                className={`px-5 py-3 text-sm ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <span className="font-semibold text-ink">{actionLabel(v.action)}</span>
                {v.game && (
                  <>
                    {' · '}
                    {/* Link sang trang game trên APP origin: cửa quản trị chỉ cho quyền
                        GHI, quyền ĐỌC một game đã ẩn nằm ở cửa site. */}
                    <a href={`${appOrigin()}/game/${v.game.id}`}>{v.game.title}</a>
                  </>
                )}
                {v.child && (
                  <>
                    {' · bé '}
                    {v.child.displayName} ({v.child.username})
                  </>
                )}
                <span className="text-ink-soft">
                  {' · '}
                  {tenNguoiLam(v.actorId)}
                  {' · '}
                  <time dateTime={v.createdAt.toISOString()}>
                    {v.createdAt.toLocaleString('vi-VN')}
                  </time>
                  {v.note && ` · ${v.note}`}
                </span>
              </li>
            ))}
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
