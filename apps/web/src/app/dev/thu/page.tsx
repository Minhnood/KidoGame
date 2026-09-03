import { notFound } from 'next/navigation';
import { docHopThuDev } from '@/lib/mail';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import { XoaHopThuButton } from './mail-controls';

export const dynamic = 'force-dynamic';

/**
 * Hộp thư của môi trường phát triển.
 *
 * VÌ SAO CÓ TRANG NÀY. Ở dev, `sendMail` không gửi đi đâu cả — nó in nguyên lá thư
 * kèm link xác minh ra stdout. Đủ cho bộ kiểm tự động (chúng đọc log), nhưng kém cho
 * một CON NGƯỜI đang thử hoặc đang quay video: link nằm lẫn giữa hàng nghìn dòng log
 * của Next, và muốn bấm được thì phải mở terminal, tìm, bôi đen, copy, dán.
 *
 * Trang này bày đúng những lá thư đó ra, và tách sẵn mọi link thành nút bấm được —
 * nên luồng "phụ huynh mở hòm thư rồi bấm link" diễn được đúng như thật.
 *
 * HAI LỚP CHẶN Ở PRODUCTION, và cả hai đều cần:
 *
 *  1. `notFound()` ngay dưới đây. Không phải 403: 403 là xác nhận trang có tồn tại.
 *  2. Hộp thư chỉ được nạp bởi transport `console`, mà transport đó không bao giờ
 *     chạy khi `NODE_ENV=production` — `sendMail` ném lỗi thay vì in ra.
 *
 * Lớp 2 một mình đã đủ để trang này luôn rỗng ở production. Vẫn giữ lớp 1, vì "luôn
 * rỗng" phụ thuộc vào một điều kiện ở file khác, và thứ nằm sau nó là token xác minh
 * email cùng token đặt lại mật khẩu.
 *
 * KHÔNG đòi đăng nhập, cố ý: đường đi cần demo nhất là phụ huynh vừa đăng ký xong và
 * chưa xác minh gì cả. Đánh đổi được vì trang chỉ tồn tại ở dev.
 */
