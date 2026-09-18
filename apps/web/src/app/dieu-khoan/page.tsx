import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import {
  NGAY_GIU_GAME_DA_GO,
  REPORT_AUTO_HIDE_THRESHOLD,
  REPORT_HARD_HIDE_THRESHOLD,
} from '@/lib/moderation';
import { UPLOADS_PER_CHILD_PER_DAY } from '@/lib/ingest';
/* Hạn giữ của ErrorLog. GlitchTip giữ theo GLITCHTIP_RETENTION_DAYS (30) — biến đó
   KHÔNG được vượt số này, vì đây là lời hứa "tối đa" trên trang. */
import { RETENTION_DAYS as ERROR_RETENTION_DAYS } from '@/lib/error-log';
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
  /* Khai đúng những gì ĐANG chạy: xem ghi chú ở đoạn "Các bước khi bé đăng game". */
  const guiPheuDangGame =
    !!process.env.MIXPANEL_TOKEN?.trim() && !!process.env.MIXPANEL_ID_SALT?.trim();
  const op = operator();

  return (
    <article className="mb-16 max-w-180">
      <PageTitle
        title="Điều khoản sử dụng"
        lead="Viết để phụ huynh đọc hết trong năm phút. Có chỗ nào chưa rõ thì email cho chúng tôi."
      />

      {/*
        Cảnh báo này giờ hiện thêm một trường hợp nữa: `OPERATOR_EMAIL` ĐÃ khai
        nhưng nằm dưới một TLD không bao giờ nhận được thư (`.local`, `.test`…).
        Trước đây chỗ đó lặng thinh và trang in địa chỉ chết ra công khai làm nơi
        nhận khiếu nại bản quyền — tức là mặt hứa vẫn đứng nguyên trong khi đường
        thư đằng sau đã đứt. Xem `isOperatorConfigured()` trong lib/operator.ts.
      */}
      {!isOperatorConfigured() && (
        <Notice tone="warn">
          Bản cài đặt này chưa có địa chỉ liên hệ dùng được: <code>OPERATOR_NAME</code> và{' '}
          <code>OPERATOR_EMAIL</code> trong <code>infra/.env</code> còn trống, hoặc email đang khai
          nằm dưới một tên miền không nhận được thư. Phần liên hệ bên dưới chưa dùng được.
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
        {/*
          RANH GIỚI GIỮA "ẨN" VÀ "XOÁ", nói ra vì nó không hiển nhiên và vì nó quyết
          định người ta bấm nút nào.

          File game được phục vụ theo địa chỉ nội dung, ở một origin không tra database
          — nên ẩn một game KHÔNG thu hồi file của nó, và với game chỉ bị ẩn thì tình
          trạng đó là vĩnh viễn (cơ chế dọn đĩa chỉ xoá file không game nào còn trỏ tới).
          Đo được: trang của một game đã gỡ trả 404 trong khi hai file của nó vẫn trả 200.

          Người cần thu hồi nội dung thật thường là phụ huynh phát hiện game để lộ gì đó
          về con mình. Họ phải biết ranh giới này trước khi bấm, không phải sau.

          MỆNH ĐỀ "nếu không còn game nào khác dùng đúng file đó" KHÔNG phải rào chữ, và
          nó phủ CẢ BA file: storage địa chỉ hoá theo nội dung, nên hai game dựng từ cùng
          một .sb3 dùng CHUNG file gốc, ảnh bìa, và cả bản đã đóng gói. Câu này từng để
          bản đã đóng gói NGOÀI mệnh đề ("luôn mất, vì mã của nó là riêng") — đúng khi HTML
          còn mang tên game. Từ khi HTML đóng gói lúc xem thử, trước khi bé đặt tên, nó mang
          tên chung và trùng mã với mọi game cùng .sb3; `e2e-an-vs-xoa` đo ra HTML vẫn trả
          200 sau khi xoá hẳn. Bỏ mệnh đề ấy đi là hứa một việc mà cơ chế không làm — và
          không làm ĐÚNG, vì xoá file theo mã nội dung là xoá mất bản của game khác.
        */}
        <p>
          <strong>“Ẩn” và “xoá hẳn” không giống nhau, và đây là chỗ nên đọc kỹ.</strong> Ẩn là
          rút game khỏi trang: không ai tìm thấy nó nữa, và mở trang game thì báo không tồn tại.
          Nhưng file game đã đóng gói được phục vụ theo mã nội dung, nên{' '}
          <em>ai đang giữ sẵn link tới đúng file đó vẫn mở được</em>. Muốn nội dung không còn
          trên mạng nữa thì bố mẹ bấm <strong>Xoá hẳn</strong> ở trang của bố mẹ: game rời trang
          ngay, và sau {NGAY_GIU_GAME_DA_GO} ngày chúng tôi xoá thật bản đã đóng gói, ảnh bìa và
          file <code>.sb3</code> gốc — không ai mở được nữa, kể cả bằng link cũ — nếu không còn
          game nào khác dùng đúng file đó (ví dụ khi hai game được đăng từ cùng một file{' '}
          <code>.sb3</code>). Ngay lúc bấm, bố mẹ nhận một email kèm link tải bản gốc để
          kịp giữ lại công của bé.
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
          hiển thị cho người khác chơi. Người chơi khác tải được file <code>.sb3</code> để mở ra
          học — đây là chủ ý, giống hệt cách Scratch hoạt động. Bé không muốn vậy thì đừng đăng
          game đó lên.
        </p>
        {/*
          KHÔNG dùng chữ "gốc" cho file tải về, và nói ra vì sao.

          `validateAndNormalize` trong packages/sb3 RE-ZIP file upload, chỉ giữ
          project.json và những asset thực sự được tham chiếu — mọi thứ khác trong zip
          bị bỏ, vì đó là chỗ payload ẩn hay nằm và re-zip chắc chắn hơn hẳn việc cố
          phát hiện từng loại. File lưu trên đĩa được đánh địa chỉ theo hash của BẢN ĐÃ
          RE-ZIP, nên không nơi nào trong hệ thống còn giữ byte gốc người dùng gửi lên.
          Đo được: một file 10,02MB upload lên, tải về ra 10,04MB — bỏ bớt entry nhưng
          mức nén khác nên còn phình ra.

          Vì sao phải nói: có hai lá thư đưa link tải này kèm câu "để kịp giữ lại công
          của bé" — thư gỡ game theo kiểm duyệt, và chạy khô của lệnh xoá tài khoản gia
          đình. Một đứa trẻ để dành sprite hay đoạn nhạc CHƯA DÙNG trong project, chuyện
          rất thường khi đang làm dở, thì tải về sẽ không còn. Gọi đó là "bản gốc" là
          hứa nhiều hơn cơ chế, đúng vào lúc hệ thống nói sẽ trả lại công của nó.
        */}
        <p>
          Một lưu ý về file tải về, cho cả người chơi lẫn bố mẹ: đó <strong>không phải</strong>
          đúng file bé đã tải lên. Khi nhận game, hệ thống đóng gói lại file{' '}
          <code>.sb3</code> để loại những thứ có thể giấu trong đó — bản lưu chỉ gồm project và{' '}
          <strong>những asset game đang dùng</strong>. Mở bằng Scratch thì không khác gì, nhưng
          hình hay âm thanh bé để dành mà chưa dùng tới sẽ không có trong file tải về.
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
          <strong>Thống kê lượt xem:</strong> chúng tôi đếm số lượt mở từng trang để biết web có
          ai dùng và trang nào hay bị lỗi. Việc đếm chạy trên chính máy chủ của KidoGame, không
          gửi cho công ty quảng cáo nào, không đặt cookie và không lưu địa chỉ IP.
          Mỗi lượt chỉ ghi trang được mở, loại trình duyệt, thiết bị, cỡ màn hình, ngôn ngữ, và
          quốc gia/thành phố ước đoán từ địa chỉ IP — không gắn với tài khoản nào, và không ghi lại những gì bé gõ
          vào ô tìm kiếm. Trình duyệt bật &quot;Do Not Track&quot; thì không được đếm.
        </p>
        {/*
          ĐOẠN NÀY CHỈ HIỆN KHI TÍNH NĂNG THẬT SỰ BẬT.
          Thiếu `MIXPANEL_TOKEN` hoặc `MIXPANEL_ID_SALT` là máy chủ không gửi một byte nào
          (xem `lib/mixpanel.ts`), và một trang điều khoản khai một việc không xảy ra thì
          cũng sai như khai thiếu một việc đang xảy ra. `/dieu-khoan` là trang dynamic nên
          bật/tắt biến môi trường là câu chữ đổi theo, không cần build lại.
        */}
        {guiPheuDangGame && (
          <p>
            <strong>Các bước khi bé đăng game:</strong> để biết bé hay dừng lại ở bước nào, chúng
            tôi gửi năm mốc — bé chọn file, bản chơi thử dựng xong, bấm Đăng, đăng xong, và đăng
            lỗi — sang <strong>Mixpanel</strong>, một dịch vụ phân tích đặt tại Mỹ. Mỗi mốc chỉ
            mang: một mã đại diện cho bé (băm một chiều bằng khoá chỉ máy chủ chúng tôi biết, nên
            Mixpanel không dò ngược ra được bé nào), nhóm dung lượng file, số ảnh bìa, mã lỗi kỹ
            thuật nếu có, và thời gian máy chủ xử lý. <em>Không</em> có tên đăng nhập, tên bé,
            email bố mẹ, tên game, hay bất cứ chữ nào bé gõ. Việc gửi do máy chủ của chúng tôi
            làm: không có đoạn mã nào của Mixpanel chạy trong máy của bé, và Mixpanel không nhận
            địa chỉ IP của bé.
          </p>
        )}
        <p>
          <strong>Khi web bị lỗi:</strong> chúng tôi ghi lại trang bị lỗi (bỏ phần sau dấu{' '}
          <code>?</code>), thông báo lỗi kỹ thuật đã che email và các mã bí mật, và loại trình
          duyệt. Không gắn với tài khoản nào, không lưu địa chỉ IP, không lưu những gì bạn gõ. Bản
          ghi nằm trên chính máy chủ của KidoGame và tự xoá sau tối đa {ERROR_RETENTION_DAYS} ngày.
        </p>
        <p>
          <strong>Khi có người báo cáo hoặc khiếu nại:</strong> chúng tôi lưu bản băm của địa chỉ
          IP để chặn spam, chứ không lưu IP thật. Riêng người gửi yêu cầu gỡ bản quyền thì có lưu
          tên và email họ tự khai, vì đó là hồ sơ của một khiếu nại và là cách để trả lời họ.
        </p>
        <p>
          <strong>Khi một game bị gỡ hẳn:</strong> chúng tôi giữ lại {NGAY_GIU_GAME_DA_GO} ngày
          rồi xoá thật — hàng dữ liệu, bản đã đóng gói, ảnh bìa, và cả file <code>.sb3</code> gốc
          của bé, trừ file nào còn được một game khác dùng đúng y hệt. Ngay lúc gỡ, bố mẹ nhận một
          email nói rõ ngày đó, để công của bé không mất theo một quyết định của chúng tôi. Với
          game bị gỡ theo quyết định kiểm duyệt, thư kèm luôn link tải lại file gốc; với game bị
          gỡ vì khiếu nại bản quyền thì bố mẹ trả lời thư để lấy lại, vì lúc ấy chính nội dung đó
          đang có tranh chấp.
        </p>
        <p>
          Hồ sơ của một yêu cầu gỡ bản quyền thì <strong>ở lại</strong> sau khi game đã xoá — kèm
          tên game đã chụp lại lúc nhận. Nó là bằng chứng chúng tôi đã xử lý đúng một khiếu nại,
          và nếu nó biến mất cùng game thì càng làm đúng, hồ sơ càng trống.
        </p>
        <p>
          <strong>Muốn xoá tài khoản của gia đình bạn</strong> và toàn bộ game của các bé, email
          cho chúng tôi ở địa chỉ bên dưới. Chúng tôi xoá tài khoản phụ huynh, tài khoản của các
          bé, mọi game đã đăng, và cả dấu vết đăng nhập — rồi gửi bạn một thư xác nhận.
        </p>
        {/*
          Nói trước rằng file gốc sẽ mất, và nói ở ĐÂY chứ không đợi thư xác nhận.
          Việc xoá không đảo lại được, nên lúc duy nhất câu này còn giúp được gì là
          lúc người ta chưa gửi yêu cầu. Một phụ huynh xin xoá tài khoản đang xin bỏ
          đi dữ liệu của mình, không nhất thiết đang xin bỏ đi thứ con họ tự làm ra.
        */}
        <p>
          Việc này <strong>không đảo lại được</strong>, và file <code>.sb3</code> gốc của các bé
          cũng đi theo. Nếu bé muốn giữ lại công của mình, tải các file đó về máy trước khi bạn
          gửi yêu cầu — hoặc nói trong thư, chúng tôi sẽ gửi bạn link tải trước khi xoá.
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
          Riêng <strong>lỗi kỹ thuật</strong> thì nhanh nhất là{' '}
          <Link href="/bao-loi" className="font-semibold underline">
            trang báo lỗi
          </Link>{' '}
          — nó vào thẳng hàng đợi của người trực, không phải hòm thư. Còn mọi việc khác —
          khiếu nại, xoá dữ liệu, hỏi về điều khoản:{' '}
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
