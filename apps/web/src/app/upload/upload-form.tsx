'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { FilePicker } from '@/components/file-picker';
import { GocCo, THE_FORM } from '@/components/card';
import { Notice } from '@/components/notice';
interface UploadOk {
  gameId: string;
  warnings: { code: string; message: string }[];
}

export interface TagOption {
  slug: string;
  label: string;
}

/** Trùng với MAX_TAGS_PER_GAME ở server; server vẫn cắt lại, đây chỉ để đỡ bực. */
const MAX_TAGS = 2;

export function UploadForm({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  /*
   * Chặn tick quá số cho phép ngay tại chỗ thay vì để server lặng lẽ cắt bớt.
   * Bé tick 4 tag rồi đăng xong thấy còn 2 mà không hiểu vì sao là trải nghiệm tệ.
   */
  function toggleTag(slug: string) {
    setPicked((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= MAX_TAGS
          ? prev
          : [...prev, slug]
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    setBusy(true);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Có lỗi xảy ra, thử lại nhé.');
        return;
      }

      const ok = data as UploadOk;
      if (ok.warnings.length > 0) {
        // Cho bé đọc cảnh báo (vd. biến đám mây) rồi mới chuyển trang.
        setWarnings(ok.warnings.map((w) => w.message));
        setTimeout(() => router.push(`/game/${ok.gameId}`), 2500);
      } else {
        router.push(`/game/${ok.gameId}`);
      }
    } catch {
      setError('Không gửi được file. Kiểm tra kết nối mạng nhé.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-testid="upload-form"
      onSubmit={onSubmit}
      className={`max-w-140 ${THE_FORM}`}
    >
      <GocCo />
        <Field id="title" label="Tên game">
          <TextInput id="title" name="title" maxLength={80} required placeholder="Mèo phiêu lưu" />
        </Field>

        <Field id="description" label="Giới thiệu game" hint="Không bắt buộc — bỏ trống cũng được.">
          <TextArea
            id="description"
            name="description"
            maxLength={500}
            placeholder="Bấm phím mũi tên để di chuyển, ăn hết sao là thắng!"
          />
        </Field>

        {tags.length > 0 && (
          <Field
            id="tags"
            label="Game thuộc loại gì?"
            hint={`Không bắt buộc. Chọn tối đa ${MAX_TAGS} loại để bạn khác dễ tìm thấy game của bé.`}
          >
            <div className="flex flex-wrap gap-2" data-testid="tag-picker">
              {tags.map((tag) => {
                const on = picked.includes(tag.slug);
                const full = !on && picked.length >= MAX_TAGS;
                return (
                  <label
                    key={tag.slug}
                    className={[
                      'min-h-touch inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 font-semibold',
                      on
                        ? 'border-transparent bg-accent text-chrome'
                        : 'border-border bg-surface text-ink hover:bg-bg',
                      full ? 'cursor-not-allowed opacity-50' : '',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag.slug}
                      checked={on}
                      disabled={full}
                      onChange={() => toggleTag(tag.slug)}
                      className="size-5"
                    />
                    {tag.label}
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        <Field
          id="file"
          label="File game"
          hint={
            <>
              Trong Scratch, chọn <strong>File → Save to your computer</strong> để lấy file có đuôi{' '}
              <strong>.sb3</strong>, rồi chọn file đó ở đây.
            </>
          }
        >
          <FilePicker id="file" name="file" accept=".sb3" required />
        </Field>

        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        {warnings.map((w) => (
          <Notice tone="warn" role="status" key={w}>
            {w}
          </Notice>
        ))}

        <div className="mt-7">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Đang xử lý game…' : 'Đăng game'}
          </Button>
          {busy && (
            <p className="mt-2.5 text-ink-soft" role="status">
              Đang kiểm tra và đóng gói, mất khoảng vài giây…
            </p>
          )}
        </div>
    </form>
  );
}
