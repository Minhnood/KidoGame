import yauzl from 'yauzl';
import { LIMITS, ZIP_MAGIC } from './limits.js';
import { Sb3Error } from './errors.js';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * yauzl tự validate tên entry và từ chối path traversal / ký tự lạ TRƯỚC khi ta
 * nhìn thấy entry. Đó là hành vi an toàn, nhưng nó tới dưới dạng lỗi parse chung
 * nên cần map lại cho đúng bản chất. Check thủ công trong handler 'entry' vẫn giữ
 * làm lớp phòng thủ thứ hai, phòng khi yauzl đổi luật.
 */
function mapZipError(e: Error): Sb3Error {
  const m = e.message.toLowerCase();
  // Ba message của yauzl.validateFileName (yauzl/index.js:871-879).
  if (
    m.includes('invalid relative path') ||
    m.includes('invalid characters in filename') ||
    m.includes('absolute path:')
  ) {
    return new Sb3Error('UNSAFE_ENTRY_NAME', 'File game chứa tên file không hợp lệ.', e.message);
  }
  return new Sb3Error('NOT_A_ZIP', 'File game bị hỏng.', e.message);
}

/**
 * Đọc toàn bộ zip vào memory nhưng CÓ TRẦN — mọi giới hạn được kiểm *trong lúc*
 * đọc, không phải sau. Một zip bomb 10GB sẽ bị cắt ngay khi vượt ngưỡng chứ không
 * bao giờ được giải nén hết.
 */
export function readSb3Zip(buf: Buffer): Promise<ZipEntry[]> {
  if (buf.length > LIMITS.MAX_SB3_BYTES) {
    throw new Sb3Error('TOO_LARGE', 'File game quá lớn.', `${buf.length} bytes`);
  }
  // Không tin đuôi .sb3 — kiểm magic bytes. Một file .html đổi tên sẽ chết ở đây.
  if (buf.length < 4 || !buf.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw new Sb3Error('NOT_A_ZIP', 'File này không phải file Scratch (.sb3) hợp lệ.');
  }

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err || !zip) {
        return reject(err ? mapZipError(err) : new Sb3Error("NOT_A_ZIP", "Không mở được file game."));
      }

      if (zip.entryCount > LIMITS.MAX_ENTRIES) {
        return reject(
          new Sb3Error('TOO_MANY_ENTRIES', 'File game chứa quá nhiều thành phần.', `${zip.entryCount}`)
        );
      }

      const entries: ZipEntry[] = [];
      const seen = new Set<string>();
      let totalUncompressed = 0;

      const fail = (e: Sb3Error) => {
        zip.close();
        reject(e);
      };

      zip.on('error', (e: Error) => fail(mapZipError(e)));
      zip.on('end', () => resolve(entries));

      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;

        // .sb3 luôn phẳng: chỉ gồm project.json + các asset ở gốc.
        // Bất kỳ dấu hiệu path nào cũng là bất thường -> từ chối, không "làm sạch".
        if (
          name.includes('/') ||
          name.includes('\\') ||
          name.includes('..') ||
          name.startsWith('.') ||
          name.trim() !== name ||
          name.length === 0 ||
          name.length > 200 ||
          // eslint-disable-next-line no-control-regex
          /[\x00-\x1f]/.test(name)
        ) {
          return fail(new Sb3Error('UNSAFE_ENTRY_NAME', 'File game chứa tên file không hợp lệ.', name));
        }

        // Trùng tên trong zip là thủ thuật che giấu payload cổ điển.
        if (seen.has(name)) {
          return fail(new Sb3Error('UNSAFE_ENTRY_NAME', 'File game chứa thành phần trùng lặp.', name));
        }
        seen.add(name);

        // Tỉ lệ nén khai báo — check rẻ, chặn sớm trước khi tốn CPU giải nén.
        if (entry.compressedSize > 0) {
          const ratio = entry.uncompressedSize / entry.compressedSize;
          if (ratio > LIMITS.MAX_COMPRESSION_RATIO) {
            return fail(
              new Sb3Error('COMPRESSION_BOMB', 'File game không hợp lệ.', `${name} ratio=${ratio.toFixed(0)}`)
            );
          }
        }
        if (entry.uncompressedSize > LIMITS.MAX_ASSET_BYTES) {
          return fail(new Sb3Error('TOO_LARGE', 'File game chứa thành phần quá lớn.', name));
        }

        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            return fail(new Sb3Error('NOT_A_ZIP', 'File game bị hỏng.', streamErr?.message));
          }

          const chunks: Buffer[] = [];
          let size = 0;

          stream.on('data', (c: Buffer) => {
            size += c.length;
            totalUncompressed += c.length;
            // Đây mới là con số thật. Header zip có thể nói dối; byte đọc được thì không.
            if (size > LIMITS.MAX_ASSET_BYTES || totalUncompressed > LIMITS.MAX_UNCOMPRESSED_BYTES) {
              stream.destroy();
              return fail(
                new Sb3Error('UNCOMPRESSED_TOO_LARGE', 'File game quá lớn khi giải nén.', name)
              );
            }
            chunks.push(c);
          });

          stream.on('error', (e: Error) =>
            fail(new Sb3Error('NOT_A_ZIP', 'File game bị hỏng.', e.message))
          );

          stream.on('end', () => {
            entries.push({ name, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
        });
      });

      zip.readEntry();
    });
  });
}
