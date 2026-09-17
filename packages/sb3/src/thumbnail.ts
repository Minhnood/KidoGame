import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { ZipEntry } from './zip.js';
import type { ProjectJson } from './validate.js';
import { Sb3Error } from './errors.js';

export const THUMB_WIDTH = 480;
export const THUMB_HEIGHT = 360;

/**
 * Trần pixel khi rasterize. Một SVG khai báo width/height khổng lồ có thể làm
 * librsvg cấp phát bộ nhớ rất lớn — đây là chốt chặn.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/** Nền dự phòng khi không rasterize được gì (màu brand). */
const FALLBACK_BG = { r: 27, g: 27, b: 50, alpha: 1 };

function assetRef(a: { md5ext?: string; assetId?: string; dataFormat?: string }): string | null {
  if (a.md5ext) return a.md5ext;
  if (a.assetId && a.dataFormat) return `${a.assetId}.${a.dataFormat}`;
  return null;
}

/**
 * Rasterize một asset về ảnh raster, chịu được file hỏng.
 *
 * SVG của Scratch hay khai báo kích thước rất nhỏ (backdrop trống là 2x2px), nên
 * phải nâng density thay vì phóng to ảnh đã rasterize — nếu không sẽ ra ảnh vỡ.
 */
async function rasterize(data: Buffer, maxW: number, maxH: number): Promise<Buffer | null> {
  const isSvg = data.subarray(0, 512).toString('utf8').trimStart().toLowerCase().startsWith('<svg');
  try {
    const base = sharp(data, {
      limitInputPixels: MAX_INPUT_PIXELS,
      // Với SVG nhỏ, density cao cho ra bản rasterize sắc nét.
      ...(isSvg ? { density: 300 } : {}),
    });

    const meta = await base.metadata();
    if (!meta.width || !meta.height) return null;

    return await base
      .resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
  } catch {
    // Asset hỏng thì bỏ qua — thumbnail không đáng để làm hỏng cả lần upload.
    return null;
  }
}

/** Rasterize có nhớ: cùng một asset dùng cho nhiều bìa thì chỉ rasterize một lần. */
type Raster = (ref: string | null, maxW: number, maxH: number) => Promise<Buffer | null>;

function taoRaster(entries: ZipEntry[]): Raster {
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const nho = new Map<string, Promise<Buffer | null>>();
  return (ref, maxW, maxH) => {
    if (!ref) return Promise.resolve(null);
    const data = byName.get(ref);
    if (!data) return Promise.resolve(null);
    const khoa = `${ref}:${maxW}x${maxH}`;
    if (!nho.has(khoa)) nho.set(khoa, rasterize(data, maxW, maxH));
    return nho.get(khoa)!;
  };
}

type Costume = { md5ext?: string; assetId?: string; dataFormat?: string };

/** Một bìa: nền phủ kín khung (hoặc màu brand), nhân vật ghép giữa, tối đa nửa khung. */
async function veBia(raster: Raster, nen: Costume | undefined, nhanVat: Costume | undefined): Promise<Buffer> {
  const backdropPng = await raster(nen ? assetRef(nen) : null, THUMB_WIDTH, THUMB_HEIGHT);

  let base: Sharp;
  if (backdropPng) {
    base = sharp(backdropPng).resize({
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      fit: 'cover',
      position: 'centre',
    });
  } else {
    base = sharp({
      create: {
        width: THUMB_WIDTH,
        height: THUMB_HEIGHT,
        channels: 4,
        background: FALLBACK_BG,
      },
    });
  }

  // Sprite ghép lên giữa, tối đa nửa khung để còn thấy nền.
  const spritePng = await raster(
    nhanVat ? assetRef(nhanVat) : null,
    Math.round(THUMB_WIDTH / 2),
    Math.round(THUMB_HEIGHT / 2)
  );

  try {
    if (spritePng) {
      base = sharp(await base.png().toBuffer()).composite([{ input: spritePng, gravity: 'centre' }]);
    }
    return await base.webp({ quality: 82 }).toBuffer();
  } catch {
    return sharp({
      create: { width: THUMB_WIDTH, height: THUMB_HEIGHT, channels: 4, background: FALLBACK_BG },
    })
      .webp({ quality: 82 })
      .toBuffer();
  }
}

/**
 * Sinh thumbnail từ nội dung .sb3: lấy backdrop của Stage làm nền, ghép costume
 * đầu tiên của sprite đầu tiên lên trên.
 *
 * Không bao giờ ném lỗi — thumbnail chỉ là trang trí. Trả về ảnh nền màu brand
 * nếu không rasterize được gì. Đây là lý do không bắt trẻ tự upload ảnh đại diện.
 */
export async function renderThumbnail(entries: ZipEntry[], project: ProjectJson): Promise<Buffer> {
  const targets = project.targets ?? [];
  const stage = targets.find((t) => t.isStage);
  const sprite = targets.find((t) => !t.isStage && (t.costumes?.length ?? 0) > 0);
  return veBia(taoRaster(entries), stage?.costumes?.[0], sprite?.costumes?.[0]);
}

