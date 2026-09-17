/**
 * Xoá những file trong `storage/` mà không Game nào còn trỏ tới.
 *
 * VÌ SAO CẦN. Storage địa chỉ hoá theo nội dung, nên đóng gói lại một game sinh ra
 * một file MỚI với hash mới, và file cũ nằm lại mãi. `db:repackage` cố ý không xoá
 * bản cũ: nhiều game có thể trỏ chung một hash, nên xoá theo từng game là xoá mất
 * file của game khác. Hệ quả đo được: 307 file trong `storage/html` chiếm 547 MB
 * cho 8 game đang dùng 8 hash — trong đó có cả những bản HTML 1,8 MB từ trước khi
 * tách runtime.
 *
 * Chạy:
 *   pnpm --filter @kidogame/web storage:prune          # chỉ ĐO, không xoá gì
 *   pnpm --filter @kidogame/web storage:prune --xoa    # xoá thật
 *
 * Mặc định là chạy khô. Đây là công cụ xoá file theo một truy vấn DB, nên mặc định
 * phải là "cho tôi xem trước".
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db';

type Bucket = 'sb3' | 'html' | 'thumb' | 'runtime';

const EXT: Record<Bucket, string> = {
  sb3: '.sb3',
  html: '.html',
  thumb: '.webp',
  runtime: '.js',
};

function storageRoot(): string {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR ?? '../../storage');
}

const xoaThat = process.argv.includes('--xoa');

const kb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * File sửa trong chừng này giờ thì KHÔNG dọn, dù chưa Game nào trỏ tới.
 *
 * Vì bước xem thử: bé chọn file, server ghi đủ bốn file lên đĩa để player chạy bản thử,
 * nhưng Game chỉ được tạo khi bé bấm Đăng. Trong lúc đó các file ấy trông y hệt rác, và
 * lượt dọn 4 giờ sáng sẽ xoá mất bản thử đang chơi dở. Phải lớn hơn `HAN_XEM_THU_MS`
 * (2 giờ) trong `src/lib/ingest.ts`; `putObject` chạm lại giờ sửa khi dùng lại file cũ.
 */
const GIU_FILE_MOI_GIO = 6;

/** Bản xem thử (JSON) quá chừng này giờ thì chắc chắn đã hết hạn, dọn luôn. */
const XOA_XEM_THU_SAU_GIO = 24;

