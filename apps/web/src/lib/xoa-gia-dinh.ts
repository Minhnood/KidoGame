/**
 * Xoá hẳn tài khoản của một gia đình — phụ huynh, các bé, và mọi game của các bé.
 *
 * VÌ SAO FILE NÀY TỒN TẠI. `/dieu-khoan` nói công khai: "Muốn xoá tài khoản của gia
 * đình bạn và toàn bộ game của các bé, email cho chúng tôi". Trước file này, lời hứa
 * đó không có đường thực hiện nào — người trực nhận thư xong chỉ còn cách gõ SQL tay
 * vào database production. Một lời hứa công khai mà chỉ thực hiện được bằng `psql`
 * thì trên thực tế là một lời hứa không thực hiện.
 *
 * VIỆC NÀY KHÔNG ĐẢO LẠI ĐƯỢC, và nó phá huỷ nhiều hơn mọi thao tác khác trong hệ
 * thống: gỡ game còn bảy ngày để đổi ý, còn cái này thì hàng DB đi ngay trong một
 * transaction. Đường cứu duy nhất là bản sao lưu.
 *
 * BỐN ĐIỀU DỄ LÀM SAI NẾU XOÁ TAY, và là lý do việc này phải là code chứ không phải
 * một câu SQL:
 *
 * 1. `LoginAttempt` KHÔNG có khoá ngoại. Cột `identity` của nó chứa `parent:<email>`
 *    và `child:<username>` ở dạng THÔ. Cascade không chạm tới nó, nên một lần xoá
 *    tay bằng `delete from "Parent"` để lại đúng thứ mà việc xoá nhằm bỏ đi: email
 *    và tên đăng nhập, nằm nguyên trong một bảng không ai nghĩ tới. Ở đây xoá tường
 *    minh, trong cùng transaction.
 *
 * 2. FILE TRÊN ĐĨA KHÔNG ĐƯỢC XOÁ Ở ĐÂY, và đó là cố ý. Storage địa chỉ hoá theo nội
 *    dung: hai game cùng `sb3Sha256` dùng CHUNG một file. Xoá file theo hash của game
 *    vừa xoá là xoá mất bản gốc của game nhà khác, im lặng. Sau khi hàng DB đi rồi
 *    thì file thành mồ côi và `storage:prune --xoa` dọn được an toàn, vì nó quét
 *    ngược từ DB. Đúng thứ tự mà `prune-removed.ts` đã dùng.
 *
 * 3. CHỤP TÊN GAME VÀO `TakedownRequest.gameTitle` TRƯỚC KHI XOÁ. Khoá ngoại bảng ấy
 *    là `SetNull` vì nó là hồ sơ pháp lý duy nhất của hệ thống. Không chụp thì hàng
 *    còn lại chỉ nói "có người khiếu nại một game nào đó" — càng xoá đúng thì hồ sơ
 *    càng vô dụng.
 *
 * 4. VẾT KIỂM DUYỆT CỦA VIỆC XOÁ KHÔNG ĐƯỢC TRỎ VÀO GIA ĐÌNH VỪA XOÁ. `ModerationLog`
 *    cascade theo cả `gameId` lẫn `childId`, nên một dòng vết trỏ vào bé vừa bị xoá
 *    sẽ tự bốc hơi trong chính transaction ghi ra nó. Dòng vết ở đây để CẢ HAI cột
 *    null — xem `ghiVet` bên dưới.
 */
import { AuthError } from './auth';
import { prisma } from './db';
import { sendMail } from './mail';
import { objectUrl } from './storage';

/** Nhãn cho vết kiểm duyệt. Khai ở `ACTION_LABEL` trong `moderation.ts`. */
export const ACTION_XOA_GIA_DINH = 'ADMIN_DELETE_FAMILY';

export interface GameSeMat {
  id: string;
  title: string;
  status: string;
  sb3Size: number;
  sb3Sha256: string;
}

export interface BeSeMat {
  id: string;
  displayName: string;
  username: string;
  isLocked: boolean;
  soGame: number;
}

/**
 * Những gì một lần xoá sẽ lấy đi, và những gì nó CỐ Ý để lại.
 *
 * Dùng chung cho cả chạy khô của script lẫn hộp xác nhận trên web: hai chỗ hỏi cùng
 * một câu — "bấm nút này thì mất gì" — nên chúng phải đọc từ cùng một truy vấn. Hai
 * bản đếm riêng là hai cơ hội để màn hình nói một đằng và transaction làm một nẻo.
 */
export interface ThongKeGiaDinh {
  parentId: string;
  email: string;
  isAdmin: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  bes: BeSeMat[];
  games: GameSeMat[];
  tongSb3Bytes: number;
  /** Hồ sơ khiếu nại bản quyền nhắm vào game của nhà này — GIỮ LẠI, chỉ chụp tên. */
  soHoSoNhamVao: number;
  /** Khiếu nại do CHÍNH phụ huynh này gửi đi, ký bằng email của họ — cũng giữ lại. */
  soHoSoTuGui: number;
  /** Hàng `LoginAttempt` còn mang email/username ở dạng thô. */
  soDauVetDangNhap: number;
}

