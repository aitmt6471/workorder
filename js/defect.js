/* ══════════════════════════════════════════════════════════════
   부적합품현황 탭 모듈 (하위 탭: 현황 / 누적현황)
   tabs/defect.html 이 로드될 때 initDefectTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
// 카드 1장 = 서명 1건. 같은 (불량유형/상세/등록경로)로 묶인 원본 행이 여러 개여도
// 실제로 서명 버튼이 붙는 건 대표행(최신) 하나뿐이므로, 게이트/잠금 판정도 원본 행이
// 아니라 "카드" 단위(대표행)로 세야 한다 — 안 그러면 중복행 많은 유형은 전원 서명해도
// 영원히 100%가 안 돼 조장/반장이 잠긴 채로 안 풀리는 버그가 생긴다.
function _defectGroupReps(rows) {
  const groups = new Map();
  (rows || []).forEach(r => {
    if (r.status === 'FALSE_DEFECT') return;
    const key = `${r.defect_type_code || ''}|${r.detail_text || ''}|${r.source_type || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const reps = [];
  groups.forEach(arr => {
    arr.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')));
    reps.push(arr[0]);
  });
  return reps;
}

window.initDefectTab = function initDefectTab() {
  const paneEl = document.getElementById('pane-defect');
  if (!paneEl) return;

  let view = 'status';
  let cat = 'all';

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function resolveLine() {
    const car = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
    return (car && car.linename) || '';
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
  // 부적합품관리대장 표기(yy.mm.dd)를 yymmdd로 압축 — 점만 제거하면 되므로 뒤에 붙는
  // 순번(예: 26.09.08-01)도 그대로 살아 260908-01이 된다.
  function formatLotNo(v) {
    return v ? String(v).replace(/\./g, '') : '';
  }
  // 발생일 표시용 — 시간 제거 + yymmdd로 압축 ("2026-09-10 17:11:00" → "260910").
  function dateOnly(v) {
    return v ? String(v).slice(2, 10).replace(/-/g, '') : '';
  }

  const lineBadge = paneEl.querySelector('#defect-line-badge');
  const dateInput = paneEl.querySelector('#defect-date');
  const catTabs   = paneEl.querySelector('#defect-cat-tabs');
  const viewStatus    = paneEl.querySelector('#defect-view-status');
  const viewDashboard = paneEl.querySelector('#defect-view-dashboard');

  /* ── 하위 탭 전환 ── */
  window._defectSetView = function (v, btn) {
    view = v;
    paneEl.querySelectorAll('#defect-subtabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    viewStatus.style.display = v === 'status' ? '' : 'none';
    viewDashboard.style.display = v === 'dashboard' ? '' : 'none';
    dateInput.style.display = v === 'status' ? '' : 'none';
    catTabs.style.display = v === 'status' ? 'flex' : 'none';
    window._defectRefresh();
  };
  window._defectSetCat = function (c, btn) {
    cat = c;
    paneEl.querySelectorAll('#defect-cat-tabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window._defectLoad();
  };
  window._defectRefresh = function () {
    if (view === 'status') window._defectLoad();
    else window._cumulativeLoad();
  };

  /* ── 현황 (사진 카드 그리드, 불량유형별 그룹) ── */
  function photoList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const s = String(raw).trim();
    if (!s) return [];
    try { const j = JSON.parse(s); if (Array.isArray(j)) return j; } catch {}
    return s.split(',').map(u => u.trim()).filter(Boolean);
  }

  const cardsEl = paneEl.querySelector('#defect-cards');
  const emptyEl = paneEl.querySelector('#defect-empty');

  function groupForCards(rows) {
    const groups = new Map(); // key -> { key, defect_type_code, detail_text, source_type, rows: [] }
    rows.forEach(r => {
      if (r.status === 'FALSE_DEFECT') return; // 가성불량 제외
      if (cat !== 'all' && (r.category || '기타') !== cat) return;
      // source_type(공정/출하)도 키에 포함 — 같은 불량이라도 등록경로가 다르면 카드를 분리해
      // 배지로 보여줄 때 섞이지 않게 한다.
      const key = `${r.defect_type_code || ''}|${r.detail_text || ''}|${r.source_type || ''}`;
      // typeKey: 전체 누적건수(ait/defect/trend-by-type)는 source_type 구분 없이 집계돼 내려오므로
      // 그 조회 결과와 매칭할 때는 source_type을 뺀 키를 따로 쓴다.
      const typeKey = `${r.defect_type_code || ''}|${r.detail_text || ''}`;
      if (!groups.has(key)) groups.set(key, { key, typeKey, defect_type_code: r.defect_type_code, detail_text: r.detail_text, source_type: r.source_type, rows: [] });
      groups.get(key).rows.push(r);
    });
    const list = Array.from(groups.values());
    list.forEach(g => g.rows.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))));
    // 공정불량 카드끼리, 출하불량 카드끼리 묶어서 보이도록 source_type 우선 정렬 후 최신순.
    const SRC_ORDER = { '공정': 0, '출하': 1 };
    list.sort((a, b) => {
      const oa = SRC_ORDER[a.source_type] ?? 2;
      const ob = SRC_ORDER[b.source_type] ?? 2;
      if (oa !== ob) return oa - ob;
      return String(b.rows[0]?.occurred_at || '').localeCompare(String(a.rows[0]?.occurred_at || ''));
    });
    return list;
  }

  // 카드에는 작업자 서명만 표시 — 담당조장/담당반장은 전체 작업자 서명이 끝난 뒤
  // 상단 게이트 배너에서 하루치를 한 번에 일괄 서명한다.
  function workerSignRowHtml(defectId, name, signedAt, signImg) {
    if (signedAt) {
      return `<div class="sign-row" style="display:flex;align-items:center;gap:6px">
        <span style="font-size:10.5px;color:#9ca3af;width:44px;flex-shrink:0">작업자</span>
        ${signImg ? `<img src="${signImg}" alt="서명" style="height:20px;background:#fff;border:1px solid #d1d5db;border-radius:4px;flex-shrink:0">` : ''}
        <span style="font-size:11px;font-weight:700;color:#16a34a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
        <button style="margin-left:auto;font-size:10px;color:#9ca3af;background:none;border:none;cursor:pointer;text-decoration:underline;flex-shrink:0" onclick="window._defectOpenWorkerSign('${esc(defectId)}','${esc(name)}')">다시서명</button>
      </div>`;
    }
    return `<div class="sign-row" style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:10.5px;color:#9ca3af">작업자 서명 필요</span>
      <button style="font-size:10.5px;font-weight:700;color:#fff;background:#1e3264;border:none;border-radius:5px;padding:4px 10px;cursor:pointer" onclick="window._defectOpenWorkerSign('${esc(defectId)}','')">서명</button>
    </div>`;
  }

  function renderCards(rows, allTimeMap) {
    const groups = groupForCards(rows);
    if (!groups.length) {
      cardsEl.innerHTML = '';
      emptyEl.style.display = '';
      emptyEl.textContent = '해당 날짜에 등록된 부적합품이 없습니다.';
      return;
    }
    emptyEl.style.display = 'none';
    cardsEl.innerHTML = groups.map(g => {
      const todayCount = g.rows.length;
      // 오늘(선택일) 건수는 항상 전체 누적건수에 포함돼 있어야 하므로, 맵에 없거나
      // 오늘 건수보다 작게 잡히면(캐시 지연 등) 오늘 건수를 하한으로 삼는다.
      const allTimeCount = Math.max(allTimeMap?.get(g.typeKey) || 0, todayCount);
      const srcColor = g.source_type === '출하' ? { bg: '#fff7ed', fg: '#c2410c', bd: '#fed7aa' }
        : g.source_type === '공정' ? { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' }
        : { bg: '#f3f4f6', fg: '#6b7280', bd: '#e5e7eb' };
      const rep = g.rows.find(r => photoList(r.photo_urls).length > 0) || g.rows[0];
      const photos = photoList(rep.photo_urls).map(u => AIT_API.normalizePhotoUrl(u));
      const photoHtml = photos[0]
        ? `<img src="${esc(photos[0].replace(/=w\d+/,'=w800'))}" style="max-width:100%;max-height:100%;object-fit:contain;cursor:pointer" onclick="window.openLightbox('${esc(photos[0])}','${esc(g.detail_text||'')}')">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af">
             <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
           </div>`;
      const top = g.rows[0];
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
        <div style="width:100%;aspect-ratio:4/3;background:#f3f4f6;overflow:hidden;display:flex;align-items:center;justify-content:center">${photoHtml}</div>
        <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex:1">
          <div style="display:flex;align-items:flex-start;gap:6px">
            <span style="flex-shrink:0;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${srcColor.bg};color:${srcColor.fg};border:1px solid ${srcColor.bd}">${esc(g.source_type || '미상')}</span>
            <div style="font-size:13px;font-weight:800;color:#dc2626;line-height:1.35">${esc(g.detail_text || g.defect_type_code || '(미분류)')}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:11px;color:#374151">
            <div><span style="color:#9ca3af">품번</span> ${esc(top.part_no || '-')}</div>
            <div><span style="color:#9ca3af">품명</span> ${esc(top.product_model || '-')}</div>
            <div><span style="color:#9ca3af">색상</span> ${esc(top.color || '-')}</div>
            <div><span style="color:#9ca3af">차종</span> ${esc(top.vehicle_model || '-')}</div>
            <div><span style="color:#9ca3af">발생일</span> ${esc(dateOnly(top.occurred_at)) || '-'}</div>
            <div><span style="color:#9ca3af">LOT</span> ${top.lot_no ? esc(formatLotNo(top.lot_no)) : '-'}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;margin-top:auto;padding-top:6px;border-top:1px dashed #e5e7eb;gap:4px">
            <span style="font-size:10.5px;font-weight:700;color:#fff;background:#1e3264;border-radius:10px;padding:2px 6px;white-space:nowrap">누적 ${allTimeCount}건</span>
            <span style="font-size:10.5px;font-weight:700;color:#1e3264;background:#eef3ff;border:1px solid #c9d4e8;border-radius:10px;padding:2px 6px;white-space:nowrap">오늘 ${todayCount}건</span>
          </div>
          <div class="defect-sign-block" style="padding-top:6px;border-top:1px dashed #e5e7eb">
            ${workerSignRowHtml(top.defect_id, top.worker_name, top.worker_signed_at, top.worker_sign_img)}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // 카드의 "누적 N건" 배지용 — 라인별로 한 번 불러와 캐시(차종 전환 시 탭 재생성으로 자연 초기화됨)
  let _allTimeMapLine = null;
  let _allTimeMapPromise = null;
  function loadAllTimeMap(line) {
    if (_allTimeMapLine === line && _allTimeMapPromise) return _allTimeMapPromise;
    _allTimeMapLine = line;
    _allTimeMapPromise = (async () => {
      if (!AIT_API.getDefectTrendByType) return new Map();
      try {
        const rows = (await AIT_API.getDefectTrendByType(line, ALL_TIME_DAYS)) || [];
        return new Map(buildTypeTotals(rows).map(g => [g.key, g.total]));
      } catch (e) {
        console.warn('전체 누적건수 로드 실패', e);
        return new Map();
      }
    })();
    return _allTimeMapPromise;
  }

  window._defectLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line) { cardsEl.innerHTML = ''; emptyEl.style.display = ''; emptyEl.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.'; return; }
    const date = dateInput.value || todayStr();
    try {
      const [rows, allTimeMap] = await Promise.all([
        AIT_API.getDefectStatus(line, date),
        loadAllTimeMap(line),
        loadGateConfirm(line, date)
      ]);
      window._defectLastRows = rows;
      renderCards(rows, allTimeMap);
      renderGate(rows);
    } catch (e) {
      console.warn('부적합품현황 로드 실패', e);
      cardsEl.innerHTML = '';
      emptyEl.style.display = '';
      emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 작업자 서명 (카드별, 캔버스 서명패드 — main.js의 전자서명 모달 재사용) ── */
  window._defectOpenWorkerSign = function (defectId, prevName) {
    if (typeof window.openSignModalWith !== 'function') { alert('서명 모듈 로드 실패'); return; }
    window.openSignModalWith('작업자 서명', prevName || '', async (name, base64) => {
      try {
        await AIT_API.signDefect(defectId, 'worker', name, base64);
        await window._defectRefresh();
        if (typeof window._defectLockCheck === 'function') window._defectLockCheck();
      } catch (e) {
        alert('서명 실패: ' + (e.message || String(e)));
      }
    });
  };

  /* ── 담당조장/담당반장 일괄 서명 (하루치 전체를 한 번에) ── */
  const gateEl        = paneEl.querySelector('#defect-gate');
  const gateCountEl   = paneEl.querySelector('#gate-count');
  const gateProgEl    = paneEl.querySelector('#gate-progress');
  const gateRolesEl   = paneEl.querySelector('#gate-roles');
  const GATE_ROLES = [['leader', '담당조장'], ['manager', '담당반장']];
  let _gateConfirm = { leader: null, manager: null };

  function gateRoleSlotHtml(role, label, total, workerDone, confirm) {
    if (confirm) {
      return `<div style="border:1px solid #bfeed4;background:#eafbf1;border-radius:10px;padding:9px 11px;display:flex;align-items:center;gap:8px">
        <span style="font-size:11.5px;color:#6b7280;width:56px;flex-shrink:0">${label}</span>
        ${confirm.sign_img ? `<img src="${confirm.sign_img}" alt="서명" style="height:20px;background:#fff;border:1px solid #bfeed4;border-radius:4px;flex-shrink:0">` : ''}
        <span style="font-size:11.5px;font-weight:700;color:#16a34a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(confirm.name)}</span>
        <button style="font-size:10px;color:#9ca3af;background:none;border:none;cursor:pointer;text-decoration:underline;flex-shrink:0" onclick="window._defectOpenBatchSign('${role}','${label}')">다시서명</button>
      </div>`;
    }
    const enabled = total > 0 && workerDone === total;
    return `<div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:9px 11px;display:flex;align-items:center;gap:8px;${enabled ? '' : 'opacity:.6'}">
      <span style="font-size:11.5px;color:#6b7280;width:56px;flex-shrink:0">${label}</span>
      <span style="font-size:11px;color:#9ca3af;flex:1">${enabled ? '아직 서명 전' : '작업자 서명 전체 완료 후 가능'}</span>
      <button ${enabled ? '' : 'disabled'} style="font-size:11px;font-weight:700;border-radius:7px;padding:6px 11px;cursor:${enabled ? 'pointer' : 'not-allowed'};border:none;flex-shrink:0;background:${enabled ? '#1e3264' : '#c9d4e8'};color:${enabled ? '#fff' : '#9ca3af'}" onclick="window._defectOpenBatchSign('${role}','${label}')">일괄 서명</button>
    </div>`;
  }

  function renderGate(rows) {
    const reps = _defectGroupReps(rows); // 카드 단위(대표행)로 집계 — 중복행은 1건으로
    const total = reps.length;
    const workerDone = reps.filter(r => r.worker_signed_at).length;
    if (!gateEl) return;
    if (total === 0) { gateEl.style.display = 'none'; return; }
    gateEl.style.display = '';
    gateCountEl.textContent = `작업자 서명 ${workerDone}/${total}`;
    gateCountEl.style.color = workerDone === total ? '#16a34a' : '#1e3264';
    gateCountEl.style.background = workerDone === total ? '#eafbf1' : '#eef3ff';
    gateCountEl.style.borderColor = workerDone === total ? '#bfeed4' : '#c9d4e8';
    gateProgEl.style.width = `${Math.round(workerDone / total * 100)}%`;
    gateProgEl.style.background = workerDone === total ? '#16a34a' : '#1e3264';
    gateRolesEl.innerHTML = GATE_ROLES.map(([role, label]) =>
      gateRoleSlotHtml(role, label, total, workerDone, _gateConfirm[role])
    ).join('');
  }

  async function loadGateConfirm(line, date) {
    _gateConfirm = { leader: null, manager: null };
    if (!AIT_API.getDefectDailyConfirm) return;
    try {
      const rows = (await AIT_API.getDefectDailyConfirm(line, date)) || [];
      rows.forEach(r => { if (_gateConfirm.hasOwnProperty(r.role)) _gateConfirm[r.role] = r; });
    } catch (e) { console.warn('일괄서명 상태 로드 실패', e); }
  }

  window._defectOpenBatchSign = function (role, label) {
    if (typeof window.openSignModalWith !== 'function') { alert('서명 모듈 로드 실패'); return; }
    const line = resolveLine();
    const date = dateInput.value || todayStr();
    const prevName = (_gateConfirm[role] && _gateConfirm[role].name) || '';
    window.openSignModalWith(`${label} 일괄 서명`, prevName, async (name, base64) => {
      try {
        await AIT_API.saveDailyConfirm(line, date, role, name, base64);
        await loadGateConfirm(line, date);
        renderGate(window._defectLastRows || []);
        if (typeof window._defectLockCheck === 'function') window._defectLockCheck();
      } catch (e) {
        alert('일괄 서명 실패: ' + (e.message || String(e)));
      }
    });
  };

  /* ── 누적현황: 이 라인에서 지금까지 발생한 불량유형 이력 (전체/월별/일별, 많은 순) ── */
  // ponytail: "전체 기간"을 요청할 API 파라미터가 없어 넉넉한 상한(10년)으로 근사한다.
  // trend-by-type이 전체기간 조회를 지원하게 되면 days 파라미터 자체를 없앨 것.
  const ALL_TIME_DAYS = 3650;
  const dashEmpty = paneEl.querySelector('#dash-empty');
  const paretoEl = paneEl.querySelector('#dash-pareto');
  const paretoTitleEl = paneEl.querySelector('#dash-pareto-title');
  const dashMonthPicker = paneEl.querySelector('#dash-month-picker');
  const dashDatePicker  = paneEl.querySelector('#dash-date-picker');
  let dashPeriod = 'all';
  function periodLabel(p) {
    if (p === 'day') return dashDatePicker.value || '오늘';
    if (p === 'month') return dashMonthPicker.value || '이번달';
    return '전체';
  }
  window._defectSetDashPeriod = function (p, btn) {
    dashPeriod = p;
    paneEl.querySelectorAll('#dash-period-tabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    dashMonthPicker.style.display = p === 'month' ? '' : 'none';
    dashDatePicker.style.display  = p === 'day' ? '' : 'none';
    if (p === 'month' && !dashMonthPicker.value) dashMonthPicker.value = todayStr().slice(0, 7);
    if (p === 'day' && !dashDatePicker.value) dashDatePicker.value = todayStr();
    window._cumulativeLoad();
  };
  window._defectDashDateChange = function () { window._cumulativeLoad(); };

  // 기간 필터: trend-by-type은 "최근 N일" 단위만 지원하므로 넉넉히 통째로 받아온 뒤
  // day(YYYY-MM-DD) 필드 기준으로 선택한 월/일에 맞게 클라이언트에서 걸러낸다.
  function filterByPeriod(rows) {
    if (dashPeriod === 'day') {
      const d = dashDatePicker.value;
      return d ? rows.filter(r => r.day === d) : rows;
    }
    if (dashPeriod === 'month') {
      const m = dashMonthPicker.value; // YYYY-MM
      return m ? rows.filter(r => String(r.day || '').startsWith(m)) : rows;
    }
    return rows;
  }

  function buildTypeTotals(rows) {
    const groups = new Map(); // key -> { key, label, total }
    rows.forEach(r => {
      const key = `${r.defect_type_code || ''}|${r.detail_text || ''}`;
      if (!groups.has(key)) groups.set(key, { key, label: r.detail_text || r.defect_type_code || '(미분류)', total: 0 });
      groups.get(key).total += (parseInt(r.cnt) || 0);
    });
    return Array.from(groups.values()).sort((a, b) => b.total - a.total); // 건수 많은 유형이 위로
  }

  function renderCumulative(list) {
    if (!list.length) {
      paretoEl.innerHTML = '';
      dashEmpty.style.display = '';
      dashEmpty.textContent = '표시할 이력이 없습니다.';
      return;
    }
    dashEmpty.style.display = 'none';
    const grandTotal = list.reduce((s, g) => s + g.total, 0) || 1;
    paretoTitleEl.textContent = `${periodLabel(dashPeriod)} 누적불량현황 (총 ${grandTotal}건)`;
    const maxVal = list[0].total || 1;
    let cum = 0;
    paretoEl.innerHTML = list.map(g => {
      cum += g.total;
      const pct = (g.total / grandTotal * 100);
      const cumPct = (cum / grandTotal * 100);
      const barPct = (g.total / maxVal * 100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
        <div style="width:220px;flex-shrink:0;font-size:11.5px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(g.label)}">${esc(g.label)}</div>
        <div style="flex:1;background:#f1f5f9;border-radius:4px;height:16px;position:relative;overflow:hidden">
          <div style="width:${barPct}%;background:#2563eb;height:100%;border-radius:4px"></div>
        </div>
        <div style="width:110px;flex-shrink:0;text-align:right;font-size:11px;color:#1e293b"><b>${g.total}건</b> <span style="color:#9ca3af">(${pct.toFixed(1)}%)</span></div>
        <div style="width:70px;flex-shrink:0;text-align:right;font-size:10.5px;color:#94a3b8">누적 ${cumPct.toFixed(0)}%</div>
      </div>`;
    }).join('');
  }

  window._cumulativeLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line || !AIT_API.getDefectTrendByType) {
      paretoEl.innerHTML = ''; dashEmpty.style.display = '';
      dashEmpty.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.';
      return;
    }
    try {
      const rows = (await AIT_API.getDefectTrendByType(line, ALL_TIME_DAYS)) || [];
      renderCumulative(buildTypeTotals(filterByPeriod(rows)));
    } catch (e) {
      console.warn('누적현황 로드 실패', e);
      paretoEl.innerHTML = '';
      dashEmpty.style.display = '';
      dashEmpty.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  if (!dateInput.value) dateInput.value = todayStr();
  window._defectSetView('status', paneEl.querySelector('#defect-subtabs [data-view="status"]'));
};

/* ══════════════════════════════════════════════════════════════
   전날 부적합품 서명 잠금 — 로그인/차종전환 시 현재 아이템 라인의
   "전날" 부적합품이 1건이라도 있고 작업자/조장/반장 서명이 전부
   끝나지 않았으면 부적합품현황 탭으로 강제 진입 + 다른 메뉴 잠금.
   ══════════════════════════════════════════════════════════════ */
window._defectLockCheck = async function () {
  try {
    const car = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
    const line = car && car.linename;
    if (!line) { window._defectSetLock(false); return; }
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = n => String(n).padStart(2, '0');
    const yStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const [rows, confirmRows] = await Promise.all([
      AIT_API.getDefectStatus(line, yStr),
      AIT_API.getDefectDailyConfirm ? AIT_API.getDefectDailyConfirm(line, yStr) : Promise.resolve([])
    ]);
    const reps = _defectGroupReps(rows); // 카드 단위로 판정 — 중복행은 1건으로
    const workerUnsigned = reps.some(r => !r.worker_signed_at);
    const confirmedRoles = new Set((confirmRows || []).map(r => r.role));
    const batchMissing = !confirmedRoles.has('leader') || !confirmedRoles.has('manager');
    window._defectSetLock(reps.length > 0 && (workerUnsigned || batchMissing), yStr);
  } catch (e) {
    console.warn('전날 부적합품 서명 확인 실패', e);
  }
};

window._defectSetLock = function (locked, yStr) {
  document.body.classList.toggle('ait-defect-lock', !!locked);
  if (!locked) return;
  (async () => {
    if (typeof window.loadTab === 'function') await window.loadTab('defect');
    const nav = document.querySelector('.nav-item[data-tab="defect"]');
    if (nav && typeof window.showTab === 'function') window.showTab('defect', nav);
    const dateInput = document.querySelector('#defect-date');
    if (dateInput && yStr) dateInput.value = yStr;
    if (typeof window._defectRefresh === 'function') window._defectRefresh();
  })();
};
