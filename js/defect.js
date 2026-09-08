/* ══════════════════════════════════════════════════════════════
   부적합품현황 탭 모듈 (하위 탭: 현황 / 대시보드)
   tabs/defect.html 이 로드될 때 initDefectTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
window.initDefectTab = function initDefectTab() {
  const paneEl = document.getElementById('pane-defect');
  if (!paneEl) return;

  let view = 'status';
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
    granTabs.style.display = v === 'dashboard' ? 'flex' : 'none';
    window._defectRefresh();
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
        ? `<img src="${esc(photos[0].replace(/=w\d+/,'=w400'))}" style="width:100%;height:100%;object-fit:cover;cursor:pointer" onclick="window.openLightbox('${esc(photos[0])}','${esc(g.detail_text||'')}')">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f3f4f6;color:#9ca3af">
             <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
           </div>`;
      const top = g.rows[0];
      return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;display:flex;flex-direction:column">
        <div style="width:100%;aspect-ratio:4/3;background:#f3f4f6;overflow:hidden">${photoHtml}</div>
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
    const W = 940, H = 340, padL = 54, padR = 24, padT = 16, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const n = rows.length;
    let cum = 0;
    const cumVals = rows.map(r => (cum += (parseInt(r.cnt) || 0)));
    const cnts = rows.map(r => parseInt(r.cnt) || 0);
    const maxCnt = Math.max.apply(null, cnts.concat([1]));
    const maxCum = Math.max.apply(null, cumVals.concat([1]));

    function X(i) { return padL + (n <= 1 ? pw / 2 : (i / (n - 1)) * pw); }
    function Ybar(c) { return padT + (1 - c / maxCum) * ph; }
    function barW() { return Math.max(2, (pw / Math.max(n, 1)) * 0.5); }

    let svgHtml = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxCum * k / 4, y = Ybar(v);
      svgHtml += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef2f7"/>`;
      svgHtml += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${Math.round(v)}</text>`;
    }
    const bw = barW();
    rows.forEach((r, i) => {
      const c = cnts[i];
      const barH = maxCnt ? (c / maxCnt) * ph * 0.55 : 0;
      const x = X(i) - bw / 2, y = padT + ph - barH;
      svgHtml += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="#bfdbfe"><title>${labelFor(r.period)}: ${c}건</title></rect>`;
    });
    const pts = cumVals.map((v, i) => `${X(i)},${Ybar(v)}`).join(' ');
    svgHtml += `<polyline points="${pts}" fill="none" stroke="#1e3264" stroke-width="2"/>`;
    cumVals.forEach((v, i) => {
      svgHtml += `<circle cx="${X(i)}" cy="${Ybar(v)}" r="2.6" fill="#1e3264"><title>${labelFor(rows[i].period)} 누적: ${v}건</title></circle>`;
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
      dashChartTitle.textContent = `누적 발생건수 추이 — ${gran === 'day' ? '일별' : gran === 'month' ? '월별' : '연도별'}`;
      drawChart(rows);
    } catch (e) {
      console.warn('대시보드 로드 실패', e);
      dashSvg.innerHTML = ''; dashTiles.innerHTML = '';
      dashEmpty.style.display = ''; dashEmpty.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 대시보드: 불량유형별 일자별 누적건수 표 ── */
  const TYPE_TABLE_DAYS = 30;
  const typeTable = paneEl.querySelector('#dash-type-table');

  function last30Days() {
    const out = [];
    const now = new Date();
    for (let i = TYPE_TABLE_DAYS - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    return out;
  }

  function renderTypeTable(rows) {
    const days = last30Days();
    if (!rows || !rows.length) { typeTable.innerHTML = ''; return; }
    const groups = new Map(); // key -> { label, byDay: {day:cnt} }
    rows.forEach(r => {
      const key = `${r.defect_type_code || ''}|${r.detail_text || ''}`;
      if (!groups.has(key)) groups.set(key, { label: r.detail_text || r.defect_type_code || '(미분류)', byDay: {} });
      const g = groups.get(key);
      g.byDay[r.day] = (g.byDay[r.day] || 0) + (parseInt(r.cnt) || 0);
    });
    const list = Array.from(groups.values()).map(g => {
      let cum = 0;
      const cumByDay = days.map(d => (cum += (g.byDay[d] || 0)));
      return { label: g.label, cumByDay, total: cum };
    });
    list.sort((a, b) => b.total - a.total); // 건수 많은 유형이 위로
    const maxVal = Math.max.apply(null, list.map(g => g.total).concat([1]));

    const headCells = days.map(d => {
      const [, mm, dd] = d.split('-');
      return `<th style="padding:5px 6px;font-size:10px;font-weight:600;color:#fff;text-align:center">${mm}-${dd}</th>`;
    }).join('');
    const bodyRows = list.map(g => {
      const cells = g.cumByDay.map(v => {
        const alpha = v > 0 ? Math.min(0.35, 0.08 + (v / maxVal) * 0.27) : 0;
        const bg = v > 0 ? `background:rgba(37,99,235,${alpha.toFixed(2)})` : '';
        return `<td style="padding:5px 6px;text-align:center;color:#1e293b;${bg}">${v > 0 ? v : ''}</td>`;
      }).join('');
      return `<tr><td style="padding:5px 8px;font-weight:600;color:#374151;white-space:nowrap;position:sticky;left:0;background:#fff;border-right:1px solid #e5e7eb">${esc(g.label)}</td>${cells}</tr>`;
    }).join('');
    typeTable.innerHTML = `<thead><tr style="background:#1e3264"><th style="padding:5px 8px;text-align:left;color:#fff;position:sticky;left:0;background:#1e3264">불량유형</th>${headCells}</tr></thead><tbody>${bodyRows}</tbody>`;
  }

  window._dashLoadByType = async function () {
    const line = resolveLine();
    if (!line || !AIT_API.getDefectTrendByType) { typeTable.innerHTML = ''; return; }
    try {
      const rows = await AIT_API.getDefectTrendByType(line, TYPE_TABLE_DAYS);
      renderTypeTable(rows);
    } catch (e) {
      console.warn('불량유형별 추이 로드 실패', e);
      typeTable.innerHTML = '';
    }
  };

  if (!dateInput.value) dateInput.value = todayStr();
  window._defectSetView('status', paneEl.querySelector('#defect-subtabs [data-view="status"]'));
};
