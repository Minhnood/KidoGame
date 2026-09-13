import type { Metadata } from 'next';
import { Button, ButtonLink } from '@/components/button';
import { TextInput } from '@/components/field';
import { PageTitle } from '@/components/page';

export const metadata: Metadata = {
  title: 'Không tìm thấy trang — KidoGame',
};

/**
 * Trang 404.
 *
 * Trước đây file này KHÔNG tồn tại, nên mọi đường dẫn sai rơi vào trang 404 mặc
 * định của Next: một dòng "404 | This page could not be found" bằng tiếng Anh,
 * không có thanh điều hướng, không có đường về. Với một trang cho trẻ em Việt Nam
 * thì đó là một cái ngõ cụt bằng tiếng nước ngoài.
 *
 * Đường dẫn sai KHÔNG phải chuyện hiếm ở đây: link game được chia cho nhau qua
 * tin nhắn, mà game bị ẩn hoặc bị gỡ thì link cũ vẫn còn trong máy bạn bè.
 *
 * KHÔNG nói "lỗi". 404 không phải lỗi của đứa trẻ đang đọc, và với trẻ con thì
 * chữ "lỗi" đọc ra là "mình vừa làm hỏng cái gì".
 *
 * KHÔNG in con số "404" ở đâu cả. Với người lớn nó là một mã trạng thái quen mặt;
 * với một đứa bé tám tuổi nó là ba chữ số không nghĩa, và in thật to thì nó thành
 * thứ đập vào mắt nhất trên một trang mà thứ đáng đập vào mắt phải là đường đi
 * tiếp.
 *
 * KHÔNG hỏi cơ sở dữ liệu để gợi ý vài game. Đã cân nhắc và bỏ: trang này phải
 * render được trong MỌI hoàn cảnh, kể cả hoàn cảnh khiến người ta rơi vào đây —
 * và một truy vấn ở đây còn chạy cho từng lượt bot quét đường dẫn. Ô tìm kiếm bên
 * dưới làm đúng việc ấy mà không cần chạm tới DB.
 */
