/* ══════════════════════════════════════════════════════════════
   부적합품현황 탭 모듈 (하위 탭: 현황 / 추이현황)
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
  let gran = 'day';

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

  const lineBadge = paneEl.querySelector('#defect-line-badge');
  const dateInput = paneEl.querySelector('#defect-date');
  const catTabs   = paneEl.querySelector('#defect-cat-tabs');
  const granTabs  = paneEl.querySelector('#defect-gran-tabs');
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
    granTabs.style.display = v === 'dashboard' ? 'flex' : 'none';
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
    else { window._dashLoad(); window._dashLoadByType(); }
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

  function renderCards(rows) {
    const groups = groupForCards(rows);
    if (!groups.length) {
      cardsEl.innerHTML = '';
      emptyEl.style.display = '';
      emptyEl.textContent = '해당 날짜에 등록된 부적합품이 없습니다.';
      return;
    }
    emptyEl.style.display = 'none';
    cardsEl.innerHTML = groups.map(g => {
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
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:6px;border-top:1px dashed #e5e7eb">
            <span style="font-size:10.5px;color:#6b7280">${esc(top.occurred_at || '')}</span>
            <span style="font-size:10.5px;font-weight:700;color:#fff;background:#1e3264;border-radius:10px;padding:2px 8px">누적 ${g.rows.length}건</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  window._defectLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line) { cardsEl.innerHTML = ''; emptyEl.style.display = ''; emptyEl.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.'; return; }
    const date = dateInput.value || todayStr();
    try {
      const rows = await AIT_API.getDefectStatus(line, date);
      renderCards(rows);
    } catch (e) {
      console.warn('부적합품현황 로드 실패', e);
      cardsEl.innerHTML = '';
      emptyEl.style.display = '';
      emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 대시보드: 총합 추이 (일/월/연 누적) ── */
  function labelFor(period) {
    if (!period) return '';
    const parts = String(period).split('-');
    if (gran === 'day' && parts.length === 3) return `${parts[1]}-${parts[2]}`;
    if (gran === 'month' && parts.length === 2) return `${parts[0]}-${parts[1]}`;
    return parts[0];
  }

  const dashEmpty = paneEl.querySelector('#dash-empty');
  const dashTiles = paneEl.querySelector('#dash-tiles');
  const dashChartTitle = paneEl.querySelector('#dash-chart-title');
  const dashSvg = paneEl.querySelector('#dash-svg');

  function renderTiles(rows, total, maxRow) {
    const avg = rows.length ? (total / rows.length) : 0;
    const t = [
      ['총 발생건수', total, '#1e293b'],
      ['최다 발생', maxRow ? `${maxRow.cnt}건 (${labelFor(maxRow.period)})` : '-', '#dc2626'],
      ['구간 평균', avg.toFixed(1) + '건', '#1e293b']
    ];
    dashTiles.innerHTML = t.map(x =>
      `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px">
        <div style="font-size:11px;color:#64748b">${x[0]}</div>
        <div style="font-size:19px;font-weight:800;margin-top:4px;color:${x[2]}">${x[1]}</div>
      </div>`).join('');
  }

  function drawChart(rows) {
    const W = 940, H = 340, padL = 44, padR = 24, padT = 16, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const n = rows.length;
    const cnts = rows.map(r => parseInt(r.cnt) || 0);
    const maxCnt = Math.max.apply(null, cnts.concat([1]));

    function X(i) { return padL + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw); }
    function Ybar(c) { return padT + (1 - c / maxCnt) * ph; }
    function barW() { return Math.max(3, (pw / Math.max(n, 1)) * 0.6); }

    let svgHtml = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxCnt * k / 4, y = Ybar(v);
      svgHtml += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef2f7"/>`;
      svgHtml += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${Math.round(v)}</text>`;
    }
    const bw = barW();
    rows.forEach((r, i) => {
      const c = cnts[i];
      const barH = maxCnt ? (c / maxCnt) * ph : 0;
      const x = X(i) - bw / 2, y = padT + ph - barH;
      svgHtml += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="#60a5fa" rx="2"><title>${labelFor(r.period)}: ${c}건</title></rect>`;
      if (c > 0) svgHtml += `<text x="${X(i)}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#475569">${c}</text>`;
    });
    const step = Math.max(1, Math.ceil(n / 12));
    for (let i = 0; i < n; i += step) {
      svgHtml += `<text x="${X(i)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="#94a3b8">${labelFor(rows[i].period)}</text>`;
    }
    dashSvg.innerHTML = svgHtml;
    dashSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  window._dashSetGran = function (g, btn) {
    gran = g;
    paneEl.querySelectorAll('#defect-gran-tabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window._dashLoad();
    window._dashLoadByType();
  };

  window._dashLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line) {
      dashSvg.innerHTML = ''; dashTiles.innerHTML = '';
      dashEmpty.style.display = ''; dashEmpty.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.';
      return;
    }
    try {
      const rows = (await AIT_API.getDefectTrend(line, gran)) || [];
      if (!rows.length) {
        dashSvg.innerHTML = ''; dashTiles.innerHTML = '';
        dashEmpty.style.display = ''; dashEmpty.textContent = '표시할 데이터가 없습니다.';
        return;
      }
      dashEmpty.style.display = 'none';
      rows.sort((a, b) => String(a.period).localeCompare(String(b.period)));
      const total = rows.reduce((s, r) => s + (parseInt(r.cnt) || 0), 0);
      const maxRow = rows.reduce((m, r) => (parseInt(r.cnt) || 0) > (parseInt(m?.cnt) || -1) ? r : m, null);
      renderTiles(rows, total, maxRow);
      dashChartTitle.textContent = `발생건수 추이 — ${gran === 'day' ? '일별' : gran === 'month' ? '월별' : '연도별'}`;
      drawChart(rows);
    } catch (e) {
      console.warn('대시보드 로드 실패', e);
      dashSvg.innerHTML = ''; dashTiles.innerHTML = '';
      dashEmpty.style.display = ''; dashEmpty.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 추이현황: 불량유형 파레토 (외관/기능 필터 + 일/월/연 기간창) ── */
  // gran(상단 일별/월별/연도별)에 맞춰 파레토 집계 기간창도 함께 늘어난다.
  const PARETO_DAYS = { day: 30, month: 365, year: 1095 };
  const PARETO_WINDOW_LABEL = { day: '최근 30일', month: '최근 12개월', year: '최근 3년' };
  let paretoCat = 'all';
  const paretoEl = paneEl.querySelector('#dash-pareto');
  const paretoTitleEl = paneEl.querySelector('#dash-pareto-title');
  let _paretoRawRows = [];

  function buildTypeTotals(rows, filterCat) {
    const groups = new Map(); // key -> { label, type_code, total }
    rows.forEach(r => {
      if (filterCat !== 'all' && (DEFECT_CATEGORY_MAP[r.defect_type_code] || '기타') !== filterCat) return;
      const key = `${r.defect_type_code || ''}|${r.detail_text || ''}`;
      if (!groups.has(key)) groups.set(key, { label: r.detail_text || r.defect_type_code || '(미분류)', total: 0 });
      groups.get(key).total += (parseInt(r.cnt) || 0);
    });
    return Array.from(groups.values()).sort((a, b) => b.total - a.total); // 건수 많은 유형이 위로
  }

  function renderPareto() {
    const list = buildTypeTotals(_paretoRawRows, paretoCat);
    paretoTitleEl.textContent = `불량유형 파레토 (${paretoCat === 'all' ? '외관+기능 통합' : paretoCat}, ${PARETO_WINDOW_LABEL[gran]})`;
    if (!list.length) { paretoEl.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:8px 0">표시할 데이터가 없습니다.</div>'; return; }
    const grandTotal = list.reduce((s, g) => s + g.total, 0) || 1;
    const maxVal = list[0].total || 1;
    let cum = 0;
    paretoEl.innerHTML = list.map(g => {
      cum += g.total;
      const pct = (g.total / grandTotal * 100);
      const cumPct = (cum / grandTotal * 100);
      const barPct = (g.total / maxVal * 100).toFixed(1);
      return `<div style="display:flex;align-items:center;gap:10px;padding:4px 0">
        <div style="width:200px;flex-shrink:0;font-size:11.5px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(g.label)}">${esc(g.label)}</div>
        <div style="flex:1;background:#f1f5f9;border-radius:4px;height:16px;position:relative;overflow:hidden">
          <div style="width:${barPct}%;background:#2563eb;height:100%;border-radius:4px"></div>
        </div>
        <div style="width:110px;flex-shrink:0;text-align:right;font-size:11px;color:#1e293b"><b>${g.total}건</b> <span style="color:#9ca3af">(${pct.toFixed(1)}%)</span></div>
        <div style="width:70px;flex-shrink:0;text-align:right;font-size:10.5px;color:#94a3b8">누적 ${cumPct.toFixed(0)}%</div>
      </div>`;
    }).join('');
  }

  window._dashSetParetoCat = function (c, btn) {
    paretoCat = c;
    paneEl.querySelectorAll('#dash-pareto-cat-tabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderPareto();
  };

  window._dashLoadByType = async function () {
    const line = resolveLine();
    if (!line || !AIT_API.getDefectTrendByType) { paretoEl.innerHTML = ''; return; }
    try {
      _paretoRawRows = (await AIT_API.getDefectTrendByType(line, PARETO_DAYS[gran])) || [];
      renderPareto();
    } catch (e) {
      console.warn('불량유형별 추이 로드 실패', e);
      paretoEl.innerHTML = '';
    }
  };

  if (!dateInput.value) dateInput.value = todayStr();
  window._defectSetView('status', paneEl.querySelector('#defect-subtabs [data-view="status"]'));
};
