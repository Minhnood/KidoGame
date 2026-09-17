'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/button';
import { Field, TextArea, TextInput } from '@/components/field';
import { FilePicker } from '@/components/file-picker';
import { GocCo, THE_FORM } from '@/components/card';
import { Notice } from '@/components/notice';
import { StageFrame } from '../game/[id]/stage-frame';

/** Trùng `KetQuaXemThu` ở `src/lib/ingest.ts`. */
interface BanXemThu {
  maXemThu: string;
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
 * Đăng game: CHỌN FILE LÀ THẤY GAME NGAY, điền tên rồi mới "Đăng game".
 *
 * Chọn file là gọi `/api/upload` luôn: server đóng gói đúng bản sẽ đăng, trang hiện khung
 * chơi thử và các bìa để chọn — TRƯỚC khi có gì công khai. Tên, mô tả, loại game điền
 * sau, gửi kèm lúc bấm Đăng. Trước đây bấm một nút là game lên trang chủ ngay và thư đã
 * đi tới bố mẹ, nên phát hiện game hỏng hay bìa xấu thì đã muộn.
 *
 * Bấm "Đăng game" lúc bản thử còn đang đóng gói thì CHỜ nó xong rồi đăng luôn, không bắt
 * bấm lại. Chọn file khác giữa chừng thì kết quả của file cũ bị bỏ (`luot`).
 */
export function UploadForm({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const [dangXemThu, setDangXemThu] = useState(false);
  const [dangDang, setDangDang] = useState(false);
  const [loiXemThu, setLoiXemThu] = useState<string | null>(null);
  const [loiDang, setLoiDang] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [ban, setBan] = useState<BanXemThu | null>(null);
  /** Chỉ số trong `ban.biaUrls`; 0 là bìa mặc định. */
  const [bia, setBiaState] = useState(0);
  /* Ref song song vì `onSubmit` có thể phải chờ ảnh bìa tải xong, và chỉ số của ảnh đó
     chưa kịp vào closure của lần render đã bấm. */
  const biaRef = useRef(0);
  const setBia = (i: number) => {
    biaRef.current = i;
    setBiaState(i);
  };

  /* Ref song song với state: `onSubmit` phải đọc được bản xem thử MỚI NHẤT sau khi chờ,
     còn state trong closure của lần render cũ thì vẫn là null. */
  const banRef = useRef<BanXemThu | null>(null);
  const choXemThu = useRef<Promise<void> | null>(null);
  const luot = useRef(0);
  /** File đang chọn. Ô chọn file tự xoá giá trị sau mỗi lần chọn — xem `FilePicker`. */
  const fileRef = useRef<File | null>(null);
  const [dangTaiBia, setDangTaiBia] = useState(false);
  const [loiBia, setLoiBia] = useState<string | null>(null);
  const choBia = useRef<Promise<void> | null>(null);

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

  function datBan(b: BanXemThu | null) {
    banRef.current = b;
    setBan(b);
    setBia(0);
    setLoiBia(null);
  }

  /**
   * Bé tải ảnh riêng làm bìa. Server bỏ EXIF (kể cả GPS) và cắt 480×360; ảnh vừa tải
   * thành một ô bìa và được chọn luôn.
   */
  function taiAnhBia(anh: File) {
    const banLuc = banRef.current;
    if (!banLuc) return;
    setLoiBia(null);
    setDangTaiBia(true);
    const fd = new FormData();
    fd.set('maXemThu', banLuc.maXemThu);
    fd.set('anh', anh);
    choBia.current = (async () => {
      try {
        const res = await fetch('/api/upload/bia', { method: 'POST', body: fd });
        const data = await res.json();
        // Bé đã chọn file game khác trong lúc chờ: ảnh này thuộc bản thử cũ, bỏ.
        if (banRef.current?.maXemThu !== banLuc.maXemThu) return;
        if (!res.ok) {
          setLoiBia(data.error ?? 'Không tải được ảnh, thử lại nhé.');
          return;
        }
        const moi = { ...banLuc, biaUrls: data.biaUrls as string[] };
        banRef.current = moi;
        setBan(moi);
        setBia(data.chiSo as number);
      } catch {
        setLoiBia('Không gửi được ảnh. Kiểm tra kết nối mạng nhé.');
      } finally {
        setDangTaiBia(false);
      }
    })();
  }

  function xemThu(file: File) {
    const lan = ++luot.current;
    fileRef.current = file;
    datBan(null);
    setLoiXemThu(null);
    setLoiDang(null);
    setDangXemThu(true);

    const fd = new FormData();
    fd.set('file', file);
    choXemThu.current = (async () => {
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (lan !== luot.current) return; // bé đã chọn file khác
        if (!res.ok) setLoiXemThu(data.error ?? 'Có lỗi xảy ra, thử lại nhé.');
        else datBan(data as BanXemThu);
      } catch {
        if (lan === luot.current) setLoiXemThu('Không gửi được file. Kiểm tra kết nối mạng nhé.');
      } finally {
        if (lan === luot.current) setDangXemThu(false);
      }
    })();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoiDang(null);
    setDangDang(true);

    if (choXemThu.current) await choXemThu.current;
    if (choBia.current) await choBia.current;
    const banHienTai = banRef.current;
    if (!banHienTai) {
      // Lỗi xem thử (file hỏng, không phải Scratch…) đã hiện ngay dưới ô chọn file.
      if (!fileRef.current) setLoiDang('Chọn file game trước nhé.');
      setDangDang(false);
      return;
    }

    const fd = new FormData(form);
    try {
      const res = await fetch('/api/upload/dang', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          maXemThu: banHienTai.maXemThu,
          bia: biaRef.current,
          title: String(fd.get('title') ?? ''),
          description: String(fd.get('description') ?? ''),
          tags: fd.getAll('tags').map(String),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDangDang(false);
        if (res.status === 410) {
          /* Bản thử hết hạn: tạo lại luôn từ file đang chọn, bé chỉ việc bấm Đăng lần nữa.
             Tên đã gõ vẫn nằm nguyên trong form. */
          if (fileRef.current) xemThu(fileRef.current);
          setLoiDang(`${data.error ?? ''} Mình đang tạo lại bản chơi thử — xong thì bấm Đăng game lần nữa nhé.`);
          return;
        }
        setLoiDang(data.error ?? 'Có lỗi xảy ra, thử lại nhé.');
        return;
      }
      // Giữ nút ở trạng thái "đang đăng" cho tới khi trang game mở ra, không thì bé bấm lại.
      router.push(`/game/${data.gameId}`);
    } catch {
      setLoiDang('Không gửi được. Kiểm tra kết nối mạng nhé.');
      setDangDang(false);
    }
  }

  return (
    <form data-testid="upload-form" onSubmit={onSubmit} className={`max-w-140 ${THE_FORM}`}>
      <GocCo />
      <Field
        id="file"
        label="File game"
        hint={
          <>
            Trong Scratch, chọn <strong>File → Save to your computer</strong> để lấy file có đuôi{' '}
            <strong>.sb3</strong>, rồi chọn file đó ở đây. Chọn xong là chơi thử được ngay.
          </>
        }
      >
        {/* Không `required`: ô tự xoá giá trị sau mỗi lần chọn, file nằm ở `fileRef`. */}
        <FilePicker id="file" name="file" accept=".sb3" onChange={xemThu} />
      </Field>

      {dangXemThu && (
        <p className="mt-3 text-ink-soft" role="status" data-testid="dang-xem-thu">
          Đang chuẩn bị bản chơi thử, mất khoảng vài giây…
        </p>
      )}
      {loiXemThu && (
        <Notice tone="error" role="alert">
          {loiXemThu}
        </Notice>
      )}

      {ban && (
        <section data-testid="xem-thu" aria-label="Chơi thử và chọn bìa" className="mt-5">
          <Notice tone="info">
            Game <strong>chưa đăng</strong>, chưa ai thấy đâu. Bấm cờ xanh để chơi thử, chọn bìa,
            đặt tên rồi bấm <strong>Đăng game</strong> ở dưới.
          </Notice>

          <div className="mt-3">
            <StageFrame src={ban.htmlUrl} title="Chơi thử game" />
          </div>

          {ban.warnings.map((w) => (
            <Notice tone="warn" role="status" key={w.code}>
              {w.message}
            </Notice>
          ))}

          <p className="mt-5 font-semibold">Bìa game</p>
          <p className="text-sm text-ink-soft">Bìa này hiện ở trang chủ và trong danh sách game.</p>
          {/* 240×180: đúng khổ 4:3 của sân khấu Scratch, cỡ gần bằng thẻ game trên trang chủ. */}
          <img
            src={ban.biaUrls[bia] ?? ban.thumbUrl}
            alt="Bìa game đang chọn"
            width={240}
            height={180}
            data-testid="bia-xem-thu"
            className="mt-2 h-45 w-60 rounded-field border border-border bg-surface object-cover"
          />

          {/*
            Chọn bìa: radio thật (bàn phím và trình đọc màn hình dùng được), ẩn nút tròn,
            cả ô ảnh là vùng bấm. Chỉ hiện khi có từ hai bìa trở lên — một lựa chọn duy
            nhất thì chẳng có gì để chọn. `name` KHÔNG trùng ô nào của form: chỉ số bìa
            gửi đi qua state, không qua FormData.
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
                      name="chon-bia"
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

          {/*
            Tải ảnh riêng làm bìa. Input thật ẩn bằng sr-only (bàn phím vẫn tới được), nhãn là
            nút bấm. Xoá giá trị sau mỗi lần chọn để chọn lại đúng ảnh cũ vẫn phát `change`.
            `accept` chỉ JPEG/PNG/WebP: Safari trên iPhone tự đổi ảnh HEIC sang JPEG cho ô như
            vậy, còn server không đọc được HEIC.
          */}
          <div className="mt-4">
            <input
              id="anh-bia"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="peer sr-only"
              data-testid="tai-anh-bia"
              aria-describedby="anh-bia-goi-y"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) taiAnhBia(f);
                e.currentTarget.value = '';
              }}
            />
            <label
              htmlFor="anh-bia"
              className="inline-flex min-h-touch cursor-pointer items-center rounded-full border border-border bg-surface px-5 font-bold text-ink hover:bg-bg peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
            >
              {dangTaiBia ? 'Đang tải ảnh…' : 'Tải ảnh làm bìa'}
            </label>
            <p className="mt-2 text-sm text-ink-soft" id="anh-bia-goi-y">
              Ảnh bìa hiện cho mọi người thấy. Đừng dùng ảnh có mặt mình hay mặt bạn, tên
              trường, hay địa chỉ nhà nhé.
            </p>
            {dangTaiBia && (
              <p className="sr-only" role="status">
                Đang tải ảnh bìa…
              </p>
            )}
            {loiBia && (
              <Notice tone="error" role="alert">
                {loiBia}
              </Notice>
            )}
          </div>
        </section>
      )}

      <div className="mt-7 border-t border-border pt-5">
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
      </div>

      {loiDang && (
        <Notice tone="error" role="alert">
          {loiDang}
        </Notice>
      )}

      <div className="mt-7">
        <Button type="submit" size="lg" disabled={dangDang} data-testid="dang-game-that">
          {dangDang ? (dangXemThu ? 'Chờ bản chơi thử xong…' : 'Đang đăng…') : 'Đăng game'}
        </Button>
        <p className="mt-2.5 text-ink-soft">Bấm Đăng thì game mới hiện cho mọi người.</p>
      </div>
    </form>
  );
}
