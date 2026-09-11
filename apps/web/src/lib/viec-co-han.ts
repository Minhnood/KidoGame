/**
 * Việc CÓ ĐỒNG HỒ CHẠY — thứ mà bỏ lỡ thì không đảo lại được.
 *
 * VÌ SAO LÀ MỘT FILE RIÊNG, dùng chung giữa tab Tổng quan và thư nhắc hằng đêm: hai
 * chỗ tự tính "cái nào sắp muộn" là hai câu trả lời khác nhau cho cùng một câu hỏi,
 * và lệch ở đây nghĩa là màn hình nói không có việc gấp trong khi lá thư nói có ba —
 * người trực sẽ tin cái nào tiện hơn. Cùng lý do đã tách `ACTION_LABEL` sang
 * `moderation.ts`.
 *
 * BA THỨ, KHÔNG PHẢI MƯỜI HAI. Tab Tổng quan có mười hai ô số; ở đây chỉ có những ô
 * mang một cái hạn:
 *
 *  - Yêu cầu gỡ bản quyền quá hạn trả lời, và sắp tới hạn. Hạn này được hứa CÔNG KHAI
 *    ở `/dieu-khoan` và `/bao-cao-ban-quyen`, nên nó là nghĩa vụ chứ không phải mong
 *    muốn nội bộ.
 *  - Game đã gỡ sắp bị xoá hẳn. Sau hạn thì nút "Cho hiện lại" không còn gì để hiện
 *    lại — việc duy nhất trong khu quản trị mà bỏ lỡ là mất vĩnh viễn.
 *
 * "Game bị hệ thống tự siết mà chưa ai xem" CỐ Ý không có ở đây dù nó cũng là việc
 * đang chờ: nó không có hạn nào, và một lá thư nhắc mà mang cả việc thường thì thành
 * bản tin hằng ngày — thứ người ta học cách bỏ qua, rồi bỏ qua luôn cái đêm nó có
 * việc thật.
 *
 * ═══ BÁO CÁO CHỜ QUÁ LÂU — nhóm thứ ba, thêm sau ═══
 *
 * Báo cáo của người dùng KHÔNG có hạn nào cả, nên theo đúng lập luận trên thì nó
 * không thuộc về đây. Nhưng lập luận trên giả định một điều đã hoá ra không đúng:
 * rằng có người mở khu quản trị đều đặn. Không có ai. Trang chạy công khai từ 8/9 và
 * hàng đợi chưa từng có người trực, nên một báo cáo nằm đó là nằm đó VÔ HẠN — trên
 * một trang mà nội dung bị báo cáo có thể là thứ không an toàn cho trẻ con.
 *
 * Cách thoát không phải là nhắc mọi báo cáo (đúng là sẽ thành bản tin, và `Report`
 * khác `TakedownRequest` ở chỗ nó gần như luôn khác 0 trên một trang đang sống). Cách
 * thoát là TỰ ĐẶT một cái đồng hồ: chỉ nhắc báo cáo đã chờ quá `BAO_CAO_CHO_QUA_NGAY`
 * ngày. Báo cáo hôm nay không sinh ra lá thư nào; báo cáo bị quên hai ngày thì có.
 *
 * Nói cách khác, nhóm này không phá quy tắc "chỉ việc có hạn" — nó thừa nhận rằng
 * một việc đáng làm mà không ai đặt hạn cho thì phải tự đặt, chứ không phải bỏ mặc.
 */
import { prisma } from './db';
import { NGAY_GIU_GAME_DA_GO } from './moderation';
import { slaDueAt } from './operator';

/** Số ngày trước hạn xoá hẳn thì coi là "cửa sổ cứu sắp đóng". */
export const SAP_XOA_NGAY = 2;

/**
 * Bao nhiêu ngày làm việc trước hạn SLA thì bắt đầu nhắc.
 *
 * Nhắc TRƯỚC chứ không chỉ nhắc khi đã muộn: một lá thư nói "yêu cầu này đã quá hạn"
 * là một lá thư báo tin đã mất, còn hạn được hứa công khai thì giá trị nằm ở chỗ giữ
 * được nó. Một ngày làm việc là đủ để đọc và trả lời một khiếu nại, và đủ ngắn để
 * hộp thư không nhận thư về cùng một việc bốn đêm liền.
 */
