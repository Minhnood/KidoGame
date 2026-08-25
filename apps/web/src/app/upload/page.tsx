'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { FilePicker } from '@/components/file-picker';
import { Notice } from '@/components/notice';
import { PageTitle } from '@/components/page';

interface UploadOk {
  gameId: string;
  warnings: { code: string; message: string }[];
}

export default function UploadPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

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
    <>
      <PageTitle title="Đăng game của bé" />

      <form
        onSubmit={onSubmit}
        className="mb-12 max-w-140 rounded-card border border-border bg-surface p-6"
      >
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
    </>
  );
}
