'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { FilePicker } from '@/components/file-picker';
import { GocCo, THE_FORM } from '@/components/card';
import { Notice } from '@/components/notice';
import { StageFrame } from '../game/[id]/stage-frame';

/** Trùng `KetQuaXemThu` ở `src/lib/ingest.ts`. */
interface BanXemThu {
  maXemThu: string;
  title: string;
  htmlUrl: string;
  thumbUrl: string;
  biaUrls: string[];
  warnings: { code: string; message: string }[];
}

export interface TagOption {
  slug: string;
  label: string;
}

/** Trùng với MAX_TAGS_PER_GAME ở server; server vẫn cắt lại, đây chỉ để đỡ bực. */
const MAX_TAGS = 2;

/**
 * Đăng game hai bước: "Xem thử game" rồi mới "Đăng game".
 *
 * Bước xem thử đóng gói game thật (đúng bản sẽ đăng) để bé bấm cờ xanh chơi thử và thấy
 * cái bìa sẽ hiện ở trang chủ — TRƯỚC khi có gì công khai. Trước đây bấm một nút là game
 * lên trang chủ ngay và thư đã đi tới bố mẹ, nên phát hiện game hỏng hay bìa xấu thì đã
 * muộn.
 *
 * Form KHÔNG bị gỡ khỏi trang khi đang xem thử, chỉ ẩn đi: bấm "Sửa lại" là quay về
 * đúng những gì bé đã gõ và đã chọn. Ô chọn file không gán lại được bằng script, gỡ
 * form ra là bé phải đi tìm file lần nữa.
 */
export function UploadForm({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dangDang, setDangDang] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [ban, setBan] = useState<BanXemThu | null>(null);
  /** Chỉ số trong `ban.biaUrls`; 0 là bìa mặc định. */
  const [bia, setBia] = useState(0);
  const xemThuRef = useRef<HTMLElement>(null);

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

  /* Trên điện thoại form dài hơn một màn hình: nút "Xem thử" nằm ở đáy, bản xem thử
     hiện ở chỗ form vừa ẩn. Không cuộn lên thì bé nhìn vào giữa khung game. */
  useEffect(() => {
    if (ban) xemThuRef.current?.scrollIntoView({ block: 'start' });
  }, [ban]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
      setBia(0);
      setBan(data as BanXemThu);
    } catch {
      setError('Không gửi được file. Kiểm tra kết nối mạng nhé.');
    } finally {
      setBusy(false);
    }
  }

  async function dangThat() {
    if (!ban) return;
    setError(null);
    setDangDang(true);
    try {
      const res = await fetch('/api/upload/dang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ maXemThu: ban.maXemThu, bia }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Hết hạn thì bản thử này vô dụng: về form, file vẫn còn chọn sẵn.
        if (res.status === 410) setBan(null);
        setError(data.error ?? 'Có lỗi xảy ra, thử lại nhé.');
        setDangDang(false);
        return;
      }
      // Giữ nút ở trạng thái "đang đăng" cho tới khi trang game mở ra, không thì bé bấm lại.
      router.push(`/game/${data.gameId}`);
    } catch {
      setError('Không gửi được. Kiểm tra kết nối mạng nhé.');
      setDangDang(false);
    }
  }

  return (
    <>
      <form
        data-testid="upload-form"
        onSubmit={onSubmit}
        hidden={ban !== null}
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

        {error && !ban && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}

        <div className="mt-7">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Đang chuẩn bị bản chơi thử…' : 'Xem thử game'}
          </Button>
          {busy ? (
            <p className="mt-2.5 text-ink-soft" role="status">
              Đang kiểm tra và đóng gói, mất khoảng vài giây…
            </p>
          ) : (
            <p className="mt-2.5 text-ink-soft">Game chưa đăng ngay đâu — bé được chơi thử trước.</p>
          )}
        </div>
      </form>

      {ban && (
        <section ref={xemThuRef} data-testid="xem-thu" aria-labelledby="xem-thu-tieu-de" className="mb-12 scroll-mt-6">
          <Notice tone="info">
            Game <strong>chưa đăng</strong>, chưa ai thấy đâu. Bấm cờ xanh để chơi thử, xem bìa ở
            dưới. Ưng rồi thì bấm <strong>Đăng game</strong>.
          </Notice>

          <h2 id="xem-thu-tieu-de" className="mt-6 text-xl font-bold">
            {ban.title}
          </h2>

          <div className="mt-3">
            <StageFrame src={ban.htmlUrl} title={`Chơi thử: ${ban.title}`} />
          </div>

          <div className="mx-auto mt-6 max-w-180">
            {ban.warnings.map((w) => (
              <Notice tone="warn" role="status" key={w.code}>
                {w.message}
              </Notice>
            ))}

            <p className="font-semibold" id="bia-tieu-de">
              Bìa game
            </p>
            <p className="text-sm text-ink-soft">Bìa này hiện ở trang chủ và trong danh sách game.</p>
            {/* 240×180: đúng khổ 4:3 của sân khấu Scratch, cỡ gần bằng thẻ game trên trang chủ. */}
            <img
              src={ban.biaUrls[bia] ?? ban.thumbUrl}
              alt={`Bìa của game ${ban.title}`}
              width={240}
              height={180}
              data-testid="bia-xem-thu"
              className="mt-2 h-45 w-60 rounded-field border border-border bg-surface object-cover"
            />

            {/*
              Chọn bìa: radio thật (bàn phím và trình đọc màn hình dùng được), ẩn nút tròn,
              cả ô ảnh là vùng bấm. Chỉ hiện khi có từ hai bìa trở lên — một lựa chọn duy
              nhất thì chẳng có gì để chọn.
            */}
            {ban.biaUrls.length > 1 && (
              <fieldset className="mt-4 border-0 p-0" data-testid="chon-bia">
                <legend className="font-semibold">Chọn bìa khác</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {ban.biaUrls.map((url, i) => (
                    <label
                      key={url}
                      className={`relative cursor-pointer rounded-field border-3 p-0.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                        i === bia ? 'border-accent' : 'border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="bia"
                        value={i}
                        checked={i === bia}
                        onChange={() => setBia(i)}
                        className="sr-only"
                      />
                      <img
                        src={url}
                        alt={i === 0 ? 'Bìa tự tạo' : `Bìa số ${i + 1}`}
                        width={96}
                        height={72}
                        className="block h-18 w-24 rounded-field object-cover"
                      />
                      {/* Dấu ✓ để bìa đang chọn không chỉ khác nhau ở màu viền. */}
                      {i === bia && (
                        <span
                          aria-hidden="true"
                          className="absolute right-1 top-1 rounded-full bg-accent px-1.5 text-sm font-bold text-chrome"
                        >
                          ✓
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {error && (
              <Notice tone="error" role="alert">
                {error}
              </Notice>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                onClick={dangThat}
                disabled={dangDang}
                data-testid="dang-game-that"
              >
                {dangDang ? 'Đang đăng…' : 'Đăng game'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBan(null);
                  setError(null);
                }}
                disabled={dangDang}
                data-testid="sua-lai"
              >
                Sửa lại
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