export const NHAC_TRUOC_NGAY_LAM_VIEC = 1;

/**
 * Báo cáo chờ quá bao nhiêu ngày thì coi là bị bỏ quên.
 *
 * Hai ngày, và cả hai đầu đều có lý do. Ngắn hơn thì báo cáo gửi tối qua đã sinh thư
 * sáng nay, tức là thư gửi gần như mỗi đêm và người ta học cách xoá nó chưa đọc.
 * Dài hơn thì một game bị báo cáo vì nội dung không an toàn nằm trước mặt trẻ con
 * hết cả tuần trước khi có ai nghe thấy gì.
 *
 * Đây là NGÀY THƯỜNG, không phải ngày làm việc như hạn bản quyền: hạn kia là nghĩa
 * vụ pháp lý hứa công khai nên đếm theo ngày làm việc là đúng, còn cái này là an
 * toàn của trẻ con, và cuối tuần thì trẻ con lên mạng nhiều hơn chứ không ít hơn.
 */
export const BAO_CAO_CHO_QUA_NGAY = 2;

export interface YeuCauGo {
  id: string;
  gameTitle: string;
  claimantEmail: string;
  createdAt: Date;
  han: Date;
}

export interface GameSapXoa {
  id: string;
  title: string;
  removedAt: Date;
  han: Date;
  tenBe: string;
}

export interface BaoCaoCho {
  id: string;
  gameId: string;
  gameTitle: string;
  reason: string;
  createdAt: Date;
  /** Đã chờ bao nhiêu ngày, làm tròn xuống. */
  soNgayCho: number;
}

export interface ViecCoHan {
  luc: Date;
  goQuaHan: YeuCauGo[];
  goSapToiHan: YeuCauGo[];
  /** Còn hạn và chưa tới ngưỡng nhắc. Ba nhóm `go*` rời nhau và cộng lại là hàng đợi. */
  goConHan: YeuCauGo[];
  gameSapXoa: GameSapXoa[];
  /** Game đã quá hạn giữ — lượt dọn kế tiếp sẽ xoá hẳn chúng. */
  gameQuaHanXoa: GameSapXoa[];
  /** Báo cáo đang mở đã chờ quá `BAO_CAO_CHO_QUA_NGAY` ngày. Cũ nhất trước. */
  baoCaoChoLau: BaoCaoCho[];
  /** Tổng báo cáo đang mở, kể cả những cái chưa tới ngưỡng nhắc. */
  baoCaoDangMo: number;
  /** Yêu cầu đang mở cũ nhất, hoặc null. Đọc ở đây để không phải sắp xếp lại ở nơi dùng. */
  cuNhat: Date | null;
}

/** Có việc nào không đảo lại được đang chờ? Dùng cho dòng "Không có việc gấp". */
export function coViecGap(v: ViecCoHan): boolean {
  return (
    v.goQuaHan.length + v.gameSapXoa.length + v.gameQuaHanXoa.length + v.baoCaoChoLau.length > 0
  );
}