export default function NotFound() {
  return (
    /*
      Canh giữa cả cụm, và đây là một trong số rất ít trang được phép.
      `PageTitle` đã ghi rõ luật: chỉ canh giữa khi bên dưới KHÔNG có nội dung trải
      rộng, vì tiêu đề canh giữa trên một trang có danh sách thì không còn thẳng lề
      với thứ nó đang gọi tên. Ở đây bên dưới đúng là một cột hẹp, cũng canh giữa.

      Bản trước để mọi thứ nép trái trên cùng: đo trên màn 900px thì phần dưới tiêu
      đề còn hơn 600px trống trơn. Một trang đã mang tin xấu mà lại trống hoác thì
      đọc ra là trang hỏng nốt.
    */
    <div className="mx-auto max-w-150 pb-16 text-center">
      {/*
        Hình minh hoạ là ĐẦU MÈO CỦA CHÍNH LOGO, phóng to, không phải một hình vẽ
        mới.

        Đứa trẻ vừa gặp một đường cụt cần biết ngay rằng mình vẫn đang ở KidoGame
        chứ không phải bị ném ra một trang lạ — và cái duy nhất nó nhận ra trước khi
        kịp đọc chữ là con mèo cam trên thanh điều hướng. Một hình vẽ mới, dù đẹp
        hơn, lại đúng là thứ nói ngược: "đây là chỗ khác".

        Nghiêng nhẹ và đặt lệch một chút: con mèo đứng thẳng tắp giữa trang trông
        như một biểu tượng trạng thái. Nghiêng đi thì nó là một nhân vật đang ngơ
        ngác — cùng cảm giác với người đang đọc.
      */}
      <div className="mt-10 flex justify-center">
        <div className="relative">
          <span
            aria-hidden="true"
            className="grid size-28 -rotate-6 place-items-center rounded-[30px] bg-linear-to-b from-accent to-accent-dark shadow-xl shadow-accent/30 sm:size-32 sm:rounded-[34px]"
          >
            {/* Cùng path với `SiteLogo`, cùng `evenodd` để hai lỗ mắt là lỗ thật cho
                dải cam phía sau lộ qua. Nét mảnh hơn theo tỉ lệ (0.7 thay vì 0.9):
                ở 112px thì nét 0.9 bắt đầu bịt bớt hai lỗ mắt. */}
            <svg viewBox="0 0 24 24" className="size-16 sm:size-18" focusable="false">
              <path
                d={
                  'M6.2 8.6 5.4 3.6 9.8 6.4A9 9 0 0 1 14.2 6.4L18.6 3.6 17.8 8.6' +
                  'A7.4 7.4 0 0 1 20.4 14.2 8.4 8.4 0 0 1 12 21 8.4 8.4 0 0 1 3.6 14.2' +
                  'A7.4 7.4 0 0 1 6.2 8.6Z' +
                  'M9.4 12.6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z' +
                  'M14.6 12.6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z'
                }
                fillRule="evenodd"
                fill="var(--color-chrome)"
                stroke="var(--color-chrome)"
                strokeWidth="0.7"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          </span>

          {/*
            Dấu hỏi, không phải dấu chấm than.

            Chấm than là cảnh báo — nó nói "có chuyện rồi", tức là đổ lên đầu đứa trẻ
            đúng cái cảm giác mà cả trang này đang cố gỡ ra. Dấu hỏi chỉ nói "không
            biết trang này ở đâu", và chủ ngữ của nó là cái máy chứ không phải bé.

            Nền `surface` đặc chứ không trong suốt: nó nằm đè lên góc khối cam, mà
            hai màu cam chồng nhau thì không còn mép nào để mắt tách ra làm hai vật.
          */}
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-2 grid size-11 place-items-center rounded-full border-2 border-border bg-surface text-2xl font-extrabold text-accent-text shadow-md sm:-right-3 sm:size-12"
          >
            ?
          </span>
        </div>
      </div>

      <PageTitle
        canhGiua
        title="Không có trang này"
        lead="Có thể link bị gõ sai, hoặc game đã được bố mẹ ẩn đi rồi. Bé thử tìm tên game xem nhé."
      />

      {/*
        Ô TÌM KIẾM, không chỉ một đường về trang chủ.

        Người rơi vào đây phần lớn đang đi tìm MỘT game cụ thể — link cũ của một
        game bị ẩn, hay một đường dẫn gõ sai. Ném họ về trang chủ là bắt bắt đầu lại
        từ đầu; cho gõ thẳng cái tên thì họ đi tiếp được ngay từ đây.

        Form GET thường trỏ về `/`, đúng như ô tìm kiếm của trang chủ: chạy được khi
        JS chưa tải, và kết quả nằm trong URL nên chia sẻ hay bấm back đều đúng.
      */}
      <form
        method="get"
        action="/"
        role="search"
        data-testid="not-found-search"
        className="mx-auto mt-6 flex max-w-105 gap-2"
      >
        <TextInput
          name="q"
          type="search"
          placeholder="Tìm game theo tên…"
          aria-label="Tìm game theo tên"
        />
        <Button type="submit">Tìm</Button>
      </form>

      {/*
        Đường về là một NÚT THẬT, không phải một dòng chữ đậm.

        Bản trước để nó là `<Link className="font-bold">`: trên trang nó ra một dòng
        chữ đen đậm không viền, không gạch chân, nằm lửng giữa khoảng trống — đúng
        cái bẫy "trông không bấm được" vừa phải sửa ba lần ở chỗ khác. Trên trang
        này thì tệ hơn mọi chỗ khác, vì nó là lối ra DUY NHẤT.
      */}
      <p className="mt-7">
        <ButtonLink href="/" size="lg" variant="ghost" data-testid="not-found-ve-trang-chu">
          Về trang chủ xem game khác
        </ButtonLink>
      </p>
    </div>
  );
}
