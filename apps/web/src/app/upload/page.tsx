'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
      <h1>Đăng game của bé</h1>
      <p className="muted">
        Mở Scratch, chọn <strong>File → Save to your computer</strong> để lấy file{' '}
        <strong>.sb3</strong>, rồi tải lên đây.
      </p>

      <form className="upload" onSubmit={onSubmit}>
        <label htmlFor="title">Tên game</label>
        <input id="title" name="title" type="text" maxLength={80} required placeholder="Mèo phiêu lưu" />

        <label htmlFor="description">Giới thiệu game (không bắt buộc)</label>
        <textarea
          id="description"
          name="description"
          maxLength={500}
          placeholder="Bấm phím mũi tên để di chuyển, ăn hết sao là thắng!"
        />

        <label htmlFor="file">File game (.sb3)</label>
        <input id="file" name="file" type="file" accept=".sb3" required />

        {error && <p className="error">{error}</p>}
        {warnings.map((w) => (
          <p className="notice" key={w}>
            ⚠️ {w}
          </p>
        ))}

        <p style={{ marginTop: 22 }}>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Đang xử lý game…' : 'Đăng game'}
          </button>
        </p>
        {busy && <p className="muted">Đang kiểm tra và đóng gói, mất khoảng vài giây…</p>}
      </form>
    </>
  );
}
