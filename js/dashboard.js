/* ══════════════════════════════════════════════════════════════
   대시보드 탭 모듈 — 부적합품 발생추이 (일/월/연 누적)
   tabs/dashboard.html 이 로드될 때 initDashboardTab() 을 호출한다.
   순수 SVG 렌더링 (spc.js drawChart 패턴 참고, 신규 차트 라이브러리 미사용)
   ══════════════════════════════════════════════════════════════ */
window.initDashboardTab = function initDashboardTab() {
  const paneEl = document.getElementById('pane-dashboard');
  if (!paneEl) return;

  let gran = 'day';

  function resolveLine() {
    const car = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
    return (car && car.linename) || '';
  }

  // period(예: '2026-09-08' / '2026-09' / '2026')를 항상 0으로 채워진 형태로 축약 표시
  function labelFor(period) {
    if (!period) return '';
    const parts = String(period).split('-');
    if (gran === 'day' && parts.length === 3) return `${parts[1]}-${parts[2]}`;
    if (gran === 'month' && parts.length === 2) return `${parts[0]}-${parts[1]}`;
    return parts[0];
  }

  const lineBadge  = paneEl.querySelector('#dash-line-badge');
  const emptyEl    = paneEl.querySelector('#dash-empty');
  const tilesEl    = paneEl.querySelector('#dash-tiles');
  const chartTitle = paneEl.querySelector('#dash-chart-title');
  const svg        = paneEl.querySelector('#dash-svg');

  function renderTiles(rows, total, maxRow) {
    const avg = rows.length ? (total / rows.length) : 0;
    const t = [
      ['총 발생건수', total, '#1e293b'],
      ['최다 발생', maxRow ? `${maxRow.cnt}건 (${labelFor(maxRow.period)})` : '-', '#dc2626'],
      ['구간 평균', avg.toFixed(1) + '건', '#1e293b']
    ];
    tilesEl.innerHTML = t.map(x =>
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
    // y 그리드 (누적 기준)
    for (let k = 0; k <= 4; k++) {
      const v = maxCum * k / 4, y = Ybar(v);
      svgHtml += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef2f7"/>`;
      svgHtml += `<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#94a3b8">${Math.round(v)}</text>`;
    }
    // 막대 (구간별 발생건수, 우측 축 = maxCnt 스케일)
    const bw = barW();
    rows.forEach((r, i) => {
      const c = cnts[i];
      const barH = maxCnt ? (c / maxCnt) * ph * 0.55 : 0;
      const x = X(i) - bw / 2, y = padT + ph - barH;
      svgHtml += `<rect x="${x}" y="${y}" width="${bw}" height="${barH}" fill="#bfdbfe"><title>${labelFor(r.period)}: ${c}건</title></rect>`;
    });
    // 누적 꺾은선
    const pts = cumVals.map((v, i) => `${X(i)},${Ybar(v)}`).join(' ');
    svgHtml += `<polyline points="${pts}" fill="none" stroke="#1e3264" stroke-width="2"/>`;
    cumVals.forEach((v, i) => {
      svgHtml += `<circle cx="${X(i)}" cy="${Ybar(v)}" r="2.6" fill="#1e3264"><title>${labelFor(rows[i].period)} 누적: ${v}건</title></circle>`;
    });
    // x 라벨 (최대 12개)
    const step = Math.max(1, Math.ceil(n / 12));
    for (let i = 0; i < n; i += step) {
      svgHtml += `<text x="${X(i)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="#94a3b8">${labelFor(rows[i].period)}</text>`;
    }
    svg.innerHTML = svgHtml;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  window._dashSetGran = function (g, btn) {
    gran = g;
    paneEl.querySelectorAll('#dash-gran-tabs .proc-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window._dashLoad();
  };

  window._dashLoad = async function () {
    const line = resolveLine();
    lineBadge.textContent = line ? `· 라인: ${line}` : '· 라인 미등록 아이템';
    if (!line) {
      svg.innerHTML = ''; tilesEl.innerHTML = '';
      emptyEl.style.display = ''; emptyEl.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.';
      return;
    }
    try {
      const rows = (await AIT_API.getDefectTrend(line, gran)) || [];
      if (!rows.length) {
        svg.innerHTML = ''; tilesEl.innerHTML = '';
        emptyEl.style.display = ''; emptyEl.textContent = '표시할 데이터가 없습니다.';
        return;
      }
      emptyEl.style.display = 'none';
      rows.sort((a, b) => String(a.period).localeCompare(String(b.period)));
      const total = rows.reduce((s, r) => s + (parseInt(r.cnt) || 0), 0);
      const maxRow = rows.reduce((m, r) => (parseInt(r.cnt) || 0) > (parseInt(m?.cnt) || -1) ? r : m, null);
      renderTiles(rows, total, maxRow);
      chartTitle.textContent = `누적 발생건수 추이 — ${gran === 'day' ? '일별' : gran === 'month' ? '월별' : '연도별'}`;
      drawChart(rows);
    } catch (e) {
      console.warn('대시보드 로드 실패', e);
      svg.innerHTML = ''; tilesEl.innerHTML = '';
      emptyEl.style.display = ''; emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  window._dashLoad();
};