export default async function DevMailboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const thu = docHopThuDev();

  return (
    <>
      {/*
        CỘT HẸP CANH GIỮA, không dùng hết bề ngang 1024px.
        Thư là văn bản để đọc: một dòng chữ dài 1000px thì mắt mất chỗ khi nhảy về đầu
        dòng sau. 44rem ≈ 700px giữ mỗi dòng quanh 75–90 ký tự, và cột hẹp thì phần
        trống hai bên biến cái danh sách thành một chồng thư đặt giữa bàn.
      */}
      <div className="mx-auto w-full max-w-176">
        <PageTitle
          canhGiua
          title="Hộp thư trên máy này"
          lead="Những lá thư mà hệ thống đã gửi khi chạy ở máy dev. Không có lá nào đi ra Internet."
        />

        <Notice tone="info">
          Ở máy dev, <code className="font-bold">sendMail</code> in thư ra log thay vì gửi đi, nên
          không cần tài khoản nhà cung cấp mail nào để thử hết luồng xác minh email và quên mật
          khẩu. Trang này chỉ bày lại đúng những lá thư đó. Nó <strong>không tồn tại</strong> khi
          chạy production — ở đó thư đi qua Resend và tới hòm thư thật.
        </Notice>

        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-base text-ink-soft" data-testid="dev-mail-total">
            {thu.length} thư · giữ tối đa 50 · mất khi khởi động lại server
          </p>
          {thu.length > 0 && <XoaHopThuButton count={thu.length} />}
        </div>

        {thu.length === 0 ? (
          <EmptyState>
            Chưa có thư nào. Thử đăng ký một phụ huynh ở <a href="/dang-ky">/dang-ky</a>, hoặc bấm
            &quot;Quên mật khẩu&quot; ở <a href="/dang-nhap">/dang-nhap</a>, rồi quay lại đây.
          </EmptyState>
        ) : (
          <ul className="mb-12 mt-5 list-none space-y-6 p-0" data-testid="dev-mail-list">
            {thu.map((t, i) => (
              <li
                key={`${t.luc.toISOString()}-${i}`}
                className={`px-6 py-7 ${MAT_THE}`}
                data-testid="dev-mail"
              >
                {/*
                  ĐẦU THƯ canh giữa, THÂN THƯ canh trái — không phải nửa vời mà là hai
                  loại chữ khác nhau. Tiêu đề và người nhận là nhãn của phong bì, mắt
                  chỉ quét một lần nên canh giữa đọc ra là "đây là lá thư nào". Thân thư
                  là văn bản nhiều dòng: canh giữa nó thì mỗi dòng bắt đầu ở một chỗ
                  khác nhau, và mắt phải đi tìm đầu dòng sau mỗi lần xuống dòng.
                */}
                <div className="border-b border-border pb-5 text-center">
                  <PhongBi />
                  <p className="mt-2 text-2xl font-extrabold tracking-tight" data-testid="dev-mail-subject">
                    {t.subject}
                  </p>
                  <p className="mt-1.5 text-base text-ink-soft">
                    tới <span data-testid="dev-mail-to">{t.to}</span>
                  </p>
                  <p className="text-sm text-ink-soft">
                    <time dateTime={t.luc.toISOString()}>{t.luc.toLocaleString('vi-VN')}</time>
                  </p>
                </div>

                {/*
                  `whitespace-pre-wrap`: thư là chữ thuần, xuống dòng LÀ một phần của nội
                  dung. Để React gộp dòng thì địa chỉ và link dồn vào một khối chữ liền,
                  đúng chỗ cần đọc rõ nhất.

                  `wrap-break-word` là BẮT BUỘC đi kèm, không phải cho đẹp. Link xác minh là
                  một chuỗi dài không có khoảng trắng nào, mà `pre-wrap` chỉ ngắt dòng ở
                  chỗ có sẵn — nên trên màn 414px cái link chạy quá mép thẻ và phần đuôi
                  bị cắt mất. Trang KHÔNG tràn ngang (đã đo scrollWidth), tức không có gì
                  báo ra: chỉ là token hiển thị thiếu, và người đọc không biết là thiếu.
                */}
                <p
                  className="mt-5 whitespace-pre-wrap wrap-break-word text-lg/8"
                  data-testid="dev-mail-text"
                >
                  {t.text}
                </p>

                <MailLinks text={t.text} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Phong bì nhỏ trên đầu mỗi lá thư.
 *
 * Một khối màu đặc nhận ra trước khi đọc, nên nó nói "đây là một lá thư" nhanh hơn
 * bất cứ dòng chữ nào — cùng lý lẽ đã dùng cho đầu mèo trên thanh điều hướng.
 *
 * Nắp phong bì vẽ bằng hai nét chéo gặp nhau ở giữa, KHÔNG phải một chữ V: đường gấp
 * của nắp thật chạy tới đúng hai góc trên, và cắt ngắn lại thì ở cỡ nhỏ nó đọc ra là
 * một mũi nhọn nằm trong hộp chứ không ra cái nắp.
 */
function PhongBi() {
  return (
    <svg
      viewBox="0 0 40 28"
      aria-hidden="true"
      focusable="false"
      className="mx-auto h-7 w-10 text-accent"
      fill="none"
    >
      <rect x="1.5" y="1.5" width="37" height="25" rx="3.5" fill="currentColor" opacity="0.14" />
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="25"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M2.5 3.5 20 16.5 37.5 3.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tách mọi link trong thư ra thành nút bấm được.
 *
 * Đây là cả lý do trang này tồn tại: link xác minh dài và mang token, đọc bằng mắt
 * rồi gõ lại là không thể, và bôi đen trong terminal thì hay dính thêm ký tự.
 *
 * Cắt dấu câu cuối chuỗi: thư của dự án này hay viết link ở cuối câu, nên `)`, `.`,
 * `,` dính vào đuôi URL và biến link thành 404 — mà 404 ở đây trông y như token hết
 * hạn, tức đúng loại triệu chứng dẫn người ta đi tìm sai chỗ.
 */
function MailLinks({ text }: { text: string }) {
  const links = [...new Set(text.match(/https?:\/\/[^\s]+/g) ?? [])].map((u) =>
    u.replace(/[).,;:]+$/, '')
  );
  if (links.length === 0) return null;

  return (
    <ul className="mt-6 list-none space-y-5 p-0" data-testid="dev-mail-links">
      {links.map((href) => (
        <li key={href} className="text-center">
          {/*
            Nút to và canh giữa: trên trang này nó LÀ hành động duy nhất, và cả lý do
            trang tồn tại. `min-h-14` chứ không `min-h-touch` (44px) — đây là nút bấm
            trước ống kính, không phải một nút trong biểu mẫu.
          */}
          <a
            href={href}
            data-testid="dev-mail-link"
            className="inline-flex min-h-14 items-center rounded-full border-0 bg-accent px-8 text-lg font-bold text-chrome no-underline"
          >
            Mở link trong thư →
          </a>
          {/*
            URL đầy đủ vẫn hiện dưới nút, cỡ nhỏ hơn. Nó lặp lại thứ đã có trong thân
            thư, nhưng đây là chỗ copy được mà không phải lần trong đoạn văn — hữu ích
            khi cần dán link sang cửa sổ ẩn danh hay sang máy khác.
          */}
          <code className="mt-2 block break-all text-sm text-ink-soft">{href}</code>
        </li>
      ))}
    </ul>
  );
}
