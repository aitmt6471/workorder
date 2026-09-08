/* ══════════════════════════════════════════════════════════════
   부적합품현황 탭 모듈
   tabs/defect.html 이 로드될 때 initDefectTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
window.initDefectTab = function initDefectTab() {
  const paneEl = document.getElementById('pane-defect');
  if (!paneEl) return;

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function resolveLine() {
    const car = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
    return (car && car.linename) || '';
  }
  function photoList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    const s = String(raw).trim();
    if (!s) return [];
    try { const j = JSON.parse(s); if (Array.isArray(j)) return j; } catch {}
    return s.split(',').map(u => u.trim()).filter(Boolean);
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  const dateInput = paneEl.querySelector('#defect-date');
  const lineBadge = paneEl.querySelector('#defect-line-badge');
  const tbody = paneEl.querySelector('#defect-tbody');
  const emptyEl = paneEl.querySelector('#defect-empty');
  const table = paneEl.querySelector('#defect-table');

  function render(rows) {
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
    if (!line) { render([]); emptyEl.textContent = '이 아이템에는 라인(linename)이 등록되어 있지 않습니다.'; return; }
    const date = dateInput.value || todayStr();
    try {
      const rows = await AIT_API.getDefectStatus(line, date);
      render(rows);
    } catch (e) {
      console.warn('부적합품현황 로드 실패', e);
      table.style.display = 'none';
      emptyEl.style.display = '';
      emptyEl.textContent = '데이터 로드 실패: ' + (e.message || String(e));
    }
  };

  if (!dateInput.value) dateInput.value = todayStr();
  window._defectLoad();
};