export async function docViecCoHan(bayGio = new Date()): Promise<ViecCoHan> {
  /*
   * Mốc so cho hạn xoá hẳn, tính NGƯỢC từ `removedAt` chứ không xuôi từ hôm nay:
   * game quá hạn là game có `removedAt` cũ hơn N ngày. Cùng phép so mà
   * `prisma/prune-removed.ts` dùng, nên ba chỗ không thể lệch nhau.
   */
  const mocQuaHanXoa = new Date(bayGio.getTime() - NGAY_GIU_GAME_DA_GO * 86400_000);
  const mocSapXoa = new Date(
    bayGio.getTime() - (NGAY_GIU_GAME_DA_GO - SAP_XOA_NGAY) * 86400_000
  );

  /* Mốc cho báo cáo bị bỏ quên, cũng tính NGƯỢC từ `createdAt` — báo cáo cũ hơn mốc
     này là báo cáo đã chờ quá lâu. Cùng lối viết với hai mốc trên để ba phép so
     không thể lệch nhau. */
  const mocBaoCao = new Date(bayGio.getTime() - BAO_CAO_CHO_QUA_NGAY * 86400_000);

  const [go, sapXoa, quaHanXoa, baoCao, baoCaoDangMo] = await Promise.all([
    /* Lấy cả `createdAt` chứ không chỉ đếm: hạn SLA tính theo ngày làm việc nên phải
       tính từng dòng, không có phép so nào trong SQL làm được việc đó. Hàng đợi này
       cố ý không phân trang và luôn nhỏ — nếu nó lớn thì bản thân điều đó đã là sự cố. */
    prisma.takedownRequest.findMany({
      where: { status: 'OPEN' },
      select: { id: true, gameTitle: true, claimantEmail: true, createdAt: true, game: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.game.findMany({
      where: { status: 'REMOVED', removedAt: { not: null, lte: mocSapXoa, gt: mocQuaHanXoa } },
      select: { id: true, title: true, removedAt: true, child: { select: { displayName: true } } },
      orderBy: { removedAt: 'asc' },
    }),
    prisma.game.findMany({
      where: { status: 'REMOVED', removedAt: { lte: mocQuaHanXoa } },
      select: { id: true, title: true, removedAt: true, child: { select: { displayName: true } } },
      orderBy: { removedAt: 'asc' },
    }),
    /* Chỉ báo cáo đã quá ngưỡng. Lấy danh sách chứ không đếm, vì lá thư phải nói
       được nó nhắc về game nào — "3 báo cáo đang chờ" thì người đọc vẫn phải mở khu
       quản trị ra mới biết có đáng dậy đi xem ngay không. */
    prisma.report.findMany({
      where: { status: 'OPEN', createdAt: { lte: mocBaoCao } },
      select: { id: true, gameId: true, reason: true, createdAt: true, game: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.report.count({ where: { status: 'OPEN' } }),
  ]);

  /* `gameTitle` chỉ được chụp lúc game bị xoá hẳn, nên với yêu cầu còn mở thì nó rỗng
     và tên thật nằm ở quan hệ `game`. Đọc cả hai rồi lấy cái nào có: một lá thư nhắc
     mà ghi tên game trống thì không nói được nó nhắc về việc nào. */
  const tenGame = (r: { gameTitle: string; game: { title: string } | null }) =>
    r.game?.title || r.gameTitle || '(game đã bị xoá)';

  const hanNhac = slaDueAt(bayGio, NHAC_TRUOC_NGAY_LAM_VIEC);

  const mapGo = (r: (typeof go)[number]): YeuCauGo => ({
    id: r.id,
    gameTitle: tenGame(r),
    claimantEmail: r.claimantEmail,
    createdAt: r.createdAt,
    han: slaDueAt(r.createdAt),
  });

  const mapGame = (g: (typeof sapXoa)[number]): GameSapXoa => ({
    id: g.id,
    title: g.title,
    removedAt: g.removedAt as Date,
    han: new Date((g.removedAt as Date).getTime() + NGAY_GIU_GAME_DA_GO * 86400_000),
    tenBe: g.child.displayName,
  });

  const tatCaGo = go.map(mapGo);

  return {
    luc: bayGio,
    goQuaHan: tatCaGo.filter((r) => r.han < bayGio),
    /* Ba nhóm RỜI NHAU và cộng lại đúng bằng hàng đợi đang mở, để một yêu cầu không
       đếm hai lần trong cùng một lá thư — và để ô "đang mở" trên tab Tổng quan vẫn
       cộng ra đúng con số nó vẫn hiện. Có phép kiểm canh bằng phép cộng. */
    goSapToiHan: tatCaGo.filter((r) => r.han >= bayGio && r.han <= hanNhac),
    goConHan: tatCaGo.filter((r) => r.han > hanNhac),
    gameSapXoa: sapXoa.map(mapGame),
    gameQuaHanXoa: quaHanXoa.map(mapGame),
    baoCaoChoLau: baoCao.map((r) => ({
      id: r.id,
      gameId: r.gameId,
      /* Game bị xoá hẳn thì `Report` đi theo (cascade), nên `game` không bao giờ null
         trên hàng còn sống. Vẫn đỡ một nhịp thay vì tin điều đó — một lá thư nhắc ghi
         tên game trống thì không nói được nó nhắc về việc gì. */
      gameTitle: r.game?.title || '(không đọc được tên game)',
      reason: r.reason,
      createdAt: r.createdAt,
      soNgayCho: Math.floor((bayGio.getTime() - r.createdAt.getTime()) / 86400_000),
    })),
    baoCaoDangMo,
    cuNhat: tatCaGo[0]?.createdAt ?? null,
  };
}
