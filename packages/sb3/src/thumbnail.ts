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

/**
 * Sinh thumbnail từ nội dung .sb3: lấy backdrop của Stage làm nền, ghép costume
 * đầu tiên của sprite đầu tiên lên trên.
 *
 * Không bao giờ ném lỗi — thumbnail chỉ là trang trí. Trả về ảnh nền màu brand
 * nếu không rasterize được gì. Đây là lý do không bắt trẻ tự upload ảnh đại diện.
 */
export async function renderThumbnail(
  entries: ZipEntry[],
  project: ProjectJson
): Promise<Buffer> {
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const targets = project.targets ?? [];

  const stage = targets.find((t) => t.isStage);
  const sprite = targets.find((t) => !t.isStage && (t.costumes?.length ?? 0) > 0);

  const backdropRef = stage?.costumes?.[0] ? assetRef(stage.costumes[0]) : null;
  const spriteRef = sprite?.costumes?.[0] ? assetRef(sprite.costumes[0]) : null;

  const backdropData = backdropRef ? byName.get(backdropRef) : undefined;
  const spriteData = spriteRef ? byName.get(spriteRef) : undefined;

  // Nền: backdrop phủ kín khung, hoặc màu brand.
  let base: Sharp;
  const backdropPng = backdropData ? await rasterize(backdropData, THUMB_WIDTH, THUMB_HEIGHT) : null;

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
  const spritePng = spriteData
    ? await rasterize(spriteData, Math.round(THUMB_WIDTH / 2), Math.round(THUMB_HEIGHT / 2))
    : null;

  if (spritePng) {
    base = sharp(await base.png().toBuffer()).composite([
      { input: spritePng, gravity: 'centre' },
    ]);
  }

  try {
    return await base.webp({ quality: 82 }).toBuffer();
  } catch {
    return sharp({
      create: { width: THUMB_WIDTH, height: THUMB_HEIGHT, channels: 4, background: FALLBACK_BG },
    })
      .webp({ quality: 82 })
      .toBuffer();
  }
}
