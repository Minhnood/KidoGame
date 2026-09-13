import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getActor } from '@/lib/session';
import { createChildAction } from '@/lib/actions';
import { gameDangBiKhieuNai } from '@/lib/takedown';
import { objectUrl } from '@/lib/storage';
import { AuthForm } from '@/components/auth-form';
import { Field, TextInput } from '@/components/field';
import { EmptyState, PageTitle } from '@/components/page';
import { Notice } from '@/components/notice';
import { MAT_THE } from '@/components/card';
import {
  DeleteGameButton,
  GameVisibilityToggle,
  LockToggle,
  ResetPasswordForm,
} from './child-controls';
import { VerifyEmailButton } from './verify-email-button';
import { NGAY_GIU_GAME_DA_GO } from '@/lib/moderation';
import { Pager } from '@/components/pager';

export const dynamic = 'force-dynamic';

/**
 * Mười game mỗi trang, cho TỪNG bé.
 *
 * Trước đây danh sách in hết một lượt. Đo trong DB dev: bé Minh có 26 game, mỗi dòng
 * cao khoảng 84px, tức hơn 2.000px chỉ riêng một bé — form "Tạo tài khoản cho bé" bị
 * đẩy xuống tận đáy, và bé thứ hai nằm ngoài tầm cuộn của hầu hết mọi người.
 *
 * Mười chứ không nhiều hơn: trang này là chỗ bố mẹ RÀ SOÁT, đọc từng dòng để quyết định
 * ẩn hay xoá, không phải chỗ lướt. Mười dòng vừa một màn hình máy tính.
 */
const GAME_MOI_TRANG = 10;

