/* ══════════════════════════════════════════════════════════════
   MesMove — 공유 박스라벨 스캔→자재창고(00025)→생산창고 이동 모달
   shipping.html / material-move.html 공용.
   MesMove.open({ pn, name, need, line, wh, emp, itemIds, onComplete })
     · 스캔 = ait/spec/label-info 로 자재창고 재고·품번 검증
     · 1스캔=1박스 누적, 필요수량 초과 차단
     · 확정 = ait/spec/stock-move (채번→SP_PDA_STWM_WHMOVE_I)
              → 필요수량 충족 시 itemIds 각각 item-done(이동완료, done_by)
   의존: AIT_API (api.js). 필요 메서드: labelInfo, stockMove, update... (item-done)
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const OUT_WH = '00025'; // 자재창고
  let mv = null, busy = false, el = null;

  const css = `
  #mesmove{position:fixed;inset:0;z-index:8000;background:rgba(15,23,42,.62);display:none;align-items:flex-end;justify-content:center;
    font-family:'Malgun Gothic','맑은 고딕',-apple-system,system-ui,sans-serif}
  #mesmove.open{display:flex}
  #mesmove .box{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:520px;max-height:94vh;overflow:auto;display:flex;flex-direction:column}
  #mesmove .hd{background:#1e3264;color:#fff;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:2}
  #mesmove .hd .t{font-weight:800;font-size:17px}
  #mesmove .x{width:34px;height:34px;border:none;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:17px;cursor:pointer}
  #mesmove .bd{padding:14px 16px}
  #mesmove .pn{font-family:ui-monospace,monospace;font-size:22px;font-weight:800;color:#1e3264}
  #mesmove .nm{font-size:14px;color:#64748b;margin:2px 0 10px}
  #mesmove .stat{display:flex;gap:8px;margin:10px 0}
  #mesmove .stat>div{flex:1;background:#f1f5f9;border-radius:11px;padding:9px;text-align:center}
  #mesmove .stat .lab{font-size:12px;color:#64748b}
  #mesmove .stat .val{font-size:22px;font-weight:800;color:#1e3264;margin-top:2px}
  #mesmove .stat .val.cur{color:#15803d}
  #mesmove .scan{width:100%;font-size:18px;padding:14px;border:2px solid #1e3264;border-radius:11px;margin:6px 0 4px;min-height:54px;font-family:ui-monospace,monospace;box-sizing:border-box}
  #mesmove .hint{font-size:12px;color:#94a3b8;margin-bottom:8px}
  #mesmove .blist{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-top:6px}
  #mesmove .brow{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:14px}
  #mesmove .brow:last-child{border-bottom:none}
  #mesmove .brow .lb{font-family:ui-monospace,monospace;flex:1;color:#475569}
  #mesmove .brow .q{font-weight:800;color:#15803d}
  #mesmove .brow .del{border:none;background:#fee2e2;color:#b91c1c;border-radius:6px;width:28px;height:28px;font-size:15px;cursor:pointer}
  #mesmove .foot{position:sticky;bottom:0;background:#fff;padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;gap:10px}
  #mesmove .foot button{flex:1;min-height:54px;border:none;border-radius:11px;font-size:17px;font-weight:800;cursor:pointer}
  #mesmove .cancel{background:#f1f5f9;color:#64748b}
  #mesmove .confirm{background:#16a34a;color:#fff}
  #mesmove .confirm:disabled{background:#cbd5e1}
  #mesmove-toast{position:fixed;bottom:78px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:11px 20px;border-radius:10px;font-size:16px;opacity:0;transition:opacity .2s;z-index:8100;pointer-events:none;max-width:90vw;text-align:center}
  #mesmove-toast.show{opacity:.97}#mesmove-toast.err{background:#b91c1c}
  `;
  function injectOnce() {
    if (el) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    el = document.createElement('div'); el.id = 'mesmove';
    el.innerHTML = `<div class="box">
      <div class="hd"><span class="t" id="mm-title">이동처리</span><button class="x" id="mm-x">✕</button></div>
      <div class="bd">
        <div class="pn" id="mm-pn"></div><div class="nm" id="mm-nm"></div>
        <div class="stat">
          <div><div class="lab">필요수량</div><div class="val" id="mm-need">0</div></div>
          <div><div class="lab">스캔 누적</div><div class="val cur" id="mm-cur">0</div></div>
          <div><div class="lab">박스</div><div class="val" id="mm-box">0</div></div>
        </div>
        <input class="scan" id="mm-scan" placeholder="📷 박스라벨 스캔 (PDA)" autocomplete="off" inputmode="none" virtualkeyboardpolicy="manual">
        <div class="hint" id="mm-hint"></div>
        <div class="blist" id="mm-blist"></div>
      </div>
      <div class="foot"><button class="cancel" id="mm-cancel">취소</button>
        <button class="confirm" id="mm-ok" disabled>이동 확정</button></div>
    </div>`;
    document.body.appendChild(el);
    const t = document.createElement('div'); t.id = 'mesmove-toast'; document.body.appendChild(t);
    document.getElementById('mm-x').onclick = close;
    document.getElementById('mm-cancel').onclick = close;
    document.getElementById('mm-ok').onclick = confirm;
    document.getElementById('mm-scan').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onScan(); } });
    el.addEventListener('click', e => { if (e.target === el) close(); });
  }

  function toast(msg, err) { const t = document.getElementById('mesmove-toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); setTimeout(() => t.className = '', 2200); }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.frequency.value = 220; o.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 180); } catch (_) {} }
  function fmt(n) { n = Math.round(Number(n) * 1000) / 1000; return n.toLocaleString('en-US', { maximumFractionDigits: 3 }); }

  function renderBoxes() {
    const cur = mv.boxes.reduce((a, b) => a + b.qty, 0);
    document.getElementById('mm-cur').textContent = fmt(cur);
    document.getElementById('mm-box').textContent = mv.boxes.length;
    document.getElementById('mm-blist').innerHTML = mv.boxes.map((b, i) =>
      `<div class="brow"><span class="lb">${b.label}</span><span class="q">${fmt(b.qty)}</span><button class="del" data-i="${i}">✕</button></div>`).join('')
      || '<div class="brow" style="color:#cbd5e1;justify-content:center">스캔된 박스 없음</div>';
    document.querySelectorAll('#mm-blist .del').forEach(btn => btn.onclick = () => { mv.boxes.splice(+btn.dataset.i, 1); renderBoxes(); focusScan(); });
    document.getElementById('mm-ok').disabled = mv.boxes.length === 0;
  }
  function focusScan() { const s = document.getElementById('mm-scan'); if (s) s.focus(); }

  async function onScan() {
    if (!mv) return;
    const inp = document.getElementById('mm-scan');
    const label = inp.value.trim(); inp.value = '';
    if (!label) return;
    const cur = mv.boxes.reduce((a, b) => a + b.qty, 0);
    if (cur >= mv.need) { toast('필요수량 도달 — 추가 스캔 차단', true); beep(); return focusScan(); }
    if (mv.boxes.some(b => b.label === label)) { toast('이미 스캔된 라벨입니다', true); beep(); return focusScan(); }
    try {
      const r = await AIT_API.labelInfo(label, OUT_WH);
      if (!r || !r.ok) { toast('자재창고에 없는 라벨입니다', true); beep(); return focusScan(); }
      if (String(r.item) !== String(mv.pn)) { toast(`품번 불일치: 스캔 ${r.item} ≠ 요청 ${mv.pn}`, true); beep(); return focusScan(); }
      mv.boxes.push({ sysitem: r.sysitem, label: r.label, lot: r.lot, qty: Number(r.qty) || 0 });
      renderBoxes(); toast(`+1박스 (${fmt(r.qty)})`);
    } catch (e) { toast('조회 오류: ' + (e.message || e), true); }
    focusScan();
  }

  async function confirm() {
    if (!mv || !mv.boxes.length || busy) return;
    busy = true; const ok = document.getElementById('mm-ok'); ok.disabled = true; ok.textContent = '처리 중...';
    try {
      const r = await AIT_API.stockMove({ out_wh: OUT_WH, in_wh: mv.wh, emp: mv.emp, boxes: mv.boxes });
      if (r && r.ok) {
        const moved = mv.boxes.reduce((a, b) => a + b.qty, 0);
        if (moved >= mv.need) {
          for (const id of mv.itemIds) { try { await AIT_API.shipItemDone(Number(id), mv.emp); } catch (_) {} }
          toast('이동 완료 (' + r.no_stwm + ')');
        } else {
          toast('부분이동 (' + fmt(moved) + '/' + fmt(mv.need) + ') — 요청 미완료 유지');
        }
        const cb = mv.onComplete; close(); if (cb) cb();
      } else { toast('이동 실패: ' + ((r && r.error) || '알 수 없는 오류'), true); beep(); }
    } catch (e) { toast('이동 오류: ' + (e.message || e), true); beep(); }
    finally { busy = false; ok.disabled = false; ok.textContent = '이동 확정'; }
  }

  function open(opts) {
    injectOnce();
    if (!opts.wh) { toast('생산창고 매핑을 찾을 수 없습니다', true); return; }
    mv = { pn: String(opts.pn), name: opts.name || '', need: Number(opts.need) || 0,
      line: opts.line || '', wh: opts.wh, emp: opts.emp || '', itemIds: opts.itemIds || [], boxes: [], onComplete: opts.onComplete };
    document.getElementById('mm-title').textContent = (opts.line || '') + ' 이동처리';
    document.getElementById('mm-pn').textContent = mv.pn;
    document.getElementById('mm-nm').textContent = mv.name;
    document.getElementById('mm-need').textContent = fmt(mv.need);
    document.getElementById('mm-hint').innerHTML = `자재창고(00025) → ${opts.line || ''} (${opts.wh}) 이동`;
    renderBoxes();
    el.classList.add('open');
    setTimeout(focusScan, 100);
  }
  function close() { if (el) el.classList.remove('open'); mv = null; }

  window.MesMove = { open, close };
})();
