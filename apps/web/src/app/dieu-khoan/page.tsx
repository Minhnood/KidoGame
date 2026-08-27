import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { REPORT_AUTO_HIDE_THRESHOLD, REPORT_HARD_HIDE_THRESHOLD } from '@/lib/moderation';
import { UPLOADS_PER_CHILD_PER_DAY } from '@/lib/ingest';
import { isOperatorConfigured, operator, TAKEDOWN_SLA_WORKING_DAYS } from '@/lib/operator';

/*
 * PHẢI là force-dynamic.
 *
 * Trang này in ra tên và email của đơn vị vận hành, mà hai thứ đó đến từ biến môi
 * trường lúc CHẠY. Image Docker build một lần rồi chạy ở nhiều nơi; để Next render
 * sẵn lúc build là đóng băng giá trị mặc định của máy build vào trang, và trang
 * điều khoản sẽ ghi "chưa cấu hình" vĩnh viễn dù .env đã điền đúng.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Điều khoản sử dụng — KidoGame',
  description: 'Quy tắc dùng KidoGame, cách xử lý nội dung và yêu cầu gỡ bản quyền.',
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-6" data-testid={`terms-${id}`}>
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

/** Link trong thân bài gạch chân hẳn hoi — đây là trang toàn chữ, link phải nhìn ra được. */
function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold underline">
      {children}
    </Link>
  );
}