/** Khoá của `LoginAttempt` cho một gia đình: phụ huynh, cộng mỗi bé một dòng. */
function khoaDangNhap(email: string, usernames: string[]): string[] {
  return [`parent:${email.toLowerCase()}`, ...usernames.map((u) => `child:${u.toLowerCase()}`)];
}

/**
 * Đọc toàn bộ những gì sẽ mất, KHÔNG xoá gì.
 *
 * Tìm theo email vì đó là thứ duy nhất người trực có trong tay: yêu cầu xoá đến bằng
 * một lá thư, và lá thư thì ký bằng email chứ không ký bằng cuid.
 */
export async function xemTruocXoaGiaDinh(emailRaw: string): Promise<ThongKeGiaDinh> {
  const email = emailRaw.trim().toLowerCase();
  const parent = await prisma.parent.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      emailVerifiedAt: true,
      createdAt: true,
      children: {
        select: {
          id: true,
          displayName: true,
          username: true,
          isLocked: true,
          _count: { select: { games: true } },
          games: {
            select: { id: true, title: true, status: true, sb3Size: true, sb3Sha256: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!parent) throw new AuthError('Không tìm thấy tài khoản phụ huynh với email này.');

  const games = parent.children.flatMap((c) => c.games);
  const gameIds = games.map((g) => g.id);

  const [soHoSoNhamVao, soHoSoTuGui, soDauVetDangNhap] = await Promise.all([
    gameIds.length === 0
      ? Promise.resolve(0)
      : prisma.takedownRequest.count({ where: { gameId: { in: gameIds } } }),
    prisma.takedownRequest.count({ where: { claimantEmail: email } }),
    prisma.loginAttempt.count({
      where: { identity: { in: khoaDangNhap(email, parent.children.map((c) => c.username)) } },
    }),
  ]);

  return {
    parentId: parent.id,
    email: parent.email,
    isAdmin: parent.isAdmin,
    emailVerifiedAt: parent.emailVerifiedAt,
    createdAt: parent.createdAt,
    bes: parent.children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      username: c.username,
      isLocked: c.isLocked,
      soGame: c._count.games,
    })),
    games,
    tongSb3Bytes: games.reduce((t, g) => t + g.sb3Size, 0),
    soHoSoNhamVao,
    soHoSoTuGui,
    soDauVetDangNhap,
  };
}

/**
 * Link tải bản `.sb3` gốc của từng game, để người trực gửi cho phụ huynh TRƯỚC khi xoá.
 *
 * Không tự đính vào thư xác nhận: sau khi xoá, file thành mồ côi và lần
 * `storage:prune --xoa` kế tiếp sẽ dọn: một lá thư kèm link chết còn tệ hơn không có
 * link. Chỗ đúng để đưa link là lúc còn kịp — tức lần chạy khô.
 */
export function linkTaiSb3(tk: ThongKeGiaDinh): string[] {
  return tk.games.map((g) => objectUrl('sb3', g.sb3Sha256));
}

export class KhongXoaDuocAdmin extends AuthError {}

/**
 * Xoá thật. Trả về đúng bản thống kê đã đọc trước khi xoá.
 *
 * `adminId` chỉ để ghi vết — hàm này KHÔNG tự kiểm quyền, giống mọi hàm khác trong
 * `moderation.ts`: quyền kiểm ở server action và ở script, mỗi nơi một kiểu.
 */
