import { createHash } from 'node:crypto';
import { AuthError } from './auth';
import { prisma } from './db';
import { appOrigin, sendMail } from './mail';
import { communityStatus } from './moderation';
import { operator, TAKEDOWN_SLA_WORKING_DAYS } from './operator';
import {
  MAX_CLAIMANT_EMAIL_LENGTH,
  MAX_CLAIMANT_NAME_LENGTH,
  MAX_EVIDENCE_LENGTH,
  MIN_EVIDENCE_LENGTH,
} from './takedown-limits';
import { sanitizeMultiline, sanitizeText } from './text';

/**
 * Những game (trong danh sách đưa vào) đang có yêu cầu gỡ bản quyền CHƯA xử lý.
 *
 * Cần vì phụ huynh KHÔNG được bật lại một game đang bị giữ ẩn bởi khiếu nại bản quyền.
 * Chỗ này từng là lỗ thật: `setGameHiddenAction` chỉ hỏi `communityStatus` (tức chỉ đếm
 * báo cáo), nên một yêu cầu gỡ ẩn game xong là phụ huynh bấm "Hiện lại" một cái đưa nó
 * công khai trở lại — trong khi `/dieu-khoan` hứa công khai với người khiếu nại là ẩn
 * ngay và trả lời trong hạn.
 *
 * Hệ quả thứ hai còn khó thấy hơn: lúc admin bác khiếu nại, `adminResolveTakedown` tính
 * "đã cho hiện lại chưa" bằng `updateMany` có điều kiện `status: 'HIDDEN'`. Game đã bị
 * phụ huynh bật lại thì điều kiện đó không khớp, `restored` = false, và người khiếu nại
 * nhận thư nói "game vẫn đang ẩn" trong khi nó đang chạy công khai.
 *
 * Nhận cả DANH SÁCH id chứ không phải một id: trang của phụ huynh liệt kê nhiều game
 * cùng lúc, hỏi từng cái là N+1 truy vấn.
 */
export async function gameDangBiKhieuNai(gameIds: string[]): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();
  const rows = await prisma.takedownRequest.findMany({
    where: { gameId: { in: gameIds }, status: 'OPEN' },
    select: { gameId: true },
  });
  return new Set(rows.map((r) => r.gameId));
}

/*
 * Luồng gỡ nội dung vi phạm bản quyền.
 *
 * Có mặt vì một lý do rất cụ thể: trẻ con hay đăng lại game của người khác. Phần
 * lớn không phải ác ý — các em remix bài của nhau, đó là văn hoá của Scratch. Nhưng
 * người làm ra bản gốc vẫn phải có một cái cửa để gõ, và cái cửa đó không thể là
 * nút "Báo cáo" trong trang game: người đó thường không có tài khoản ở đây, và thứ
 * họ cần nộp — họ là ai, bản gốc ở đâu — thì form báo cáo cố tình không hỏi.
 *
 * Chính sách do chủ dự án chốt: ẨN NGAY khi tiếp nhận, XÁC MINH SAU, sai thì khôi
 * phục. Cùng khuôn với auto-hide theo ngưỡng báo cáo, và cùng lý do: nền tảng này
 * không duyệt trước, nên mỗi phút một nội dung có vấn đề còn hiển thị là một phút
 * quá nhiều. Cái giá phải trả là ẩn oan, và cái giá đó được bù bằng việc chỉ admin
 * mới quyết định cuối cùng, có thời hạn, và có mail báo cho cả hai phía.
 */

/**
 * Hạn mức chống spam, tính theo IP trong 24 giờ.
 *
 * ĐÃ NÂNG TỪ 5 LÊN 20 khi rà lại các trần cho lưu lượng mở. Đây không phải một biểu
 * mẫu góp ý, nó là kênh pháp lý — và trần 5 chặn oan đúng người mà kênh này tồn tại
 * để phục vụ: một chủ bản quyền phát hiện tám game dùng nhân vật của mình phải gửi
 * tám yêu cầu, mỗi yêu cầu một game, vì form nhận đúng một mã game. Chạm trần thì
 * đường thay thế duy nhất của họ là gửi mail tới `OPERATOR_EMAIL` và chờ, trong khi
 * cái họ vừa cố làm là dùng đúng quy trình ta công bố.
 *
 * Không nâng cao hơn: mỗi yêu cầu tạo một dòng trong DB và một lá thư gửi cho đơn vị
 * vận hành, nên trần vẫn phải là một con số mà một người đọc hết được trong ngày.
 *
 * Kèm lợi ích cho việc kiểm: với trần 5, `infra/e2e-takedown.mjs` chỉ chạy được
 * khoảng hai lượt một ngày, và lượt thứ ba đổ ngay bước đầu với triệu chứng trông y
 * như luồng gỡ bản quyền bị hỏng.
 */
