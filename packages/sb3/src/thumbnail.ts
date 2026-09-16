import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { ZipEntry } from './zip.js';
import type { ProjectJson } from './validate.js';

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
