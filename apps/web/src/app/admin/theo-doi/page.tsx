import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/session';
import { docLienKetGiamSat, type TrangThai } from '@/lib/giam-sat-lien-ket';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { ButtonAnchor } from '@/components/button';

export const dynamic = 'force-dynamic';

/**
 * Ba bảng điều khiển theo dõi, gom về một chỗ — lý do không nhúng iframe nằm ở
 * `lib/giam-sat-lien-ket.ts`.
 *
 * Mỗi thẻ nói ba điều, theo đúng thứ tự người trực cần: công cụ này trả lời CÂU HỎI gì
 * (để biết khi nào cần mở), nó còn SỐNG không (để không bấm vào một trang chết), rồi
 * mới tới đường dẫn. Đặt đường dẫn lên đầu thì trang này chỉ là một cái bookmark.
 */

/*
 * Màu lấy từ cặp ĐÃ CÓ trong `contrast-check`, không đặt token mới: `ink` trên `the-2`
 * (nền xanh nhạt của thẻ game) đã được đo 7:1, `danger`/`warn` cũng vậy. Thêm một cặp
 * màu mới nghĩa là thêm một cặp chưa ai đo, và nó sẽ nằm đúng trên cái nhãn mà người
 * trực liếc nhanh nhất.
 */
const NHAN: Record<TrangThai, { chu: string; lop: string }> = {
  song: { chu: 'Đang chạy', lop: 'bg-the-2 text-ink border-border' },
  chet: { chu: 'Không trả lời', lop: 'bg-danger-bg text-danger border-danger-border' },
  'chua-cau-hinh': { chu: 'Chưa bật', lop: 'bg-surface text-ink-soft border-border' },
  /* Mixpanel: bật rồi nhưng không tự dò được — nói đúng như vậy, đừng vẽ chấm xanh cho
     một thứ mình không đo. Chấm xanh sai còn tệ hơn không có chấm nào. */
  'khong-do-duoc': { chu: 'Đang bật · không tự đo được', lop: 'bg-warn-bg text-warn-ink border-warn-border' },
};

export default async function AdminTheoDoiPage() {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/dang-nhap');

  const lienKet = await docLienKetGiamSat();
  const coCaiChet = lienKet.some((l) => l.trangThai === 'chet');

  return (
    <>
      <PageTitle
        title="Theo dõi"
        lead="Ba bảng điều khiển đo ba thứ khác nhau. Mỗi cái đăng nhập riêng, mở ra tab mới."
      />

      {coCaiChet && (
        <Notice tone="error" role="alert">
          Có công cụ không trả lời. Xem log container trên VPS trước khi kết luận là mạng.
        </Notice>
      )}

      <div className="mb-10 grid gap-4 sm:grid-cols-2" data-testid="giam-sat-the">
        {lienKet.map((l) => {
          const nhan = NHAN[l.trangThai];
          return (
            <div key={l.id} className={`p-5 ${MAT_THE}`} data-testid={`giam-sat-${l.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold">{l.ten}</h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${nhan.lop}`}
                  data-testid={`giam-sat-${l.id}-trang-thai`}
                >
                  {nhan.chu}
                </span>
              </div>

              <p className="mt-2 text-ink-soft">{l.cauHoi}</p>
              <p className="mt-1 text-sm text-ink-faint">{l.noiDat}</p>

              {l.url ? (
                <ButtonAnchor
                  href={l.url}
                  target="_blank"
                  /* `noreferrer` đi kèm `noopener`: trang mở ra không được cầm tham chiếu
                     ngược về tab quản trị, và cũng không cần biết nó tới từ đâu. */
                  rel="noopener noreferrer"
                  variant="ghost"
                  className="mt-4"
                >
                  Mở {l.ten}
                </ButtonAnchor>
              ) : (
                <p className="mt-4 text-sm text-ink-faint">
                  Chưa đặt biến môi trường cho công cụ này, nên chưa có gì để mở.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
