/**
 * Thư tuần — lá thư DUY NHẤT của hệ thống gửi kể cả khi không có gì xảy ra.
 *
 * ═══ VẤN ĐỀ NÓ GIẢI QUYẾT: IM LẶNG CÓ HAI NGHĨA ═══
 *
 * Hai kênh báo động đang có đều im khi mọi thứ tốt — `nhac-viec-co-han` chỉ gửi khi
 * có việc có hạn, `canh-gac` chỉ gửi khi có vấn đề. Thiết kế đó đúng, và lý do nằm
 * trong chính hai file ấy: một lá thư gửi mỗi đêm dù không có tin gì sẽ dạy người
 * nhận xoá nó chưa đọc, rồi xoá luôn cái đêm nó mang tin thật.
 *
 * Nhưng nó để lại một lỗ: từ phía hòm thư, **"tuần này không có việc gì"** và
 * **"SMTP chết từ thứ Ba"** trông giống hệt nhau. Cả hệ thống giám sát ba tầng có
 * thể đã tắt ngóm mà mọi thứ vẫn "yên tĩnh" đúng như khi nó chạy tốt. Không màn hình
 * nào bày ra điều đó, vì bản thân cái bày ra cũng đi bằng đường thư ấy.
 *
 * ═══ VÌ SAO THƯ NÀY KHÔNG RƠI VÀO ĐÚNG CÁI BẪY NÓ ĐANG TRÁNH ═══
 *
 * Một lá "tôi vẫn sống" trống rỗng thì đúng là thứ người ta học cách xoá. Nên thư
 * này mang thứ chủ dự án thật sự muốn biết mà hiện không có chỗ nào nói: tuần qua có
 * bao nhiêu bé mới, bao nhiêu game mới, các bé khen nhau bao nhiêu lần. Nó là báo
 * cáo sản phẩm, và việc nó chứng minh đường thư còn sống là tác dụng phụ.
 *
 * Đổi lại, luật đọc thư đảo ngược so với hai kênh kia, và phải nói thẳng trong chính
 * thân thư: ở đây **VẮNG thư mới là tín hiệu xấu**.
 *
 * MỘT LẦN MỖI TUẦN, không phải mỗi ngày: đủ thưa để vẫn được đọc, đủ dày để một
 * đường thư chết không nằm im quá lâu.
 *
 * Tắt: đặt `THU_TUAN=off` trong `infra/.env`.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web db:thu-tuan          # chỉ in
 *   pnpm --filter @kidogame/web db:thu-tuan --gui    # gửi thật
 *   … --bat-ke-thu   # bỏ qua chốt "chỉ chạy đúng thứ", để thử
 */
import { PrismaClient } from '@prisma/client';
import { sendMail } from '../src/lib/mail';
import { isOperatorConfigured, laDiaChiChet, operator } from '../src/lib/operator';
import { docViecCoHan } from '../src/lib/viec-co-han';

const prisma = new PrismaClient();

const guiThat = process.argv.includes('--gui');
const batKeThu = process.argv.includes('--bat-ke-thu');

/**
 * Thứ trong tuần để gửi, 1 = thứ Hai.
 *
 * Thứ Hai vì báo cáo nói về tuần VỪA QUA, và tuần vừa qua chỉ trọn vẹn khi tuần mới
 * đã bắt đầu. Gửi Chủ nhật là gửi một tuần còn thiếu một ngày, mỗi tuần.
 */
const NGAY_GUI = Number(process.env.THU_TUAN_NGAY ?? '1');