export async function xoaGiaDinh(
  adminId: string,
  emailRaw: string,
  note: string
): Promise<ThongKeGiaDinh> {
  const tk = await xemTruocXoaGiaDinh(emailRaw);

  /*
   * TỪ CHỐI XOÁ TÀI KHOẢN ADMIN, bắt gỡ quyền trước.
   *
   * `ModerationLog.actorId` là chuỗi thường chứ không phải khoá ngoại, nên xoá một
   * admin không cascade gì cả — nó chỉ làm mọi dòng vết người đó từng ghi trên game
   * của NHÀ KHÁC mất chỗ tra ngược ra email, và hiện thành cuid trần. Tức là xoá một
   * tài khoản lại làm hỏng lịch sử của những gia đình không liên quan.
   *
   * Chặn ở đây chứ không ở tầng giao diện: script chạy được mà không đi qua giao diện.
   */
  if (tk.isAdmin) {
    throw new KhongXoaDuocAdmin(
      `${tk.email} đang có quyền quản trị. Gỡ quyền admin trước rồi xoá, ` +
        'không thì mọi vết kiểm duyệt người này từng ghi sẽ mất chỗ tra ra tên.'
    );
  }

  const khoa = khoaDangNhap(tk.email, tk.bes.map((b) => b.username));

  await prisma.$transaction(async (tx) => {
    /* Chụp tên game vào hồ sơ khiếu nại TRƯỚC khi cascade cắt `gameId` về null.
       Cùng lý do và cùng thứ tự với `prune-removed.ts`. Chỉ chụp hàng còn rỗng: hàng
       đã chụp rồi mang tên tại thời điểm nhận khiếu nại, và đó mới là tên đúng. */
    for (const g of tk.games) {
      await tx.takedownRequest.updateMany({
        where: { gameId: g.id, gameTitle: '' },
        data: { gameTitle: g.title },
      });
    }

    /* Vết kiểm duyệt: CẢ `gameId` LẪN `childId` để null.
       Trỏ vào bé hay game của nhà này thì dòng vết bị cascade xoá ngay trong chính
       transaction ghi ra nó, và việc phá huỷ lớn nhất hệ thống làm được sẽ không để
       lại dấu nào. Ghi số liệu vào `note` vì sau transaction thì không còn hàng nào
       để đếm lại.

       KHÔNG ghi email vào vết. Đây là một yêu cầu xoá dữ liệu; giữ lại chính cái
       định danh vừa được yêu cầu xoá, trong một bảng không bao giờ dọn, là làm hỏng
       việc mình vừa làm. Muốn đối chiếu "đã xoá theo yêu cầu nào" thì ghép lá thư
       yêu cầu với mốc thời gian ở đây. */
    await tx.moderationLog.create({
      data: {
        actorId: adminId,
        action: ACTION_XOA_GIA_DINH,
        note: [
          `${tk.bes.length} bé, ${tk.games.length} game`,
          note.trim(),
        ]
          .filter(Boolean)
          .join(' · '),
      },
    });

    /* `LoginAttempt` không có khoá ngoại nên cascade không chạm tới. Xoá tường minh,
       không thì email và username ở lại nguyên dạng thô. */
    await tx.loginAttempt.deleteMany({ where: { identity: { in: khoa } } });

    /* Một lệnh này kéo theo: Child, Game, Report, GameTag, ModerationLog của game và
       của bé, AuthToken, Session — tất cả `onDelete: Cascade` trong schema.
       `TakedownRequest` thì `SetNull`, nên hồ sơ khiếu nại ở lại như điều khoản đã
       nói. Phiên đăng nhập mất hiệu lực ngay vì hàng Session đi cùng. */
    await tx.parent.delete({ where: { id: tk.parentId } });
  });

  /*
   * THƯ XÁC NHẬN, gửi NGOÀI transaction và nuốt lỗi.
   *
   * Việc xoá đã xong và không đảo lại được; ném lỗi ở đây thì người trực thấy báo đỏ
   * cho một việc đã hoàn tất, và sẽ bấm lại — lần thứ hai báo "không tìm thấy tài
   * khoản", đúng lúc họ đang phân vân là lần đầu có ăn hay không.
   *
   * Vẫn gửi dù đây là yêu cầu của chính họ: một xác nhận là thứ duy nhất chứng minh
   * việc đã làm, và địa chỉ này vừa mới bị xoá khỏi hệ thống nên đây là lần cuối
   * chúng ta còn gửi tới nó được.
   */
  await sendMail({
    to: tk.email,
    subject: 'Tài khoản KidoGame của gia đình bạn đã được xoá',
    text: [
      'Chào bạn,',
      '',
      'Theo yêu cầu, chúng tôi đã xoá tài khoản KidoGame của gia đình bạn.',
      '',
      `Đã xoá: tài khoản phụ huynh, ${tk.bes.length} tài khoản của bé, ` +
        `và ${tk.games.length} game các bé đã đăng.`,
      'Các game này không còn xem được nữa, kể cả bằng link trực tiếp.',
      '',
      'Việc này không đảo lại được. Nếu bé muốn quay lại KidoGame, bạn đăng ký một',
      'tài khoản mới và đăng lại từ file .sb3 mà bé giữ trên máy.',
      '',
      tk.soHoSoTuGui + tk.soHoSoNhamVao > 0
        ? 'Riêng hồ sơ của các yêu cầu gỡ theo bản quyền thì ở lại, không kèm tài khoản\n' +
          'của bạn nữa — như /dieu-khoan đã nói. Đó là hồ sơ pháp lý của việc đã xử lý.'
        : '',
      '',
      'Nếu bạn KHÔNG phải người yêu cầu việc này, trả lời thư này ngay giúp chúng tôi.',
      '',
      'KidoGame',
    ]
      .filter((d, i, a) => !(d === '' && a[i - 1] === ''))
      .join('\n'),
  }).catch((e) => console.error('[xoa-gia-dinh] không gửi được thư xác nhận:', e));

  return tk;
}

/** Số byte cho người đọc. Dùng ở cả script lẫn hộp xác nhận. */
export function doLon(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
