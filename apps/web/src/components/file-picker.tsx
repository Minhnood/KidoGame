'use client';

import { useId, useState } from 'react';

/**
 * Ô chọn file tự làm.
 *
 * Vì sao không dùng <input type="file"> mặc định: trình duyệt tự vẽ nút và chữ
 * ("Choose File" / "No file chosen") bằng NGÔN NGỮ CỦA TRÌNH DUYỆT, CSS không
 * đổi được. Trên một site tiếng Việt cho trẻ em, để nút quan trọng nhất sản phẩm
 * hiện chữ tiếng Anh là không chấp nhận được.
 *
 * Input thật vẫn còn nguyên và vẫn là phần tử nhận focus — chỉ ẩn bằng sr-only
 * chứ KHÔNG display:none, để bàn phím và trình đọc màn hình vẫn dùng được.
 */
export function FilePicker({
  id,
  name,
  accept,
  required,
}: {
  id: string;
  name: string;
  accept?: string;
  required?: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const descId = useId();

  return (
    <div>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-describedby={descId}
        className="peer sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0] ?? null;
          setFileName(f ? f.name : null);
          setSize(f ? f.size : null);
        }}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-field border border-border bg-surface p-2.5 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
        <label
          htmlFor={id}
          className="inline-flex min-h-touch cursor-pointer items-center rounded-full bg-chrome px-5 font-bold text-chrome-ink transition-colors hover:bg-chrome/85"
        >
          {fileName ? 'Chọn file khác' : 'Chọn file .sb3'}
        </label>

        <span id={descId} className="min-w-0 flex-1 text-ink-soft">
          {fileName ? (
            <>
              <span className="block truncate font-semibold text-ink">{fileName}</span>
              {size !== null && (
                <span className="text-sm">{(size / 1024).toFixed(0)} KB — sẵn sàng đăng</span>
              )}
            </>
          ) : (
            'Chưa chọn file nào'
          )}
        </span>
      </div>
    </div>
  );
}