function ngayVi(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

interface Mang {
  gameMoi: number;
  beMoi: number;
  giaDinhMoi: number;
  luotChoi: number;
  icon: number;
  loiNhan: number;
  theoDoi: number;
  tongGameDangHien: number;
  tongBe: number;
}

async function doTuan(tu: Date): Promise<Mang> {
  const [gameMoi, beMoi, giaDinhMoi, icon, loiNhan, theoDoi, tongGameDangHien, tongBe, choi] =
    await Promise.all([
      prisma.game.count({ where: { createdAt: { gte: tu } } }),
      prisma.child.count({ where: { createdAt: { gte: tu } } }),
      prisma.parent.count({ where: { createdAt: { gte: tu } } }),
      prisma.reaction.count({ where: { createdAt: { gte: tu } } }),
      prisma.compliment.count({ where: { createdAt: { gte: tu } } }),
      prisma.follow.count({ where: { createdAt: { gte: tu } } }),
      prisma.game.count({ where: { status: 'PUBLISHED' } }),
      prisma.child.count(),
      /*
       * `playCount` là cột dồn, không có mốc thời gian — nên KHÔNG đếm được "lượt
       * chơi trong tuần" từ nó. Báo tổng và nói rõ đó là tổng, thay vì trừ hai lần
       * đọc rồi gọi là số tuần: không có chỗ nào lưu số của tuần trước, nên phép trừ
       * ấy sẽ là một con số bịa nhìn rất thuyết phục.
       */
      prisma.game.aggregate({ _sum: { playCount: true } }),
    ]);

  return {
    gameMoi,
    beMoi,
    giaDinhMoi,
    luotChoi: choi._sum.playCount ?? 0,
    icon,
    loiNhan,
    theoDoi,
    tongGameDangHien,
    tongBe,
  };
}

function thanThu(m: Mang, tu: Date, den: Date, viec: Awaited<ReturnType<typeof docViecCoHan>>): string {
  const d: string[] = [];
  const soGoDangMo = viec.goQuaHan.length + viec.goSapToiHan.length + viec.goConHan.length;

  d.push(`Tuần ${ngayVi(tu)} – ${ngayVi(den)}`, '');

  if (m.gameMoi + m.beMoi + m.giaDinhMoi === 0) {
    /*
     * Nói thẳng khi không có ai mới, và nói tại sao điều đó đáng chú ý. Một bảng
     * toàn số 0 mà không có câu này thì đọc như báo cáo hỏng, và người đọc sẽ đi
     * kiểm script thay vì kiểm sản phẩm.
     */
    d.push(
      'KHÔNG có gia đình, bé hay game nào mới trong tuần.',
      'Hệ thống chạy bình thường — đây là con số về NGƯỜI DÙNG, không phải về máy.',
      ''
    );
  }

  d.push(
    'Tuần qua:',
    `  · ${m.giaDinhMoi} gia đình mới, ${m.beMoi} bé mới`,
    `  · ${m.gameMoi} game mới`,
    `  · ${m.icon} lượt thả icon, ${m.loiNhan} lời nhắn, ${m.theoDoi} lượt theo dõi`,
    '',
    'Tổng cộng tới giờ:',
    `  · ${m.tongGameDangHien} game đang hiện, ${m.tongBe} bé`,
    `  · ${m.luotChoi} lượt chơi (cột dồn từ đầu, không phải của riêng tuần này)`,
    ''
  );

  if (soGoDangMo > 0 || viec.baoCaoDangMo > 0) {
    d.push(
      'Hàng đợi quản trị:',
      `  · ${soGoDangMo} yêu cầu gỡ bản quyền đang mở`,
      `  · ${viec.baoCaoDangMo} báo cáo đang mở (${viec.baoCaoChoLau.length} đã quá hạn nhắc)`,
      ''
    );
  } else {
    d.push('Hàng đợi quản trị: rỗng.', '');
  }

  d.push(
    '───',
    'Thư này gửi MỖI TUẦN dù có tin hay không, và đó là chủ ý.',
    '',
    'Hai lá thư kia — nhắc việc có hạn và canh máy chủ — chỉ gửi khi CÓ chuyện, nên',
    'im lặng của chúng là tin tốt. Nhưng im lặng cũng là thứ xảy ra khi đường gửi thư',
    'chết, và từ hòm thư thì hai điều đó giống hệt nhau.',
    '',
    'Với lá thư này thì ngược lại: KHÔNG nhận được nó vào đầu tuần mới là dấu hiệu',
    'xấu. Lúc đó hãy tự mở trang quản trị, đừng chờ thêm.',
    '',
    'Tắt: đặt THU_TUAN=off trong infra/.env.',
    '',
    'KidoGame',
  );
  return d.join('\n');
}

async function main() {
  if ((process.env.THU_TUAN ?? '').trim().toLowerCase() === 'off') {
    console.log('[thu-tuan] THU_TUAN=off — bỏ qua.');
    return;
  }

  const bayGio = new Date();
  /*
   * Chốt "đúng thứ" nằm TRONG script chứ không trong `prune.sh`, cố ý: bước gọi nó
   * chạy mỗi đêm, và một lịch tuần viết bằng `if` trong shell là chỗ dễ sai mà không
   * ai kiểm. Ở đây nó kiểm được bằng `--bat-ke-thu`.
   */
  if (!batKeThu && bayGio.getDay() !== NGAY_GUI) {
    console.log(
      `[thu-tuan] hôm nay là thứ ${bayGio.getDay() === 0 ? 'CN' : bayGio.getDay() + 1}, ` +
        `chỉ gửi vào thứ ${NGAY_GUI === 0 ? 'CN' : NGAY_GUI + 1} — bỏ qua.`
    );
    return;
  }

  const tu = new Date(bayGio.getTime() - 7 * 86400_000);
  const [m, viec] = await Promise.all([doTuan(tu), docViecCoHan(bayGio)]);

  const tieuDe =
    m.gameMoi + m.beMoi > 0
      ? `[KidoGame] Tuần này: ${m.gameMoi} game mới, ${m.beMoi} bé mới`
      : '[KidoGame] Báo cáo tuần — chưa có ai mới';

  console.log(`[thu-tuan] ${tieuDe}`);
  console.log(thanThu(m, tu, bayGio, viec));

  if (!guiThat) {
    console.log('\n[thu-tuan] chỉ in: chưa gửi gì. Thêm --gui để gửi thật.');
    return;
  }

  // Cùng chốt với hai script kia: "liên hệ được", không phải "có gõ gì đó vào biến".
  if (!isOperatorConfigured()) {
    const email = process.env.OPERATOR_EMAIL?.trim();
    console.error('[thu-tuan] chưa có địa chỉ nhận được thư — không gửi.');
    if (email && laDiaChiChet(email)) {
      console.error(`OPERATOR_EMAIL đang là ${email} — đuôi tên miền đó không nhận được thư.`);
    }
    process.exitCode = 2;
    return;
  }

  const nguoiNhan = operator();
  await sendMail({ to: nguoiNhan.email, subject: tieuDe, text: thanThu(m, tu, bayGio, viec) });
  console.log(`[thu-tuan] đã gửi tới ${nguoiNhan.email}`);
}

main()
  .catch((e) => {
    console.error('[thu-tuan]', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