export default async function ParentDashboard({
  searchParams,
}: {
  searchParams: Promise<{ be?: string; trang?: string }>;
}) {
  const sp = await searchParams;
  /*
   * PHÂN TRANG THEO TỪNG BÉ, và chỉ MỘT bé được lật trang tại một thời điểm.
   *
   * Một nhà có thể có nhiều bé, mỗi bé một danh sách. `?be=<tên đăng nhập>&trang=N` lật
   * đúng danh sách của bé đó; mọi bé khác đứng ở trang 1. Không làm mỗi bé một tham số
   * riêng (`trang-beminh=2`): `Pager` dựng ô "nhảy tới trang" bằng một ô tên `trang`, nên
   * tham số tự đặt tên khác sẽ bị ô ấy ghi đè thành một `trang` không thuộc bé nào.
   * `be` cũng là đúng tên khu quản trị đang dùng cho cùng ý nghĩa.
   *
   * Đổi lại: đang ở trang 3 của bé A mà lật sang trang 2 của bé B thì bé A về trang 1.
   * Chấp nhận — rà hai danh sách xen kẽ nhau không phải cách người ta dùng trang này.
   */
  const beLat = sp.be ?? '';
  const trangLat = Math.max(1, Number(sp.trang) || 1);

  const actor = await getActor();
  if (!actor) redirect('/dang-nhap');
  if (actor.kind !== 'parent') redirect('/');

  const me = await prisma.parent.findUnique({
    where: { id: actor.id },
    select: { emailVerifiedAt: true },
  });

  const cacBe = await prisma.child.findMany({
    where: { parentId: actor.id },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { games: true } } },
  });

  /*
   * Mỗi bé MỘT truy vấn game, chỉ lấy đúng trang đang xem.
   *
   * Không gộp được vào `include` ở trên: `skip` của bé đang lật khác `skip` của mọi bé
   * còn lại, mà một `include` chỉ nhận một `skip`. Số bé mỗi nhà nhỏ (thường một hai),
   * nên vài truy vấn song song vẫn rẻ hơn hẳn việc kéo cả trăm dòng game về chỉ để cắt.
   */
  const children = await Promise.all(
    cacBe.map(async (child) => {
      const tongGame = child._count.games;
      const soTrang = Math.max(1, Math.ceil(tongGame / GAME_MOI_TRANG));
      const trang = child.username === beLat ? trangLat : 1;
      const games = await prisma.game.findMany({
        where: { childId: child.id },
        orderBy: { createdAt: 'desc' },
        skip: (trang - 1) * GAME_MOI_TRANG,
        take: GAME_MOI_TRANG,
        select: {
          id: true,
          title: true,
          status: true,
          playCount: true,
          createdAt: true,
          thumbSha256: true,
        },
      });
      return { ...child, games, tongGame, soTrang, trang };
    })
  );

  /** Link sang trang `p` của một bé, kèm neo về đúng thẻ của bé đó. */
  const hrefTrangBe = (username: string) => (p: number) => {
    const params = new URLSearchParams({ be: username });
    if (p > 1) params.set('trang', String(p));
    /* Neo `#be-...`: thẻ của bé nằm giữa trang, dưới khối ghi chú. Không có neo thì mỗi
       lần sang trang trình duyệt nhảy về đầu, và bố mẹ phải cuộn lại xuống tìm đúng bé
       đang rà — mười game một lần, cuộn lại một lần. */
    return `/phu-huynh?${params.toString()}#be-${username}`;
  };

  /*
   * Game nào đang bị một yêu cầu gỡ bản quyền giữ ẩn. Cần để nói trước cho phụ huynh
   * biết, thay vì để họ bấm "Hiện lại" rồi mới nhận lỗi.
   *
   * Chỉ cho biết CÓ khiếu nại, không hé danh tính người khiếu nại hay lý do — họ để
   * lại thông tin đó cho đội kiểm duyệt, không phải cho phụ huynh.
   */
  const biKhieuNai = await gameDangBiKhieuNai(
    children.flatMap((c) => c.games.map((g) => g.id))
  );

  const thisYear = new Date().getFullYear();

  return (
    <>
      <PageTitle title="Trang của bố mẹ" lead={actor.email} />

      {/*
        Câu này trước đây dừng ở "ẩn bất kỳ game nào", và nó nói quá đúng cái điều người
        đọc cần biết chính xác nhất. Ẩn rút game khỏi trang, nhưng file đã đóng gói và
        file .sb3 vẫn được phục vụ theo địa chỉ nội dung cho ai còn giữ URL — đo được:
        trang /game/<id> của một game đã gỡ trả 404 trong khi hai file của nó vẫn trả 200.
        Người bấm ẩn vì game để lộ gì đó về con mình cần biết ranh giới ấy TRƯỚC khi bấm,
        chứ không phải sau.
      */}
      <Notice tone="info">
        Game của bé được hiển thị công khai ngay sau khi đăng. Bố mẹ xem lại ở đây và ẩn bất kỳ
        game nào, bất cứ lúc nào. <strong>Ẩn</strong> là rút game khỏi trang — ai đang giữ sẵn
        link tới file game thì vẫn mở được. Muốn nội dung không còn trên mạng nữa thì bấm{' '}
        <strong>Xoá hẳn</strong>: chúng tôi xoá cả file gốc sau {NGAY_GIU_GAME_DA_GO} ngày, và
        gửi bạn link tải về trước ngày đó.
      </Notice>

      {/*
        Chưa xác minh email thì CHẶN đúng một việc: tạo tài khoản cho con. Không chặn
        đăng nhập, và tuyệt đối không chặn các thao tác an toàn (khoá tài khoản con, ẩn
        game của con) — những việc đó phải làm được ngay, không đợi hòm thư.

        Lý do đầy đủ nằm ở `createChild` trong src/lib/auth.ts. Server tự kiểm lại, nên
        khối này chỉ là để người dùng biết vì sao, chứ không phải lớp bảo vệ.
      */}
      {!me?.emailVerifiedAt && (
        <div data-testid="email-unverified">
          <Notice tone="warn">
            <p className="font-semibold">Bạn cần xác minh email trước khi tạo tài khoản cho con.</p>
            <p className="mt-1">
              Cách xác minh là bấm link trong lá thư gửi tới <strong>{actor.email}</strong>. Chưa
              thấy thư, kể cả trong thư rác, thì bấm nút dưới đây để gửi lại — nút đó báo ngay nếu
              việc gửi bị lỗi.
            </p>
            <p className="mt-1">
              Việc này cần thiết vì tạo tài khoản cho con chính là lúc bạn thay con đồng ý với điều
              khoản, nên chúng tôi phải biết chắc hòm thư này là của bạn. Nó cũng là cách duy nhất
              để lấy lại mật khẩu nếu bạn quên.
            </p>
            {/*
              KHÔNG khẳng định chắc chắn "chúng tôi đã gửi": lúc đăng ký, mail gửi trượt
              thì việc đăng ký vẫn thành công (cố ý — xem `registerParentAction`), nên câu
              đó có thể là nói sai với đúng những người đang mắc kẹt. Nút bên dưới mới là
              đường thoát thật, và nó HIỆN LỖI nếu gửi tiếp tục trượt.

              Ghi chú này đã từng KHÔNG khớp với câu chữ ngay trên nó: bản cũ viết "Một lá
              thư đã được gửi tới … lúc bạn đăng ký", tức khẳng định đúng cái điều đoạn này
              cấm khẳng định. Đã dựng lại được trên stack production với key Resend giữ chỗ:
              phụ huynh đăng ký xong, đọc câu đó, và ngồi chờ một lá thư không tồn tại.
              Một ghi chú nói ngược với đoạn chữ nó đang canh thì tệ hơn là không có ghi chú,
              vì lần đọc sau người ta tin ghi chú và không đọc lại câu chữ.
            */}
            <VerifyEmailButton />
          </Notice>
        </div>
      )}

      <h2 className="mb-3 mt-9 text-xl font-bold">Tài khoản của các bé</h2>

      {children.length === 0 ? (
        <EmptyState>Chưa có bé nào. Tạo tài khoản cho bé ở khung bên dưới nhé.</EmptyState>
      ) : (
        <ul className="mb-9 list-none space-y-4 p-0">
          {children.map((child) => (
            /* `scroll-mt-6`: neo `#be-...` đưa thẻ lên sát mép trên, và không có khoảng này
               thì tên bé dính sát vào mép cửa sổ trình duyệt. */
            <li key={child.id} id={`be-${child.username}`} className={`scroll-mt-6 p-5 ${MAT_THE}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">
                    {child.displayName}{' '}
                    {child.isLocked && (
                      <span className="align-middle text-sm font-semibold text-danger">
                        (đang khoá)
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-soft">
                    Tên đăng nhập: <strong>{child.username}</strong>
                    {child.birthYear ? ` · sinh năm ${child.birthYear}` : ''}
                  </p>
                </div>
                <LockToggle childId={child.id} isLocked={child.isLocked} />
              </div>

              <ResetPasswordForm childId={child.id} />

              {/* Đếm TỔNG game của bé, không đếm số dòng đang bày. Đếm dòng thì một bé có 26
                  game hiện "Game đã đăng (10)" — một con số sai về chính con mình. */}
              <p className="mt-5 font-semibold">
                Game đã đăng ({child.tongGame})
                {child.soTrang > 1 && (
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    · trang {Math.min(child.trang, child.soTrang)}/{child.soTrang}
                  </span>
                )}
              </p>
              {child.tongGame === 0 ? (
                <p className="text-ink-soft">Bé chưa đăng game nào.</p>
              ) : (
                <ul className="mt-2 list-none space-y-2 p-0">
                  {child.games.map((game) => (
                    <li
                      key={game.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-border px-3.5 py-2.5"
                    >
                      {/*
                        Ảnh bìa, và nó KHÔNG phải là link.

                        Tên game ngay cạnh đã dẫn tới đúng chỗ đó rồi. Bọc thêm ảnh
                        thành link nữa là mỗi game có hai điểm dừng bàn phím trỏ về
                        cùng một trang, và trình đọc màn hình đọc hai lần — với một
                        nhà bốn game thì thành tám lần. Nên `alt=""`: ảnh ở đây để
                        nhận ra game bằng mắt, nghĩa thì nằm ở cái tên.

                        `w-20 h-15` giữ đúng khổ 4:3 của sân khấu Scratch (480×360),
                        và khai cứng để dòng không nhảy khi ảnh vừa tải xong.

                        Mờ đi khi game không còn hiện: trạng thái đang được nói bằng
                        chữ ngay bên cạnh, thêm một tín hiệu nhìn thấy trước cả khi
                        đọc thì cả danh sách đọc được trong một cái liếc.
                      */}
                      <span className="flex min-w-0 items-center gap-3">
                        <img
                          src={objectUrl('thumb', game.thumbSha256)}
                          alt=""
                          width={80}
                          height={60}
                          loading="lazy"
                          data-testid="anh-bia-game"
                          className={`h-15 w-20 shrink-0 rounded-field border border-border bg-surface object-cover ${
                            game.status === 'PUBLISHED' && !biKhieuNai.has(game.id)
                              ? ''
                              : 'opacity-50'
                          }`}
                        />
                        <span className="min-w-0">
                        <Link href={`/game/${game.id}`} className="font-semibold">
                          {game.title}
                        </Link>
                        <span className="ml-2 text-sm text-ink-soft">
                          {game.playCount} lượt chơi
                          {biKhieuNai.has(game.id)
                            ? ' · tạm ẩn vì có yêu cầu gỡ bản quyền đang chờ xử lý'
                            : (
                                <>
                                  {game.status === 'LIMITED' && ' · tạm không hiện trên trang chủ'}
                                  {game.status === 'HIDDEN' && ' · đang ẩn'}
                                  {game.status === 'REMOVED' && ' · đã bị gỡ'}
                                </>
                              )}
                        </span>
                        </span>
                      </span>
                      {/*
                        `hidden` là "phụ huynh có đang ẩn game này không", KHÔNG phải
                        "game có hiện trên trang chủ không". Game LIMITED vẫn chơi được
                        bằng link nên nút phải ở trạng thái "Ẩn game" — hiện "Cho hiện
                        lại" thì bấm vào chẳng thay đổi gì (server tính lại vẫn ra
                        LIMITED) và người ta sẽ tưởng nút bị hỏng.

                        REMOVED thì không có nút: đó là phán quyết của admin, phụ huynh
                        không tự lật được, và server cũng từ chối.

                        Game đang bị khiếu nại bản quyền cũng vậy — server từ chối bật
                        lại, nên bày một cái nút "Hiện lại" ở đây chỉ để nó báo lỗi là
                        làm người ta bực và tưởng web hỏng.
                      */}
                      {game.status !== 'REMOVED' && !biKhieuNai.has(game.id) && (
                        /* `ml-auto justify-end`: khi hộp xác nhận mở ra nó rộng cả thẻ và
                           đẩy hai nút lên dòng trên — không có hai class này thì "Ẩn game"
                           nhảy từ mép phải sang mép trái, tức một nút không liên quan tự
                           di chuyển vì người dùng bấm nút bên cạnh nó.

                           Chú thích này là comment JS thường, KHÔNG bọc trong ngoặc nhọn:
                           chỗ này là vị trí BIỂU THỨC (nhánh của `&&`), nơi comment kiểu
                           JSX không hợp lệ — sai thì dev server trả 500 với
                           "Expected '</', got 'className'". Bẫy đã trả giá hai lần.

                           Và đừng viết ký tự đóng comment vào giữa phần chữ: nó kết thúc
                           comment ngay tại đó, phần còn lại thành code rác, lỗi báo ở một
                           dòng chẳng liên quan. Trả giá lần thứ ba trong cùng phiên. */
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <GameVisibilityToggle gameId={game.id} hidden={game.status === 'HIDDEN'} />
                          {/*
                            "Xoá hẳn" đứng CẠNH "Ẩn game" chứ không nằm ở đâu khác, vì hai
                            nút này là hai việc khác nhau mà người dùng đang tưởng là hai
                            mức của một việc: ẩn rút game khỏi trang, xoá mới thu hồi được
                            file. Để chúng xa nhau thì người cần cái thứ hai sẽ dừng ở cái
                            thứ nhất và tưởng đã xong.
                          */}
                          <DeleteGameButton
                            gameId={game.id}
                            title={game.title}
                            soNgayGiu={NGAY_GIU_GAME_DA_GO}
                          />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* `testId` riêng từng bé: một nhà nhiều bé thì trang có nhiều thanh phân
                  trang, và bộ kiểm phải chỉ đúng được thanh của bé nào. Trang vượt quá
                  cuối danh sách thì `Pager` tự nói ra thay vì để một danh sách rỗng giả
                  vờ là "Bé chưa đăng game nào". */}
              <Pager
                page={child.trang}
                lastPage={child.soTrang}
                href={hrefTrangBe(child.username)}
                testId={`pager-be-${child.username}`}
                className="mt-4"
              />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-9 text-xl font-bold">Tạo tài khoản cho bé</h2>

      {/*
        Chưa xác minh thì KHÔNG render form, thay bằng lời giải thích.

        Cố ý không render một form vô hiệu hoá: bố mẹ sẽ gõ hết ba ô rồi mới biết là
        không gửi được. Nói trước, và nói ở đúng chỗ họ đang định gõ.
      */}
      {!me?.emailVerifiedAt ? (
        <div data-testid="create-child-blocked" className="mb-12">
          <Notice tone="warn" role="status">
            Xác minh email xong là khung tạo tài khoản hiện ra ngay ở đây. Nếu chưa nhận được thư
            gửi tới <strong>{actor.email}</strong>, xem thử thư rác, hoặc bấm{' '}
            <strong>Gửi link xác minh</strong> ở phía trên.
          </Notice>
        </div>
      ) : (
      <AuthForm
        action={createChildAction}
        submitLabel="Tạo tài khoản"
        busyLabel="Đang tạo…"
        successMessage="Đã tạo tài khoản cho bé. Tải lại trang để thấy trong danh sách."
        rong="day"
      >
        <Field
          id="displayName"
          label="Tên hiển thị"
          hint="Tên này hiện công khai cạnh game — nên dùng tên gọi ở nhà, đừng dùng tên thật đầy đủ."
        >
          <TextInput id="displayName" name="displayName" required maxLength={40} placeholder="Bé Minh" />
        </Field>

        <Field
          id="username"
          label="Tên đăng nhập"
          hint="Chữ không dấu, số, dấu chấm hoặc gạch. Bé sẽ dùng tên này để đăng nhập."
        >
          <TextInput
            id="username"
            name="username"
            required
            placeholder="beminh"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field id="password" label="Mật khẩu cho bé" hint="Ít nhất 6 ký tự — đủ để bé nhớ được.">
          <TextInput id="password" name="password" type="password" required minLength={6} />
        </Field>

        <Field id="birthYear" label="Năm sinh của bé" hint="Không bắt buộc.">
          <TextInput
            id="birthYear"
            name="birthYear"
            type="number"
            min={thisYear - 18}
            max={thisYear}
            placeholder={String(thisYear - 9)}
          />
        </Field>
      </AuthForm>
      )}
    </>
  );
}