async function main() {
  const games = await prisma.game.findMany({
    select: { sb3Sha256: true, htmlSha256: true, thumbSha256: true, runtimeSha256: true },
  });

  /*
   * CHỐT AN TOÀN QUAN TRỌNG NHẤT của script này.
   *
   * Tập "đang dùng" đến từ một truy vấn DB. Chạy với `DATABASE_URL` trỏ sang một DB
   * khác, hoặc sang một DB vừa dựng còn rỗng, thì tập đó rỗng và MỌI file trong
   * storage trở thành rác — script sẽ xoá sạch game của tất cả các bé trong một
   * lệnh. Đúng loại tai nạn không hoàn tác được, nên dừng thẳng.
   *
   * Storage rỗng thật thì cũng chẳng có gì để dọn, nên chốt này không chặn oan
   * trường hợp nào có ích.
   */
  if (games.length === 0) {
    console.error('DỪNG: DB không có Game nào.');
    console.error('Không xoá gì cả — tập hash đang dùng mà rỗng thì mọi file đều trông như rác,');
    console.error('và đó gần như luôn là dấu hiệu DATABASE_URL trỏ sai chỗ, không phải storage sạch.');
    console.error(`DATABASE_URL đang dùng: ${(process.env.DATABASE_URL ?? '(chưa đặt)').replace(/:[^:@/]*@/, ':***@')}`);
    process.exitCode = 2;
    return;
  }

  const dangDung: Record<Bucket, Set<string>> = {
    sb3: new Set(),
    html: new Set(),
    thumb: new Set(),
    runtime: new Set(),
  };
  for (const g of games) {
    if (g.sb3Sha256) dangDung.sb3.add(g.sb3Sha256);
    if (g.htmlSha256) dangDung.html.add(g.htmlSha256);
    if (g.thumbSha256) dangDung.thumb.add(g.thumbSha256);
    if (g.runtimeSha256) dangDung.runtime.add(g.runtimeSha256);
  }

  const root = storageRoot();
  console.log(`storage: ${root}`);
  console.log(`${games.length} game trong DB\n`);

  let tongFile = 0;
  let tongByte = 0;
  const mocMoi = Date.now() - GIU_FILE_MOI_GIO * 60 * 60 * 1000;

  for (const bucket of Object.keys(EXT) as Bucket[]) {
    const thungDir = path.join(root, bucket);
    let thuMucCon: string[];
    try {
      thuMucCon = await fs.readdir(thungDir);
    } catch {
      console.log(`${bucket.padEnd(8)} (không có thư mục, bỏ qua)`);
      continue;
    }

    const rac: { duongDan: string; bytes: number }[] = [];
    let soFile = 0;
    let byteDung = 0;
    let soMoi = 0;

    for (const con of thuMucCon) {
      const conDir = path.join(thungDir, con);
      let files: string[];
      try {
        files = await fs.readdir(conDir);
      } catch {
        continue; // không phải thư mục
      }

      for (const ten of files) {
        /*
         * Chỉ nhận đúng dạng file mà `objectPath` sinh ra: 64 ký tự hex cộng đuôi
         * của thùng, và nằm trong thư mục con bằng hai ký tự đầu của hash. File
         * nào khác thì KHÔNG phải do hệ thống này tạo, nên cũng không phải việc
         * của nó mà xoá.
         */
        const khop = new RegExp(`^([0-9a-f]{64})${EXT[bucket].replace('.', '\\.')}$`).exec(ten);
        if (!khop || khop[1].slice(0, 2) !== con) continue;

        soFile += 1;
        const duongDan = path.join(conDir, ten);
        const st = await fs.stat(duongDan);

        if (dangDung[bucket].has(khop[1])) byteDung += st.size;
        else if (st.mtimeMs > mocMoi) soMoi += 1;
        else rac.push({ duongDan, bytes: st.size });
      }
    }

    const byteRac = rac.reduce((s, r) => s + r.bytes, 0);
    tongFile += rac.length;
    tongByte += byteRac;

    console.log(
      `${bucket.padEnd(8)} ${String(soFile).padStart(4)} file · ` +
        `${String(dangDung[bucket].size).padStart(3)} hash đang dùng (${kb(byteDung)}) · ` +
        `${String(rac.length).padStart(4)} rác (${kb(byteRac)}) · ` +
        `${String(soMoi).padStart(3)} mới dưới ${GIU_FILE_MOI_GIO} giờ (chừa lại)`
    );

    if (xoaThat) {
      for (const r of rac) await fs.unlink(r.duongDan);
      // Thư mục con rỗng sau khi xoá thì bỏ luôn, không thì còn lại 256 thư mục rỗng.
      for (const con of thuMucCon) {
        const conDir = path.join(thungDir, con);
        try {
          if ((await fs.readdir(conDir)).length === 0) await fs.rmdir(conDir);
        } catch {
          /* không phải thư mục, hoặc vừa bị xoá */
        }
      }
    }
  }

  /* Bản xem thử bé không bấm Đăng. File JSON nhỏ, nhưng không dọn thì mỗi lần xem thử để
     lại một cái mãi mãi. Chỉ đụng đúng dạng tên mà `taoBanXemThu` sinh ra. */
  let xemThuCu = 0;
  const xemThuDir = path.join(root, 'xem-thu');
  const mocXemThu = Date.now() - XOA_XEM_THU_SAU_GIO * 60 * 60 * 1000;
  try {
    for (const ten of await fs.readdir(xemThuDir)) {
      if (!/^[A-Za-z0-9_-]{32}\.json(\.dang-[0-9a-f]{12})?$/.test(ten)) continue;
      const duongDan = path.join(xemThuDir, ten);
      if ((await fs.stat(duongDan)).mtimeMs > mocXemThu) continue;
      xemThuCu += 1;
      if (xoaThat) await fs.unlink(duongDan);
    }
  } catch {
    /* chưa ai xem thử lần nào */
  }
  console.log(`xem-thu  ${String(xemThuCu).padStart(4)} bản xem thử quá ${XOA_XEM_THU_SAU_GIO} giờ`);

  console.log('');
  if (xoaThat) console.log(`Đã xoá ${tongFile} file, giải phóng ${kb(tongByte)}.`);
  else console.log(`Sẽ xoá ${tongFile} file, giải phóng ${kb(tongByte)}. Thêm --xoa để làm thật.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
