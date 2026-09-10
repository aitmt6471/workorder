/* ══════════════════════════════════════════════════════════════
   부적합품현황 탭 모듈 (하위 탭: 현황 / 누적현황)
   tabs/defect.html 이 로드될 때 initDefectTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
// ponytail: 08.불량리워크잔량처리 시스템 DB(master_defect_type.category)의 2026-09-08 스냅샷.
// ait/defect/status·trend-by-type 웹훅이 category를 안 내려줘서 임시로 하드코딩함 —
// 관리자가 불량유형을 새로 등록/변경하면 이 표가 어긋난다. 웹훅 응답에 category 필드가
// 추가되면(master_defect_type JOIN) 이 맵은 지우고 서버값을 쓰도록 바꿀 것.
const DEFECT_CATEGORY_MAP = {
  '01.외관(VISION)': '기능', '07.WHITE LED(약어WL)(VISION)': '기능',
  '1. REVERSE CURRENT(VISION)': '기능', '기능': '기능', '기타': '기능', '비전+기능': '기능',
  'ETCS 바코드불량': '외관', 'MAP렌즈 설체결': '외관', 'TIR렌즈 설체결': '외관',
  '돌돌이': '외관', '라벨이종': '외관', '랜즈 이물': '외관', '백화': '외관',
  '부직포 누락': '외관', '스크래치': '외관', '작업불량': '외관', '찍힘': '외관',
  '부품불량': '외관', 'PART_DEFECT': '외관', '흑점': '외관', '오조립': '외관',
  '비전': '외관', '외관': '외관'
};

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
    const groups = new Map(); // key -> { key, defect_type_code, detail_text, rows: [] }
    rows.forEach(r => {
      if (r.status === 'FALSE_DEFECT') return; // 가성불량 제외
      if (cat !== 'all' && (DEFECT_CATEGORY_MAP[r.defect_type_code] || '기타') !== cat) return;
      const key = `${r.defect_type_code || ''}|${r.detail_text || ''}`;
      if (!groups.has(key)) groups.set(key, { key, defect_type_code: r.defect_type_code, detail_text: r.detail_text, rows: [] });
      groups.get(key).rows.push(r);
    });
    const list = Array.from(groups.values());
    list.forEach(g => g.rows.sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || ''))));
    list.sort((a, b) => String(b.rows[0]?.occurred_at || '').localeCompare(String(a.rows[0]?.occurred_at || '')));
    return list;
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
      const allTimeCount = Math.max(allTimeMap?.get(g.key) || 0, todayCount);
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
          <div style="font-size:13px;font-weight:800;color:#dc2626;line-height:1.35">${esc(g.detail_text || g.defect_type_code || '(미분류)')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;font-size:11px;color:#374151">
            <div><span style="color:#9ca3af">품번</span> ${esc(top.part_no || '-')}</div>
            <div><span style="color:#9ca3af">품명</span> ${esc(top.product_model || '-')}</div>
            <div><span style="color:#9ca3af">색상</span> ${esc(top.color || '-')}</div>
            <div><span style="color:#9ca3af">차종</span> ${esc(top.vehicle_model || '-')}</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:6px;border-top:1px dashed #e5e7eb;gap:6px">
            <span style="font-size:10.5px;color:#6b7280">발생일 ${esc(top.occurred_at || '')}${top.lot_no ? ' · LOT ' + esc(formatLotNo(top.lot_no)) : ''}</span>
            <span style="display:flex;gap:4px;flex-shrink:0">
              <span style="font-size:10.5px;font-weight:700;color:#1e3264;background:#eef3ff;border:1px solid #c9d4e8;border-radius:10px;padding:2px 8px">오늘 ${todayCount}건</span>
              <span style="font-size:10.5px;font-weight:700;color:#fff;background:#1e3264;border-radius:10px;padding:2px 8px">누적 ${allTimeCount}건</span>
            </span>
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
        loadAllTimeMap(line)
      ]);
      renderCards(rows, allTimeMap);
    } catch (e) {
      console.warn('부적합품현황 로드 실패', e);
      cardsEl.innerHTML = '';
      emptyEl.style.display = '';
      emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 누적현황: 이 라인에서 지금까지 발생한 불량유형 이력 (전체 기간 합계, 많은 순) ── */
  // ponytail: "전체 기간"을 요청할 API 파라미터가 없어 넉넉한 상한(10년)으로 근사한다.
  // trend-by-type이 전체기간 조회를 지원하게 되면 days 파라미터 자체를 없앨 것.
  const ALL_TIME_DAYS = 3650;
  const dashEmpty = paneEl.querySelector('#dash-empty');
  const paretoEl = paneEl.querySelector('#dash-pareto');
  const paretoTitleEl = paneEl.querySelector('#dash-pareto-title');

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
    paretoTitleEl.textContent = `전체 누적불량현황 (총 ${grandTotal}건)`;
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
      renderCumulative(buildTypeTotals(rows));
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
