/**
 * Kiểm TRẦN BĂM MẬT KHẨU của cả tiến trình.
 *
 * VÌ SAO cần bộ riêng: `LoginAttempt` khoá theo danh tính, nên đổi email mỗi
 * request là băm scrypt 64MB không giới hạn — không ai đếm tổng. Trần nằm trong
 * `apps/web/src/lib/password.ts`, và không có cách nào chạm tới nó qua giao diện:
 * muốn dựng lại tình huống phải gọi thẳng hàm, đúng lúc, đủ đông.
 *
 * VÌ SAO không nằm trong e2e: đây là chuyện đồng thời trong MỘT tiến trình Node.
 * Bắn request qua HTTP thì Next có pool riêng, và cái ta đo được sẽ là hành vi của
 * pool đó chứ không phải của trần.
 *
 * Chạy:
 *   cd apps/web && pnpm exec tsx ../../infra/scrypt-cap-check.ts
 */

// PHẢI đặt trước khi import module: trần được đọc một lần lúc nạp module.
process.env.SCRYPT_MAX_CONCURRENT = '2';
process.env.SCRYPT_MAX_QUEUE = '3';

const { hashPassword, verifyPassword, scryptLoad, ScryptBusyError } = await import(
  '../apps/web/src/lib/password.ts'
);

const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Theo dõi số lần băm chạy cùng lúc trong suốt một khoảng. */
function theoDoi() {
  let dinh = 0;
  const id = setInterval(() => {
    dinh = Math.max(dinh, scryptLoad().dangChay);
  }, 5);
  return {
    dung() {
      clearInterval(id);
      return dinh;
    },
  };
}

// ---------------------------------------------------------------------------
console.log('\n── Đường bình thường ───────────────────────────────────────');

const hash = await hashPassword('matkhau-cua-be');
check('Băm rồi verify đúng mật khẩu', await verifyPassword('matkhau-cua-be', hash));
check('Sai mật khẩu vẫn trả false', !(await verifyPassword('sai-roi', hash)));
check(
  'Hash hỏng trả false chứ không ném',
  (await verifyPassword('gi-cung-duoc', 'rac$khong$phai$hash')) === false
);

// ---------------------------------------------------------------------------
console.log('\n── Trần chạy cùng lúc ──────────────────────────────────────');

{
  // 2 chạy + 3 chờ = 5 suất, đúng bằng sức chứa. Không cái nào được bị từ chối.
  const do_ = theoDoi();
  const ket = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => hashPassword(`mk-${i}`))
  );
  const dinh = do_.dung();

  check(
    'Đủ sức chứa (2 chạy + 3 chờ) thì không ai bị từ chối',
    ket.every((r) => r.status === 'fulfilled'),
    `${ket.filter((r) => r.status === 'fulfilled').length}/5 xong`
  );
  /*
   * Phép kiểm quan trọng nhất của cả bộ: không phải "có từ chối được không" mà là
   * "trần có thật sự giữ được không". Đếm đôi trong semaphore sẽ lọt hết mọi phép
   * kiểm khác mà chỉ trượt ở đây.
   */
  check('Số lần băm cùng lúc KHÔNG bao giờ vượt trần', dinh <= 2, `đỉnh đo được ${dinh}/2`);
}

{
  // Quá sức chứa: cái thứ 6 trở đi phải bị từ chối NGAY, không xếp hàng vô hạn.
  const chay = Array.from({ length: 8 }, (_, i) => hashPassword(`qua-tai-${i}`));
  const ket = await Promise.allSettled(chay);
  const tuChoi = ket.filter((r) => r.status === 'rejected');

  check('Quá sức chứa thì có request bị từ chối', tuChoi.length > 0, `${tuChoi.length}/8 bị từ chối`);
  /*
   * `tuChoi.length > 0` phải nằm TRONG điều kiện, không chỉ ở phép kiểm trên.
   * `[].every(...)` trả về true, nên nếu bỏ trần đi thì phép kiểm này vẫn XANH —
   * xanh vì không có gì để xét. Đã thấy đúng vậy khi thử làm hỏng code.
   */
  check(
    'Từ chối bằng ScryptBusyError, không phải lỗi lạ',
    tuChoi.length > 0 &&
      tuChoi.every((r) => (r as PromiseRejectedResult).reason instanceof ScryptBusyError),
    tuChoi.length ? String((tuChoi[0] as PromiseRejectedResult).reason?.name) : 'không có cái nào bị từ chối'
  );
}

// ---------------------------------------------------------------------------
console.log('\n── Quá tải KHÔNG được kể thành "sai mật khẩu" ──────────────');

{
  /*
   * Đây là lỗi nguy hiểm nhất mà bản vá này có thể tự gây ra.
   *
   * `verifyPassword` có `catch` trả `false` để một dòng hash hỏng trong DB không
   * thành lỗi 500. Nếu cái `catch` đó nuốt luôn ScryptBusyError thì quá tải bị kể
   * lại thành "sai mật khẩu", `recordFailure()` đếm nó, và hệ thống tự khoá tài
   * khoản của người vô can — đúng vào lúc máy chủ đang bận nhất.
   */
  const nen = Array.from({ length: 5 }, (_, i) => hashPassword(`nen-${i}`).catch(() => null));
  await new Promise((r) => setTimeout(r, 10)); // để chúng chiếm hết suất

  let ketQua: unknown;
  try {
    ketQua = await verifyPassword('matkhau-cua-be', hash);
  } catch (e) {
    ketQua = e;
  }
  await Promise.allSettled(nen);

  check(
    'Bận thì verifyPassword NÉM ScryptBusyError, không trả false',
    ketQua instanceof ScryptBusyError,
    ketQua instanceof Error ? ketQua.name : `trả về ${String(ketQua)}`
  );
}

// ---------------------------------------------------------------------------
console.log('\n── Không rò suất ───────────────────────────────────────────');

{
  // Mọi thứ đã xong: bộ đếm phải về 0. Rò một suất mỗi lần lỗi thì sau vài giờ
  // trần tụt dần về 0 và không ai đăng nhập được nữa — hỏng kiểu im lặng, chỉ lộ
  // sau khi chạy lâu, tức là chỉ lộ trên production.
  await new Promise((r) => setTimeout(r, 50));
  const tai = scryptLoad();
  check('Xong hết thì bộ đếm về 0', tai.dangChay === 0 && tai.hangCho === 0, JSON.stringify(tai));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kiểm tra đạt`);
process.exit(failed.length === 0 ? 0 : 1);
