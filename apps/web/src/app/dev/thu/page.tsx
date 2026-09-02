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
      <PageTitle
        title="Hộp thư môi trường phát triển"
        lead="Những lá thư mà hệ thống đã gửi trên máy này. Không có lá nào đi ra Internet."
      />

      <Notice tone="info">
        Ở máy dev, <code className="font-bold">sendMail</code> in thư ra log thay vì gửi đi, nên
        không cần tài khoản nhà cung cấp mail nào để thử hết luồng xác minh email và quên mật
        khẩu. Trang này chỉ bày lại đúng những lá thư đó. Nó <strong>không tồn tại</strong> khi
        chạy production — ở đó thư đi qua Resend và tới hòm thư thật.
      </Notice>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-soft" data-testid="dev-mail-total">
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
        <ul className="mb-12 mt-4 list-none space-y-4 p-0" data-testid="dev-mail-list">
          {thu.map((t, i) => (
            <li key={`${t.luc.toISOString()}-${i}`} className={`p-5 ${MAT_THE}`} data-testid="dev-mail">
              <p className="text-lg font-bold" data-testid="dev-mail-subject">
                {t.subject}
              </p>
              <p className="text-sm text-ink-soft">
                tới <span data-testid="dev-mail-to">{t.to}</span> ·{' '}
                <time dateTime={t.luc.toISOString()}>{t.luc.toLocaleString('vi-VN')}</time>
              </p>

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
                className="mt-3 whitespace-pre-wrap wrap-break-word text-[0.95rem]"
                data-testid="dev-mail-text"
              >
                {t.text}
              </p>

              <MailLinks text={t.text} />
            </li>
          ))}
        </ul>
      )}
    </>
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
    <ul className="mt-3 list-none space-y-2 p-0" data-testid="dev-mail-links">
      {links.map((href) => (
        <li key={href}>
          <a
            href={href}
            data-testid="dev-mail-link"
            className="min-h-touch inline-flex items-center rounded-full border-0 bg-accent px-5 font-bold text-chrome no-underline"
          >
            Mở link trong thư →
          </a>{' '}
          <code className="break-all text-sm text-ink-soft">{href}</code>
        </li>
      ))}
    </ul>
  );
}