export const TAKEDOWNS_PER_IP_PER_DAY = 20;

/**
 * Nhận cả link đầy đủ lẫn mã game trần.
 *
 * Người khiếu nại là người ngoài: thứ họ đang cầm trong tay là thanh địa chỉ của
 * trình duyệt, không phải "mã game". Bắt họ tự bóc id ra khỏi URL là một bước thừa
 * mà ai cũng có thể làm sai, và làm sai thì yêu cầu gỡ rơi vào hư không.
 */
export function parseGameRef(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fromUrl = text.match(/\/game\/([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];

  return /^[A-Za-z0-9_-]+$/.test(text) ? text : null;
}

/**
 * Kiểm email ở mức "có gõ nhầm hiển nhiên không".
 *
 * Cố ý lỏng. Đây là hòm thư DUY NHẤT để trả lời người khiếu nại, nên sai một ký tự
 * là mất liên lạc — nhưng một biểu thức chính quy chặt chẽ theo RFC thì lại từ chối
 * những địa chỉ hợp lệ và hiếm gặp, mà từ chối oan ở đây nghĩa là chặn luôn cả một
 * khiếu nại có thật.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ipHashOf(ip: string | null): string {
  return createHash('sha256').update(`ip:${ip ?? 'khong-ro'}`).digest('hex');
}

function isUniqueViolation(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && 'code' in e && e.code === 'P2002');
}

export interface TakedownInput {
  /** Link tới trang game, hoặc mã game. */
  gameRef: string;
  claimantName: string;
  claimantEmail: string;
  evidence: string;
  /**
   * Người gửi đã tick ô cam đoan trung thực hay chưa.
   *
   * Ô đó `required` ở HTML rồi, nhưng vẫn kiểm lại ở đây: `required` chỉ là hàng
   * rào của trình duyệt, ai gửi thẳng request thì đi vòng qua nó trong một giây.
   * Mà cam đoan chính là thứ duy nhất chúng tôi cầm trong tay khi ẩn game của một
   * đứa trẻ trước cả khi kịp đọc nội dung khiếu nại.
   */
  attested: boolean;
  ip: string | null;
}

/**
 * Tiếp nhận một yêu cầu gỡ: ghi hồ sơ, ẩn game ngay, báo cho admin và phụ huynh.
 *
 * Gửi trùng KHÔNG bị coi là lỗi — người gửi vẫn thấy đúng một lời xác nhận, giống
 * hệt `reportGame`. Nói "bạn gửi rồi" chẳng giúp gì cho họ.
 */
export async function submitTakedownRequest(input: TakedownInput): Promise<void> {
  const gameId = parseGameRef(input.gameRef);
  if (!gameId) {
    throw new AuthError('Dán link trang game hoặc mã game vào ô đầu tiên nhé.');
  }

  const claimantName = sanitizeText(input.claimantName, MAX_CLAIMANT_NAME_LENGTH);
  const claimantEmail = sanitizeText(input.claimantEmail, MAX_CLAIMANT_EMAIL_LENGTH).toLowerCase();
  // Căn cứ giữ NGUYÊN xuống dòng: người ta hay dán vào đây danh sách link mỗi thứ
  // một dòng, gộp lại là làm hỏng đúng phần cần đọc kỹ nhất.
  const evidence = sanitizeMultiline(input.evidence, MAX_EVIDENCE_LENGTH);

  if (claimantName.length < 2) throw new AuthError('Cho chúng tôi biết tên của bạn nhé.');
  if (!looksLikeEmail(claimantEmail)) {
    throw new AuthError('Email chưa đúng. Đây là địa chỉ duy nhất để chúng tôi trả lời bạn.');
  }
  if (evidence.length < MIN_EVIDENCE_LENGTH) {
    throw new AuthError(
      'Hãy mô tả rõ hơn: bạn là ai với bản gốc, và bản gốc đang ở đâu (dán link vào đây).'
    );
  }
  if (!input.attested) {
    throw new AuthError('Cần tích vào ô cam đoan ở cuối biểu mẫu thì chúng tôi mới xử lý được.');
  }

  const ipHash = ipHashOf(input.ip);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.takedownRequest.count({
    where: { ipHash, createdAt: { gte: since } },
  });
  if (recent >= TAKEDOWNS_PER_IP_PER_DAY) {
    throw new AuthError(
      `Bạn đã gửi ${TAKEDOWNS_PER_IP_PER_DAY} yêu cầu trong hôm nay. Liên hệ thẳng qua email ở trang Điều khoản nhé.`
    );
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      title: true,
      status: true,
      child: { select: { displayName: true, parent: { select: { email: true } } } },
    },
  });
  if (!game) {
    throw new AuthError('Không tìm thấy game này. Kiểm tra lại đường link giúp chúng tôi nhé.');
  }
  if (game.status === 'REMOVED') {
    throw new AuthError('Game này đã bị gỡ khỏi KidoGame từ trước rồi.');
  }

  let created = true;
  try {
    await prisma.$transaction(async (tx) => {
      /*
       * Ẩn bằng `updateMany` có điều kiện trạng thái thay vì đọc-rồi-ghi: số hàng bị
       * tác động vừa là kết quả vừa là câu trả lời cho "chính yêu cầu này có phải
       * thứ đã ẩn game hay không". Đọc trước rồi ghi sau thì hai yêu cầu đến cùng
       * lúc sẽ cùng tự nhận là mình đã ẩn, và lúc bác bỏ cái thứ hai game sẽ hiện
       * lại trong khi cái thứ nhất vẫn còn đang mở.
       *
       * PHẢI gồm cả LIMITED, không chỉ PUBLISHED: game đang bị ẩn mềm vì báo cáo thì
       * link trực tiếp vẫn chơi được, nên với một khiếu nại bản quyền nó vẫn đang
       * phát tán nội dung. Bỏ LIMITED ra khỏi đây thì `didHide` = false, game giữ
       * nguyên mức chơi-được-bằng-link, và ta đã hứa công khai ở /dieu-khoan là ẩn
       * ngay khi nhận. Đúng loại lỗi không ai thấy: hàng vẫn vào hàng đợi, admin vẫn
       * xử, chỉ có lời hứa là trượt.
       */
      const hidden = await tx.game.updateMany({
        where: { id: game.id, status: { in: ['PUBLISHED', 'LIMITED'] } },
        data: { status: 'HIDDEN' },
      });
      const didHide = hidden.count === 1;

      await tx.takedownRequest.create({
        data: { gameId: game.id, claimantName, claimantEmail, evidence, ipHash, didHide },
      });

      if (didHide) {
        await tx.moderationLog.create({
          data: {
            gameId: game.id,
            actorId: 'system',
            action: 'TAKEDOWN_HIDE',
            note: 'Tạm ẩn khi nhận yêu cầu gỡ bản quyền, chờ admin xác minh',
          },
        });
      }
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    created = false; // đã gửi rồi — im lặng coi như thành công
  }

  if (!created) return;

  // Ngoài transaction: mail gửi trượt KHÔNG được làm mất hồ sơ vừa ghi. Hồ sơ đã
  // nằm trong DB và đã hiện trên /admin, nên mất mail là chậm chứ không phải mất.
  const gameUrl = `${appOrigin()}/game/${game.id}`;
  await Promise.allSettled([
    sendMail({
      to: operator().email,
      subject: `[KidoGame] Yêu cầu gỡ bản quyền: ${game.title}`,
      text: [
        'Có yêu cầu gỡ nội dung vì bản quyền. Game đã được TẠM ẨN.',
        '',
        `Game:        ${game.title}`,
        `Của bé:      ${game.child.displayName}`,
        `Link:        ${gameUrl}`,
        '',
        `Người gửi:   ${claimantName} <${claimantEmail}>`,
        '',
        'Căn cứ họ nêu:',
        evidence,
        '',
        `Hạn trả lời: ${TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc kể từ bây giờ.`,
        `Xử lý tại:   ${appOrigin()}/admin`,
      ].join('\n'),
    }),
    sendMail({
      to: game.child.parent.email,
      /*
       * KHÔNG nói cho phụ huynh biết người khiếu nại là ai.
       *
       * Người đó là một người ngoài đã để lại tên thật và email thật cho chúng tôi,
       * không phải cho phụ huynh. Chuyển tiếp danh tính đó là mở đường cho việc đôi
       * co trực tiếp giữa hai bên, mà bên còn lại đang bênh con mình. Cần đối chất
       * thì admin đứng giữa.
       */
      subject: `Game "${game.title}" của bé đang tạm ẩn`,
      text: [
        'Chào bạn,',
        '',
        `Chúng tôi vừa nhận được một yêu cầu gỡ game "${game.title}" của bé ${game.child.displayName}`,
        'với lý do vi phạm bản quyền. Theo quy trình, game được TẠM ẨN trong lúc chờ xem xét.',
        '',
        'Tạm ẩn không có nghĩa là bé đã làm sai. Rất nhiều game trên KidoGame là remix,',
        'và chúng tôi sẽ xem lại trước khi quyết định.',
        '',
        `Chúng tôi sẽ trả lời trong ${TAKEDOWN_SLA_WORKING_DAYS} ngày làm việc.`,
        'Nếu bạn cho rằng đây là nhầm lẫn, trả lời thư này và nói giúp chúng tôi bé đã làm game',
        'đó như thế nào.',
        '',
        `Chi tiết điều khoản: ${appOrigin()}/dieu-khoan`,
      ].join('\n'),
    }),
  ]).then((rs) => {
    for (const r of rs) {
      if (r.status === 'rejected') console.error('[takedown] không gửi được mail:', r.reason);
    }
  });
}

// --- Thao tác của admin ------------------------------------------------------

export interface ResolveResult {
  /** Game có được cho hiện lại hay không — dùng để viết mail và ghi vết cho đúng. */
  restored: boolean;
}

/**
 * Admin phán xử một yêu cầu gỡ.
 *
 * `accept` = khiếu nại đúng: game bị GỠ HẲN (`REMOVED`), phụ huynh không tự bật lại
 * được. Không dùng `HIDDEN` ở đây — với một nội dung đã xác minh là vi phạm, để phụ
 * huynh tự cho hiện lại thì việc gỡ chỉ là hình thức.
 *
 * `accept = false` = khiếu nại không đứng vững: game hiện lại, NHƯNG chỉ khi chính
 * yêu cầu này là thứ đã ẩn nó. Xem `didHide` trong schema.
 */
export async function adminResolveTakedown(
  adminId: string,
  requestId: string,
  accept: boolean,
  note: string
): Promise<ResolveResult> {
  const request = await prisma.takedownRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      didHide: true,
      claimantEmail: true,
      claimantName: true,
      game: {
        select: {
          id: true,
          title: true,
          trustedReportCount: true,
          child: { select: { displayName: true, parent: { select: { email: true } } } },
        },
      },
    },
  });
  if (!request) throw new AuthError('Không tìm thấy yêu cầu này.');
  if (request.status !== 'OPEN') throw new AuthError('Yêu cầu này đã được xử lý rồi.');

  let restored = false;
  /** Mức được hiện lại tới. Cần riêng vì "đã hiện lại" và "hiện lại tới đâu" khác nhau. */
  let restoredTo: 'PUBLISHED' | 'LIMITED' | 'HIDDEN' | null = null;

  await prisma.$transaction(async (tx) => {
    if (accept) {
      await tx.game.update({ where: { id: request.game.id }, data: { status: 'REMOVED' } });
      // Game đã gỡ hẳn thì mọi báo cáo đang mở về nó cũng hết việc.
      await tx.report.updateMany({
        where: { gameId: request.game.id, status: 'OPEN' },
        data: { status: 'RESOLVED' },
      });
    } else if (request.didHide) {
      /*
       * Chỉ hiện lại khi KHÔNG còn lý do nào khác giữ game trong bóng tối.
       *
       * Trong lúc yêu cầu này chờ xử lý, game có thể đã tích thêm báo cáo tới ngưỡng,
       * hoặc có yêu cầu gỡ thứ hai từ người khác. Cho hiện lại mà bỏ qua hai thứ đó
       * là dùng kết luận của một vụ để xoá kết luận của một vụ khác.
       */
      const otherOpen = await tx.takedownRequest.count({
        where: { gameId: request.game.id, status: 'OPEN', id: { not: request.id } },
      });

      /*
       * Hiện lại tới ĐÚNG mức mà báo cáo cộng đồng đang cho phép, không phải luôn
       * luôn PUBLISHED. Trước đây chỗ này chỉ so `reportCount` với ngưỡng rồi
       * hoặc hiện hẳn hoặc không hiện gì — nay đã có mức trung gian nên phải trả về
       * đúng mức đó, để kết luận của vụ bản quyền không xoá mất tín hiệu của vụ báo
       * cáo. `communityStatus` là nơi duy nhất biết quy tắc này.
       */
      if (otherOpen === 0) {
        restoredTo = communityStatus(request.game.trustedReportCount);
        if (restoredTo !== 'HIDDEN') {
          const back = await tx.game.updateMany({
            where: { id: request.game.id, status: 'HIDDEN' },
            data: { status: restoredTo },
          });
          restored = back.count === 1;
        }
      }
    }

    await tx.takedownRequest.update({
      where: { id: request.id },
      data: {
        status: accept ? 'ACCEPTED' : 'REJECTED',
        resolvedAt: new Date(),
        resolvedBy: adminId,
        resolutionNote: note,
      },
    });

    await tx.moderationLog.create({
      data: {
        gameId: request.game.id,
        actorId: adminId,
        action: accept ? 'TAKEDOWN_ACCEPT' : 'TAKEDOWN_REJECT',
        note: accept
          ? `Chấp nhận yêu cầu gỡ bản quyền — gỡ hẳn. ${note}`.trim()
          : `Bác bỏ yêu cầu gỡ bản quyền${restored ? ' — cho hiện lại' : ' — game vẫn ẩn vì lý do khác'}. ${note}`.trim(),
      },
    });
  });

  const gameUrl = `${appOrigin()}/game/${request.game.id}`;
  await Promise.allSettled([
    sendMail({
      to: request.claimantEmail,
      subject: `[KidoGame] Kết quả yêu cầu gỡ: ${request.game.title}`,
      text: accept
        ? [
            `Chào ${request.claimantName},`,
            '',
            `Chúng tôi đã xem lại yêu cầu của bạn và gỡ game "${request.game.title}" khỏi KidoGame.`,
            '',
            'Cảm ơn bạn đã báo cho chúng tôi.',
          ].join('\n')
        : [
            `Chào ${request.claimantName},`,
            '',
            `Chúng tôi đã xem lại yêu cầu của bạn với game "${request.game.title}"`,
            'và chưa đủ căn cứ để gỡ.',
            '',
            note || 'Nếu bạn có thêm bằng chứng về bản gốc, trả lời thư này giúp chúng tôi.',
          ].join('\n'),
    }),
    sendMail({
      to: request.game.child.parent.email,
      subject: accept
        ? `Game "${request.game.title}" của bé đã bị gỡ`
        : `Game "${request.game.title}" của bé đã được xem lại`,
      text: accept
        ? [
            'Chào bạn,',
            '',
            `Sau khi xem lại, chúng tôi xác nhận game "${request.game.title}" của bé`,
            `${request.game.child.displayName} có sử dụng nội dung của người khác, nên đã gỡ khỏi KidoGame.`,
            '',
            'Đây là chuyện rất hay gặp và không có nghĩa là bé làm gì sai về đạo đức —',
            'nhưng game đăng lên KidoGame cần là do chính bé làm ra.',
            '',
            `Điều khoản: ${appOrigin()}/dieu-khoan`,
          ].join('\n')
        : [
            'Chào bạn,',
            '',
            `Chúng tôi đã xem lại game "${request.game.title}" của bé ${request.game.child.displayName}`,
            'và thấy yêu cầu gỡ chưa đủ căn cứ.',
            '',
            restored && restoredTo === 'PUBLISHED'
              ? `Game đã hiện lại bình thường: ${gameUrl}`
              : restored
                ? `Game đã chơi lại được bằng link, nhưng vẫn chưa hiện trên trang chủ vì đang có báo cáo khác cần xem: ${gameUrl}`
                : 'Game hiện vẫn đang ẩn vì một lý do khác, bạn xem lại ở trang quản lý nhé.',
          ].join('\n'),
    }),
  ]).then((rs) => {
    for (const r of rs) {
      if (r.status === 'rejected') console.error('[takedown] không gửi được mail kết quả:', r.reason);
    }
  });

  return { restored };
}
