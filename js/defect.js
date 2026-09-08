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
    else window._dashLoad();
  };

  /* ── 현황 (일자별 목록) ── */
  function photoList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const s = String(raw).trim();
    if (!s) return [];
    try { const j = JSON.parse(s); if (Array.isArray(j)) return j; } catch {}
    return s.split(',').map(u => u.trim()).filter(Boolean);
  }

  const tbody = paneEl.querySelector('#defect-tbody');
  const emptyEl = paneEl.querySelector('#defect-empty');
  const table = paneEl.querySelector('#defect-table');

  function renderStatus(rows) {
    if (!rows || !rows.length) {
      table.style.display = 'none';
      emptyEl.style.display = '';
      emptyEl.textContent = '해당 날짜에 등록된 부적합품이 없습니다.';
      return;
    }
    table.style.display = '';
    emptyEl.style.display = 'none';
    tbody.innerHTML = rows.map(r => {
      const photos = photoList(r.photo_urls).map(u => AIT_API.normalizePhotoUrl(u));
      const thumb = photos[0]
        ? `<img src="${esc(photos[0].replace(/=w\d+/,'=w200'))}" style="width:44px;height:44px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="window.openLightbox('${esc(photos[0])}','${esc(r.part_no||'')}')">`
        : '<span style="color:#d1d5db">-</span>';
      const statusColor = r.status === '완료' || r.status === 'done' ? '#16a34a' : (r.status === '진행중' || r.status === 'processing' ? '#d97706' : '#6b7280');
      return `<tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:7px 6px;white-space:nowrap;text-align:center">${esc(r.occurred_at || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center;font-weight:600">${esc(r.part_no || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center">${esc(r.product_model || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center">${esc(r.color || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center">${esc(r.vehicle_model || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center">${esc(r.defect_type_code || '')}</td>
        <td style="padding:7px 6px">${esc(r.detail_text || '')}</td>
        <td style="padding:7px 6px;text-align:center">${thumb}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center;color:${statusColor};font-weight:600">${esc(r.status || '')}</td>
        <td style="padding:7px 6px;white-space:nowrap;text-align:center;color:#6b7280">${esc(r.source_type || '')}</td>
      </tr>`;
    }).join('');
  }

  window._defectLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line) { renderStatus([]); emptyEl.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.'; return; }
    const date = dateInput.value || todayStr();
    try {
      const rows = await AIT_API.getDefectStatus(line, date);
      renderStatus(rows);
    } catch (e) {
      console.warn('부적합품현황 로드 실패', e);
      table.style.display = 'none';
      emptyEl.style.display = '';
      emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  /* ── 대시보드 (일/월/연 누적 추이) ── */
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

  if (!dateInput.value) dateInput.value = todayStr();
  window._defectSetView('status', paneEl.querySelector('#defect-subtabs [data-view="status"]'));
};
