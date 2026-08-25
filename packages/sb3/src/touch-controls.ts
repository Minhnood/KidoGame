import type { TouchKey } from './keys.js';

/**
 * Sinh CSS + JS cho bộ nút cảm ứng, nhúng vào trang game đã đóng gói.
 *
 * VÌ SAO phải nằm bên trong trang game: game chạy trong iframe KHÁC ORIGIN, nên
 * trang cha không thể bắn sự kiện bàn phím vào trong. Nút buộc phải sống cùng
 * runtime và gọi thẳng `vm.postIOData`.
 *
 * VÌ SAO gọi `vm.postIOData` chứ không giả lập KeyboardEvent: đây là API trực
 * tiếp của scratch-vm, không phụ thuộc vào việc listener gắn ở đâu hay
 * `isTrusted` có bị kiểm hay không.
 *
 * CẢNH BÁO: chuỗi trả về được chèn nguyên văn vào `options.custom.js`. Chỉ được
 * dựng từ hằng số và dữ liệu do CHÍNH TA sinh ra (danh sách phím đã lọc qua
 * whitelist trong keys.ts). Tuyệt đối không nối dữ liệu người dùng vào đây.
 */
export function buildTouchControls(keys: TouchKey[]): { css: string; js: string } {
  if (keys.length === 0) return { css: '', js: '' };

  const dpad = keys.filter((k) => k.group !== 'action');
  const actions = keys.filter((k) => k.group === 'action');

  // JSON.stringify trên dữ liệu đã qua whitelist -> an toàn để nhúng vào script.
  const payload = JSON.stringify({
    dpad: dpad.map((k) => ({ k: k.key, l: k.label, g: k.group })),
    actions: actions.map((k) => ({ k: k.key, l: k.label })),
  });

  const css = `
.kg-touch { position: fixed; inset: auto 0 0 0; z-index: 2147483000;
  display: none; justify-content: space-between; align-items: flex-end;
  /* Padding rộng: khung game có bo góc, nút sát mép sẽ bị cắt mất một phần. */
  padding: 14px; gap: 8px; pointer-events: none; }
/* Chỉ hiện trên thiết bị con trỏ thô (cảm ứng). Máy tính có bàn phím thật thì
   bày nút ra là thừa và che mất màn chơi. */
@media (pointer: coarse) { .kg-touch { display: flex; } }
.kg-pad { display: grid; grid-template-columns: repeat(3, var(--kg-size));
  grid-template-rows: repeat(3, var(--kg-size)); gap: 4px; pointer-events: auto; }
.kg-actions { display: flex; flex-wrap: wrap-reverse; gap: 8px;
  justify-content: flex-end; pointer-events: auto; }
.kg-btn { --kg-size: 56px;
  -webkit-tap-highlight-color: transparent; touch-action: none;
  user-select: none; -webkit-user-select: none;
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: 999px; font: 700 16px/1 system-ui, sans-serif;
  color: #1b1b32;
  /* Nền khá trong để còn nhìn thấy nhân vật phía sau. */
  background: rgba(255,255,255,.55);
  box-shadow: 0 1px 4px rgba(0,0,0,.25);
  width: var(--kg-size); height: var(--kg-size); }
.kg-act { width: auto; min-width: 62px; padding: 0 14px; }
.kg-btn:active, .kg-btn[data-held="1"] {
  background: rgba(255,140,26,.95); transform: scale(.94); }
.kg-up { grid-area: 1 / 2; } .kg-left { grid-area: 2 / 1; }
.kg-right { grid-area: 2 / 3; } .kg-down { grid-area: 3 / 2; }
/*
 * Khung game nhúng trên điện thoại chỉ cao khoảng 280-300px. Nút 56px sẽ chiếm
 * gần hết chỗ chơi và che mất nhân vật, nên thu nhỏ theo chiều cao khung.
 */
.kg-pad { --kg-size: 56px; }
@media (max-height: 460px) {
  .kg-touch { padding: 12px; }
  .kg-btn { --kg-size: 44px; font-size: 14px; }
  .kg-act { min-width: 54px; padding: 0 10px; }
}
@media (max-height: 320px) {
  .kg-btn { --kg-size: 38px; font-size: 13px; }
}
`.trim();

  const js = `
/* Nút điều khiển cảm ứng của KidoGame — sinh tự động theo phím mà game dùng. */
(function () {
  var SPEC = ${payload};
  var vm = window.vm;
  if (!vm || typeof vm.postIOData !== 'function') return;

  function send(key, isDown) {
    try { vm.postIOData('keyboard', { key: key, isDown: isDown }); } catch (e) {}
  }

  var held = Object.create(null);
  function press(btn, key) {
    if (held[key]) return;
    held[key] = true;
    btn.setAttribute('data-held', '1');
    send(key, true);
  }
  function release(btn, key) {
    if (!held[key]) return;
    held[key] = false;
    btn.removeAttribute('data-held');
    send(key, false);
  }

  function makeButton(key, label, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kg-btn ' + cls;
    b.textContent = label;
    b.setAttribute('aria-label', label);

    /* Pointer Events + setPointerCapture: giữ được nhiều nút cùng lúc (vừa chạy
       vừa nhảy), và ngón tay trượt ra ngoài nút vẫn nhận được pointerup nên
       phím không bị kẹt. */
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      press(b, key);
    });
    var up = function (e) { e.preventDefault(); release(b, key); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    /* Chặn menu giữ-lâu và double-tap-to-zoom trên iOS. */
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return b;
  }

  var wrap = document.createElement('div');
  wrap.className = 'kg-touch';

  var pad = document.createElement('div');
  pad.className = 'kg-pad';
  var POS = { 'dpad-up': 'kg-up', 'dpad-down': 'kg-down', 'dpad-left': 'kg-left', 'dpad-right': 'kg-right' };
  SPEC.dpad.forEach(function (d) { pad.appendChild(makeButton(d.k, d.l, POS[d.g])); });

  var acts = document.createElement('div');
  acts.className = 'kg-actions';
  SPEC.actions.forEach(function (a) { acts.appendChild(makeButton(a.k, a.l, 'kg-act')); });

  if (SPEC.dpad.length) wrap.appendChild(pad);
  else wrap.appendChild(document.createElement('div'));
  if (SPEC.actions.length) wrap.appendChild(acts);

  document.body.appendChild(wrap);

  /* Màn hình cờ xanh (#launch) phủ kín khung game và nghe sự kiện 'click'.
     D-pad nằm đè lên vùng giữa của nó, nên nếu hiện nút ngay từ đầu thì trên
     điện thoại trẻ chạm vào cờ xanh sẽ trúng nút điều khiển và KHÔNG khởi động
     được game. Chỉ hiện nút sau khi game đã bắt đầu. */
  var launch = document.getElementById('launch');
  function syncVisibility() {
    var blocking = launch && !launch.hidden;
    /* Xoá style inline để CSS quyết định (chỉ hiện trên thiết bị cảm ứng). */
    wrap.style.display = blocking ? 'none' : '';
  }
  if (launch && window.MutationObserver) {
    new MutationObserver(syncVisibility).observe(launch, {
      attributes: true,
      attributeFilter: ['hidden'],
    });
  }
  syncVisibility();

  /* Rời tab hoặc mất focus mà đang giữ phím -> nhả hết, không thì nhân vật chạy
     mãi khi quay lại. */
  function releaseAll() {
    Object.keys(held).forEach(function (k) {
      if (held[k]) { held[k] = false; send(k, false); }
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-held]'), function (el) {
      el.removeAttribute('data-held');
    });
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) releaseAll();
  });
})();
`.trim();

  return { css, js };
}