/** Số bìa tối đa đưa cho bé chọn. Mỗi bìa là một lượt ghép ảnh lúc xem thử. */
export const MAX_COVER_OPTIONS = 6;

/**
 * Vài bìa để bé chọn, lấy từ CHÍNH nội dung game — không cho tải ảnh lên.
 *
 * Phần tử đầu LUÔN giống hệt `renderThumbnail` (bìa mặc định). Sau đó, theo thứ tự:
 * cảnh nền đầu + từng nhân vật khác, từng cảnh nền khác + nhân vật đầu, rồi cảnh nền
 * đầu không có nhân vật. Bìa trùng nhau từng byte bị bỏ (vd. hai nhân vật dùng chung
 * một hình). Không bao giờ ném lỗi, luôn có ít nhất một bìa.
 *
 * Vì sao không cho tải ảnh riêng: ảnh tự chọn là một đường đưa ảnh bất kỳ — kể cả ảnh
 * chụp mặt bé — lên trang chủ mà không qua lớp kiểm nội dung nào của `.sb3`.
 */
export async function renderCoverOptions(
  entries: ZipEntry[],
  project: ProjectJson,
  max = MAX_COVER_OPTIONS
): Promise<Buffer[]> {
  const raster = taoRaster(entries);
  const targets = project.targets ?? [];
  const stage = targets.find((t) => t.isStage);
  const sprites = targets.filter((t) => !t.isStage && (t.costumes?.length ?? 0) > 0);
  const nen = stage?.costumes ?? [];

  const cap: [Costume | undefined, Costume | undefined][] = [[nen[0], sprites[0]?.costumes?.[0]]];
  for (const sp of sprites.slice(1)) cap.push([nen[0], sp.costumes?.[0]]);
  for (const n of nen.slice(1)) cap.push([n, sprites[0]?.costumes?.[0]]);
  if (sprites.length > 0) cap.push([nen[0], undefined]);

  const ketQua: Buffer[] = [];
  for (const [n, sp] of cap) {
    if (ketQua.length >= max) break;
    const anh = await veBia(raster, n, sp);
    if (!ketQua.some((k) => k.equals(anh))) ketQua.push(anh);
  }
  return ketQua;
}

/** Dung lượng tối đa của ảnh bìa bé tự tải (trước khi xử lý). Ảnh chụp điện thoại thường 2–6 MB. */
export const MAX_COVER_IMAGE_BYTES = 10 * 1024 * 1024;

/** Chỉ nhận những định dạng này. KHÔNG nhận SVG: nó là tài liệu, không phải ảnh chụp. */
const DINH_DANG_ANH = new Set(['jpeg', 'png', 'webp']);

/**
 * Ảnh bìa bé tự tải lên -> WebP 480×360 SẠCH.
 *
 * - `rotate()` TRƯỚC khi bỏ metadata: ảnh điện thoại chụp dọc lưu xoay ngang kèm cờ
 *   Orientation trong EXIF; bỏ EXIF mà không xoay trước là bìa bị nằm nghiêng.
 * - Không gọi `withMetadata` / `keepExif`: `sharp` mặc định KHÔNG chép EXIF, XMP, ICC sang
 *   ảnh ra. Ảnh chụp điện thoại mang toạ độ GPS nơi chụp — thứ không được lên trang chủ.
 *   Bộ kiểm `e2e-xem-thu` gửi một JPEG có GPS thật và đo ảnh ra không còn EXIF.
 * - `limitInputPixels`: một PNG 30.000×30.000 một màu chỉ vài trăm KB nhưng giải nén ra
 *   hàng GB. Chặn trước khi giải nén.
 * - Cắt giữa về khổ 4:3 của sân khấu Scratch, cùng cỡ với bìa tự tạo.
 *
 * HEIC (ảnh iPhone) không đọc được — `sharp` bản dựng sẵn không có bộ giải HEIC. Ô chọn ảnh
 * chỉ nhận JPEG/PNG/WebP, và Safari trên iPhone tự đổi HEIC sang JPEG khi tải lên ô như vậy.
 */
export async function normalizeCoverImage(input: Buffer): Promise<Buffer> {
  const LOI = new Sb3Error(
    'INVALID_IMAGE',
    'Ảnh này không dùng được. Chọn ảnh JPG hoặc PNG nhé.'
  );
  if (input.length > MAX_COVER_IMAGE_BYTES) {
    throw new Sb3Error('INVALID_IMAGE', `Ảnh quá lớn (tối đa ${MAX_COVER_IMAGE_BYTES / 1024 / 1024}MB).`);
  }

  let meta;
  try {
    // `metadata` chỉ đọc phần đầu file, không giải nén — đọc không giới hạn để còn báo đúng
    // lỗi "quá lớn" bên dưới; bước xử lý thật vẫn chặn bằng `limitInputPixels`.
    meta = await sharp(input).metadata();
  } catch {
    throw LOI;
  }
  if (!meta.format || !DINH_DANG_ANH.has(meta.format) || !meta.width || !meta.height) throw LOI;
  if (meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new Sb3Error('INVALID_IMAGE', 'Ảnh có kích thước quá lớn. Chọn ảnh nhỏ hơn nhé.');
  }

  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw LOI;
  }
}