export default function TermsPage() {
  const op = operator();

  return (
    <article className="mb-16 max-w-180">
      <PageTitle
        title="Điều khoản sử dụng"
        lead="Viết để phụ huynh đọc hết trong năm phút. Có chỗ nào chưa rõ thì email cho chúng tôi."
      />

      {!isOperatorConfigured() && (
        <Notice tone="warn">
          Bản cài đặt này chưa khai <code>OPERATOR_NAME</code> và <code>OPERATOR_EMAIL</code> trong{' '}
          <code>infra/.env</code>, nên phần liên hệ bên dưới chưa dùng được.
        </Notice>
      )}

      <Section id="la-gi" title="KidoGame là gì">
        <p>
          KidoGame là nơi các bé đăng game Scratch tự làm để bạn bè chơi được ngay trên trình
          duyệt. Chúng tôi nhận file <code>.sb3</code> bé xuất ra từ Scratch, kiểm tra, rồi đóng
          gói thành một trang chơi được.
        </p>
        <p>
          Không có bình luận, không có nhắn tin, không có kết bạn. Đây là lựa chọn có chủ đích:
          trò chuyện tự do giữa người lạ và trẻ em là nguồn rủi ro lớn nhất trên một nền tảng như
          thế này, và nó không cần thiết cho việc chia sẻ game.
        </p>
      </Section>

      <Section id="tai-khoan" title="Tài khoản">
        <p>
          Chỉ phụ huynh mới đăng ký được, và bằng email. Sau đó phụ huynh tự tạo tài khoản cho
          con. Trẻ <strong>không</strong> tự đăng ký, <strong>không</strong> có email,{' '}
          <strong>không</strong> khai tên thật — tài khoản của bé chỉ gồm tên đăng nhập, tên hiển
          thị và (nếu muốn) năm sinh.
        </p>
        <p>
          Chính việc bạn tự tay tạo tài khoản cho con là sự đồng ý của người đại diện theo pháp
          luật đối với việc con bạn dùng dịch vụ này. Vì vậy chúng tôi không hỏi lại bạn thêm một
          lần nữa qua một biểu mẫu riêng.
        </p>
        <p>
          Bạn khoá tài khoản của con, đặt lại mật khẩu cho con, và ẩn game của con bất cứ lúc nào
          ở <A href="/phu-huynh">trang của bố mẹ</A>. Khoá tài khoản có hiệu lực ngay, kể cả khi
          bé đang đăng nhập.
        </p>
      </Section>

      <Section id="be-dang-gi" title="Bé được đăng gì">
        <p>
          Game do chính bé làm ra. Mỗi bé đăng tối đa {UPLOADS_PER_CHILD_PER_DAY} game một ngày.
        </p>
        <p>
          Không đăng: nội dung bạo lực, đáng sợ, tục tĩu, quảng cáo, hoặc bất cứ thứ gì có thông
          tin cá nhân của bé hay của người khác (tên thật, trường lớp, địa chỉ, số điện thoại).
        </p>
        <p>
          <strong>Game hiện công khai ngay khi đăng, không qua bước duyệt trước.</strong> Chúng
          tôi chọn như vậy để bé đăng xong là khoe được ngay. Đổi lại, việc kiểm soát diễn ra ở
          phía sau: bất kỳ ai cũng báo cáo được một game; phụ huynh ẩn game của con mình bất cứ
          lúc nào; và chúng tôi gỡ những gì vi phạm những điều ở trên.
        </p>
        <p>
          Về việc tự động: khi một game nhận đủ {REPORT_AUTO_HIDE_THRESHOLD} báo cáo{' '}
          <strong>từ những phụ huynh đã xác minh email</strong>, hệ thống rút game khỏi trang chủ
          và phần tìm kiếm ngay, nhưng ai có link trực tiếp thì vẫn chơi được. Đủ{' '}
          {REPORT_HARD_HIDE_THRESHOLD} báo cáo như vậy thì game bị ẩn hoàn toàn. Chúng tôi làm hai
          mức thay vì một, vì mức đầu tiên xảy ra khi <em>chưa có người nào</em> xem nội dung game:
          nó cần chặn được đường lan truyền của nội dung xấu, mà không xoá ngay công của một đứa
          trẻ chỉ vì vài người bấm nút. Bố mẹ của bé được thông báo qua email trong cả hai trường
          hợp, và đội kiểm duyệt sẽ xem lại.
        </p>
        <p>
          Báo cáo của trẻ và của khách chưa đăng nhập vẫn được ghi nhận và vẫn tới tay đội kiểm
          duyệt — chỉ không tự động thay đổi trạng thái game. Đây là cách chúng tôi tránh việc một
          người đổi mạng vài lần là ẩn được game của bất kỳ ai.
        </p>
      </Section>

      <Section id="ban-quyen" title="Bản quyền">
        <p>
          Bé chỉ đăng game do bé làm. Nếu bé remix bài của người khác — chuyện rất bình thường và
          là một phần văn hoá của Scratch — thì hãy ghi rõ trong phần mô tả rằng game dựa trên bài
          của ai.
        </p>
        <p>
          Game bé đăng vẫn là của bé. Bằng việc đăng lên đây, bé cho phép KidoGame lưu trữ game và
          hiển thị cho người khác chơi. Người chơi khác tải được file <code>.sb3</code> gốc để mở
          ra học — đây là chủ ý, giống hệt cách Scratch hoạt động. Bé không muốn vậy thì đừng đăng
          game đó lên.
        </p>
        <p>
          Nếu bạn là người làm ra một game và thấy nó bị đăng lại ở đây mà không được phép, hãy{' '}
          <A href="/bao-cao-ban-quyen">gửi yêu cầu gỡ</A>. Bạn không cần có tài khoản.
        </p>
      </Section>

      <Section id="quy-trinh-go" title="Chúng tôi xử lý yêu cầu gỡ thế nào">
        <p>Quy trình cố định, để bạn biết trước điều gì sẽ xảy ra:</p>
        <ol className="ml-5 list-decimal space-y-2">
          <li>
            <strong>Nhận là ẩn ngay.</strong> Game biến khỏi trang công khai ngay khi yêu cầu được
            gửi, trước cả khi chúng tôi kịp đọc. Chúng tôi chọn ẩn trước vì nếu khiếu nại là đúng
            thì mỗi ngày để đó là một ngày quá nhiều.
          </li>
          <li>
            <strong>Báo cho phụ huynh của bé.</strong> Họ nhận email biết game đang tạm ẩn và vì
            sao, cùng lời nhắc rằng tạm ẩn chưa phải kết luận.
          </li>
          <li>
            <strong>Xem xét trong {TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc.</strong> Chúng tôi
            đọc căn cứ bạn nêu và đối chiếu với game.
          </li>
          <li>
            <strong>Trả lời cả hai phía bằng email.</strong> Đúng thì game bị gỡ hẳn. Không đủ căn
            cứ thì game hiện lại, trừ khi lúc đó nó đang ẩn vì một lý do khác.
          </li>
        </ol>
        <Notice tone="info">
          Vì game bị ẩn trước khi được xác minh, việc gửi yêu cầu gỡ sai sự thật gây thiệt hại
          thật cho một đứa trẻ. Chỉ gửi khi bạn thật sự là người có quyền với bản gốc.
        </Notice>
      </Section>

      <Section id="du-lieu" title="Dữ liệu chúng tôi giữ">
        <p>
          <strong>Của phụ huynh:</strong> email và mật khẩu (chỉ lưu dạng băm, không lưu mật khẩu
          thật).
        </p>
        <p>
          <strong>Của bé:</strong> tên đăng nhập, tên hiển thị, năm sinh nếu bạn điền, mật khẩu
          dạng băm, và các game bé đăng. Không email, không tên thật, không ảnh chụp, không vị trí.
        </p>
        <p>
          <strong>Khi có người báo cáo hoặc khiếu nại:</strong> chúng tôi lưu bản băm của địa chỉ
          IP để chặn spam, chứ không lưu IP thật. Riêng người gửi yêu cầu gỡ bản quyền thì có lưu
          tên và email họ tự khai, vì đó là hồ sơ của một khiếu nại và là cách để trả lời họ.
        </p>
        <p>
          Muốn xoá tài khoản của gia đình bạn và toàn bộ game của các bé, email cho chúng tôi ở
          địa chỉ bên dưới.
        </p>
      </Section>

      <Section id="nguon-mo" title="Phần mềm nguồn mở">
        <p>
          Trang chơi game được đóng gói bằng{' '}
          <a
            href="https://github.com/TurboWarp/packager"
            className="font-semibold underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            TurboWarp Packager
          </a>
          , và nhúng trong đó là runtime của Scratch, phát hành theo giấy phép AGPL-3.0. Giấy phép
          này yêu cầu chúng tôi cung cấp mã nguồn tương ứng cho người dùng qua mạng — email cho
          chúng tôi ở địa chỉ bên dưới và chúng tôi sẽ gửi.
        </p>
      </Section>

      <Section id="lien-he" title="Liên hệ">
        <p>KidoGame do {op.name} vận hành.</p>
        <p data-testid="terms-operator-email">
          Mọi việc — khiếu nại, xoá dữ liệu, báo lỗi, hỏi về điều khoản:{' '}
          <a href={`mailto:${op.email}`} className="font-semibold underline">
            {op.email}
          </a>
        </p>
        <p className="text-sm text-ink-soft">
          Riêng yêu cầu gỡ vì bản quyền, dùng <A href="/bao-cao-ban-quyen">biểu mẫu này</A> thay vì
          email: nó hỏi đủ những gì chúng tôi cần để xử lý ngay, còn email thì thường thiếu và
          phải hỏi đi hỏi lại.
        </p>
      </Section>
    </article>
  );
}
