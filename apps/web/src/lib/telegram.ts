/**
 * Gửi một tin nhắn Telegram. Kênh báo động thứ hai, đứng cạnh email.
 *
 * VÌ SAO CÓ KÊNH THỨ HAI. Mọi tầng giám sát của hệ thống này đều đổ về CÙNG MỘT
 * hòm thư Gmail (xem `infra/GIAM-SAT.md` mục 7). Mất quyền vào hòm thư đó là mù
 * hoàn toàn trong khi mọi bảng điều khiển vẫn nói là đang theo dõi bình thường.
 * Và ngay cả khi hòm thư còn nguyên: thư báo động nằm chung với mọi thứ khác, bị
 * đọc muộn hàng giờ, đúng lúc mà giá trị của một báo động nằm ở chỗ đọc sớm.
 *
 * VÌ SAO TELEGRAM chứ không phải SMS hay gọi điện: Bot API miễn phí, không giới
 * hạn số tin, không cần thẻ. Con bot do người vận hành tự tạo nên **không nhà cung
 * cấp nào khoá được** — khác hẳn UptimeRobot, nơi Telegram nằm sau gói trả phí.
 *
 * TẮT MẶC ĐỊNH. Thiếu token hoặc chat id thì `guiTelegram()` trả `false` và không
 * ném gì — đây là kênh phụ, và một kênh phụ chưa cấu hình không được phép làm hỏng
 * đường gửi chính.
 */

/** Trần độ dài một tin nhắn Telegram. Dài hơn là API TỪ CHỐI cả tin. */
const TRAN_KY_TU = 4096;

export interface CauHinhTelegram {
  token: string;
  chatId: string;
}

/**
 * Đọc cấu hình từ biến môi trường. Trả null nếu chưa khai đủ.
 *
 * Đòi CẢ HAI mới tính là đã cấu hình. Khai mỗi token thì mọi lần gửi đều trượt với
 * `chat_id is empty`, và dòng lỗi đó xuất hiện hằng đêm trong log của một cơ chế mà
 * người ta chỉ mở log ra xem khi đã có chuyện.
 */
export function docCauHinhTelegram(): CauHinhTelegram | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

/** Có cấu hình Telegram chưa. Dùng để quyết định có nhắc người vận hành hay không. */
export function coTelegram(): boolean {
  return docCauHinhTelegram() !== null;
}

/**
 * Gửi thật. Trả `true` nếu Telegram xác nhận đã nhận.
 *
 * KHÔNG NÉM, cố ý: nơi gọi là các đường báo động, và một kênh phụ trượt không được
 * phép kéo theo kênh chính. Trượt thì ghi log rồi trả `false` để nơi gọi tự quyết.
 */
export async function guiTelegram(text: string): Promise<boolean> {
  const cfg = docCauHinhTelegram();
  if (!cfg) return false;

  /*
   * KHÔNG dùng `parse_mode`. Đây là quyết định có chủ ý, không phải bỏ sót.
   *
   * Markdown hay HTML làm tin nhắn đẹp hơn, nhưng chúng đòi escape đúng, mà thân
   * tin nhắn ở đây là do MÁY dựng: đường dẫn file, thông điệp lỗi ENOENT, tên
   * miền, dấu ngoặc, gạch dưới. Một ký tự lạc là Telegram trả `can't parse
   * entities` và TỪ CHỐI CẢ TIN — tức chính lá báo động biến mất vì một dấu gạch
   * dưới trong tên file. Chữ thường không bao giờ hỏng theo kiểu đó.
   */
  const body = {
    chat_id: cfg.chatId,
    text: text.length > TRAN_KY_TU ? `${text.slice(0, TRAN_KY_TU - 20)}\n… (đã cắt bớt)` : text,
    // Báo động thì không cần xem trước link, và bản xem trước làm tin dài gấp đôi
    // trên màn hình điện thoại.
    disable_web_page_preview: true,
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    /*
     * ĐỌC THÂN PHẢN HỒI, không chỉ nhìn `res.ok`. Đúng bài học của commit 80dfec0:
     * "không ném lỗi" là tất cả những gì hệ thống từng biết về một lá thư đã gửi.
     * Telegram trả `{"ok":false,"description":"..."}` kèm mã HTTP 400 — bỏ qua thân
     * thì mất đúng câu giải thích, mà nguyên nhân hay gặp nhất (`chat not found`,
     * do người dùng chưa bấm Start cho bot) chỉ nằm trong đó.
     */
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { message_id?: number } }
      | null;

    if (!res.ok || !data?.ok) {
      // KHÔNG in `cfg.token` vào bất cứ đâu — dòng này đi vào log, và ai có token
      // thì gửi được tin giả danh bot. Cùng lý do `mail.ts` không đưa `pass` vào
      // thông điệp lỗi.
      console.error(
        `[telegram] gửi trượt — HTTP ${res.status}, Telegram nói: ${data?.description ?? '(không có mô tả)'}`
      );
      return false;
    }

    console.log(`[telegram] đã gửi — chat=${cfg.chatId} id=${data.result?.message_id ?? '—'}`);
    return true;
  } catch (err) {
    const lyDo = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] gửi trượt — không gọi được api.telegram.org: ${lyDo}`);
    return false;
  }
}
