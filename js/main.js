/* ── 탭 전환 ── */
function showTab(id, el) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-' + id).classList.add('active');
  el.classList.add('active');
}

/* ── 활성 문서 탭 표시/숨김 ── */
const ALL_DOC_TYPES = [
  { id: 'cp',    label: '관리계획서' },
  { id: 'ws',    label: '작업표준서' },
  { id: 'daily', label: '설비일상점검표' },
  { id: 'imf',   label: '초중종물' },
  { id: 'ms',    label: '마스터샘플' }
];
function applyEnabledDocs(docs) {
  const enabled = docs || ALL_DOC_TYPES.map(d => d.id);
  ALL_DOC_TYPES.forEach(({ id }) => {
    const nav  = document.querySelector(`.nav-item[data-tab="${id}"]`);
    const pane = document.getElementById('pane-' + id);
    const on   = enabled.includes(id);
    if (nav)  nav.style.display  = on ? '' : 'none';
    if (pane) pane.style.display = on ? '' : 'none';
  });
  // 현재 활성 탭이 비활성화됐으면 첫 번째 활성 탭으로 이동
  const active = document.querySelector('.pane.active');
  if (active) {
    const aid = active.id.replace('pane-', '');
    if (!enabled.includes(aid)) {
      const first = enabled[0];
      if (first) {
        const nav = document.querySelector(`.nav-item[data-tab="${first}"]`);
        if (nav) showTab(first, nav);
      }
    }
  }
}

/* ── 차종 변경 → 전체 탭 재로드 ── */
function onCarChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  window.currentCar   = opt.text;
  window.currentCarId = opt.value;
  localStorage.setItem('ait_cur_car', window.currentCar);
  // 활성 문서 탭 적용
  const cars = loadCars();
  const car  = cars.find(c => String(c.id) === String(opt.value));
  applyEnabledDocs(car?.enabled_docs);
  if (car) _syncCarMetaToLocal(car);
  // 모든 탭 캐시 초기화
  Object.keys(loaded).forEach(id => {
    loaded[id] = false;
    document.getElementById('pane-' + id).innerHTML = '';
  });
  // 현재 활성 탭만 즉시 재로드
  const activePaneEl = document.querySelector('.pane.active');
  if (activePaneEl) {
    const id = activePaneEl.id.replace('pane-', '');
    loadTab(id);
  }
}

/* ── 탭별 편집 모드 ── */
const snapshots = {};
window._markPaneDirty = function(pane){ snapshots[pane] = null; };

function _syncSidebarReset() {
  const anyEdit = document.querySelector('.pane.edit-mode');
  const wrap = document.getElementById('sidebar-reset-btn');
  if (wrap) wrap.style.display = anyEdit ? 'block' : 'none';
}

function toggleTabEditMode(pane, btn) {
  const paneEl = document.getElementById('pane-' + pane);
  if (paneEl.classList.contains('edit-mode')) {
    // 나가기 클릭
    const save = confirm('데이터를 저장하겠습니까?\n\n[확인] 예 — 저장\n[취소] 아니오 — 저장하지 않고 나가기');
    if (save) {
      saveDocument(pane); // saveDocument가 편집 모드 종료까지 처리
    } else {
      // 탭 재로드로 편집 전 상태로 복원
      paneEl.classList.remove('edit-mode');
      _syncSidebarReset();
      if (typeof loaded !== 'undefined') loaded[pane] = false;
      paneEl.innerHTML = '';
      if (typeof loadTab === 'function') loadTab(pane);
    }
  } else {
    const pw = prompt('편집 모드 비밀번호를 입력하세요');
    if (pw === null) return;
    if (pw !== 'ait1234') { alert('비밀번호가 올바르지 않습니다.'); return; }
    snapshots[pane] = snapshotPane(pane); // 변경 감지용 스냅샷
    paneEl.classList.add('edit-mode');
    _syncSidebarReset();
    btn.textContent = '🚪 나가기';
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    if (pane === 'cp') setCpEditable(paneEl, true);
    if (pane === 'ws') setWsEditable(paneEl, true);
    if (pane === 'daily' && typeof window.dailySetEditable === 'function') window.dailySetEditable(true);
    if (pane === 'imf' && typeof window.imfSetEditable === 'function') window.imfSetEditable(true);
    if (pane === 'ms' && typeof window.msSetEditable === 'function') window.msSetEditable(true);
  }
}

/* ── 탭별 월 상태 ── */
const tabMonths = {};
function getTabMonth(pane) {
  if (!tabMonths[pane]) { const _n = new Date(); tabMonths[pane] = { year: _n.getFullYear(), month: _n.getMonth() + 1 }; }
  return tabMonths[pane];
}
function prevMonth(pane) {
  const s = getTabMonth(pane);
  s.month--;
  if (s.month < 1) { s.month = 12; s.year--; }
  updateMonthLabel(pane);
}
function nextMonth(pane) {
  const s = getTabMonth(pane);
  s.month++;
  if (s.month > 12) { s.month = 1; s.year++; }
  updateMonthLabel(pane);
}
function updateMonthLabel(pane) {
  const s = getTabMonth(pane);
  const el = document.getElementById(pane + '-month-label');
  if (el) el.textContent = `${s.year}년 ${s.month}월`;
}

/* ── 개정관리 ── */
function getCurrentCar() {
  return window.currentCar || localStorage.getItem('ait_cur_car') || 'GN7 FL OHCL';
}

function getRevData(carName) {
  const all = JSON.parse(localStorage.getItem('ait_revisions') || '{}');
  if (!all[carName]) {
    all[carName] = { rev: 0, history: [] };
    localStorage.setItem('ait_revisions', JSON.stringify(all));
  }
  return all[carName];
}

function saveRevData(carName, data) {
  const all = JSON.parse(localStorage.getItem('ait_revisions') || '{}');
  all[carName] = data;
  localStorage.setItem('ait_revisions', JSON.stringify(all));
}

/* ── 초중종물·마스터샘플 독립 개정 ── */
const _STANDALONE_PANES = ['imf', 'ms'];
function getRevDataFor(pane, carName) {
  if (!_STANDALONE_PANES.includes(pane)) return getRevData(carName);
  const key = `ait_${pane}_revisions`;
  const all = JSON.parse(localStorage.getItem(key) || '{}');
  if (!all[carName]) {
    all[carName] = { rev: 0, history: [] };
    localStorage.setItem(key, JSON.stringify(all));
  }
  return all[carName];
}
function saveRevDataFor(pane, carName, data) {
  if (!_STANDALONE_PANES.includes(pane)) { saveRevData(carName, data); return; }
  const key = `ait_${pane}_revisions`;
  const all = JSON.parse(localStorage.getItem(key) || '{}');
  all[carName] = data;
  localStorage.setItem(key, JSON.stringify(all));
}

function updateRevDisplay(pane) {
  const carName = getCurrentCar();
  const rd = _STANDALONE_PANES.includes(pane) ? getRevDataFor(pane, carName) : getRevData(carName);
  const badge = document.getElementById(pane + '-rev-badge');
  const dateEl = document.getElementById(pane + '-rev-date');
  if (badge) badge.textContent = `Rev. ${rd.rev}`;
  if (dateEl) dateEl.textContent = `개정일: ${rd.history[0]?.date || '-'}`;
}

function updateAllRevDisplays() {
  ['cp','ws','daily','imf','ms'].forEach(updateRevDisplay);
}

let _revModalPane = null;

function openRevModal(pane) {
  _revModalPane = pane || null;
  const carName = getCurrentCar();

  function _renderRevModal() {
    const rd = (pane && _STANDALONE_PANES.includes(pane)) ? getRevDataFor(pane, carName) : getRevData(carName);
    const label = pane === 'imf' ? '초중종물' : pane === 'ms' ? '마스터샘플' : '';
    document.getElementById('rev-modal-car').textContent = carName + (label ? ` — ${label}` : '');
    const tbody = document.getElementById('rev-modal-tbody');
    tbody.innerHTML = rd.history.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:20px">개정 이력이 없습니다</td></tr>`
      : rd.history.map((h, i) => `
      <tr>
        <td class="td-center"><span class="rev-num">Rev.${h.rev}</span></td>
        <td class="td-center">${h.date}</td>
        <td class="td-center">${h.user || '—'}</td>
        <td>${h.desc}</td>
        <td style="color:var(--text2);font-size:11px">${h.docs}</td>
        <td class="td-center"><button onclick="deleteRevEntry(${i})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px" title="이력 삭제">🗑</button></td>
      </tr>
    `).join('');
    document.getElementById('rev-modal').classList.add('open');
  }

  // DB에서 이력 로드 → localStorage 동기화 후 렌더링
  if (!AIT_API.MOCK && window.currentCarId) {
    AIT_API.getRevisions(window.currentCarId, pane).then(rows => {
      if (rows && rows.length) {
        const rd = { rev: 0, history: [] };
        rows.forEach(r => {
          const rev = parseInt(r.rev) || 0;
          if (rev > rd.rev) rd.rev = rev;
          rd.history.push({ rev, date: r.rev_date || '', user: r.author || '', desc: r.note || '', docs: pane });
        });
        rd.history.sort((a, b) => b.rev - a.rev);
        saveRevDataFor(pane, carName, rd);
        updateAllRevDisplays();
      }
      _renderRevModal();
    }).catch(() => _renderRevModal());
  } else {
    _renderRevModal();
  }
}

function deleteRevEntry(idx) {
  const pw = prompt('비밀번호를 입력하세요');
  if (pw !== 'ait1234') { alert('비밀번호가 올바르지 않습니다.'); return; }
  if (!confirm('이 개정 이력을 삭제하시겠습니까?')) return;
  const carName = getCurrentCar();
  const pane = _revModalPane;
  const isStandalone = pane && _STANDALONE_PANES.includes(pane);
  const rd = isStandalone ? getRevDataFor(pane, carName) : getRevData(carName);
  rd.history.splice(idx, 1);
  rd.rev = rd.history.length > 0 ? Math.max(...rd.history.map(h => h.rev)) : 0;
  if (isStandalone) saveRevDataFor(pane, carName, rd);
  else saveRevData(carName, rd);
  updateAllRevDisplays();
  openRevModal(pane);
}

function closeRevModal() {
  document.getElementById('rev-modal').classList.remove('open');
}

/* ── 저장 + 개정 처리 ── */
function snapshotPane(pane) {
  const paneEl = document.getElementById('pane-' + pane);
  if (!paneEl) return '';
  if (pane === 'ws') {
    const parts = [];
    paneEl.querySelectorAll('[id^="ws-step-list-"]').forEach(r => parts.push(r.innerHTML));
    const mgmt = paneEl.querySelector('#ws-mgmt-tbody');
    if (mgmt) parts.push(mgmt.innerHTML);
    return parts.join('§');
  }
  const tbl = paneEl.querySelector('table');
  const src = tbl || paneEl;
  return src.textContent.replace(/\s+/g, ' ').trim();
}

function saveDocument(pane) {
  try {
    const carName = getCurrentCar();
    const current = snapshotPane(pane);
    const prev = snapshots[pane] ?? null;

    const paneLabels = { cp:'CP', ws:'작업표준서', daily:'설비일상점검표', imf:'초중종물', ms:'마스터샘플' };
    let doRevise = confirm(`개정하시겠습니까?\n\n[확인] 예 — 개정번호 자동 부여\n[취소] 아니오 — 저장만 (개정번호 유지)`);

    if (doRevise) {
      const rd = getRevDataFor(pane, carName);
      const newRev = rd.rev + 1;
      const desc = prompt(`개정 내용을 입력하세요\nRev.${rd.rev} → Rev.${newRev}`);
      if (desc === null) {
        doRevise = false; // 설명 입력 취소 → 개정 없이 저장만 진행
      } else {
        const today = new Date();
        const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
        rd.rev = newRev;
        rd.history.unshift({ rev: newRev, date: dateStr, user: '', desc: desc || '내용 변경', docs: paneLabels[pane] || pane });
        saveRevDataFor(pane, carName, rd);
        updateAllRevDisplays();
        if (!AIT_API.MOCK && window.currentCarId) {
          AIT_API.addRevision(window.currentCarId, pane, {
            rev_date: dateStr, note: desc || '내용 변경', author: ''
          }).catch(e => console.warn('개정이력 DB 저장 실패', e));
        }
        alert(`✅ Rev.${newRev} 개정 완료\n개정일: ${dateStr}`);
      }
    }

    snapshots[pane] = current;

    // 차종별 콘텐츠 localStorage 저장
    _saveCarContent(pane, carName);

    // DB 저장 (MOCK=false 일 때)
    if (!AIT_API.MOCK) {
      if (pane === 'cp') {
        const paneEl = document.getElementById('pane-cp');
        _saveCpToDb(carName, paneEl)
          .then(msg => {
            console.log('CP DB 저장:', msg);
            // CP 변경 → 작표·설비일상 탭 즉시 갱신 (관리기준 반영)
            loadCarContent('daily');
            loadCarContent('ws');
            // CP 변경 → 이번 달부터의 설비일상 실적만 초기화 (과거 기록 보존, 이미지 제외)
            if (window.currentCarId) {
              const now = new Date();
              const fromDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
              AIT_API.resetDailyOnCpChange(window.currentCarId, fromDate)
                .then(() => console.log('설비일상 실적 초기화 완료 (from', fromDate, ')'))
                .catch(e => console.warn('설비일상 초기화 실패 (n8n 미설정?):', e));
            }
          })
          .catch(e => alert('⚠ CP DB 저장 실패: ' + e.message));
      }
      if (pane === 'daily') {
        // localStorage 저장은 _saveCarContent에서 처리됨
        const dailyList = typeof window._dailyGetEquip === 'function' ? window._dailyGetEquip() : null;
        if (dailyList && dailyList.length && window.currentCarId) {
          AIT_API.syncDailyEquip(window.currentCarId, dailyList)
            .then(() => console.log('설비일상 DB 저장 완료'))
            .catch(e => alert('⚠ 설비일상 DB 저장 실패: ' + e.message));
        }
      }
      if (pane === 'ms' && typeof window._msSyncToDb === 'function' && window.currentCarId) {
        window._msSyncToDb()
          .then(() => console.log('마스터샘플 DB 저장 완료'))
          .catch(e => alert('⚠ 마스터샘플 DB 저장 실패: ' + e.message));
      }
    }
  } catch(e) {
    console.error('saveDocument 저장 중 오류:', e);
  } finally {
    // 편집 모드 자동 종료 — 저장 성공/실패 무관하게 항상 실행
    const paneEl = document.getElementById('pane-' + pane);
    if (paneEl) {
      paneEl.classList.remove('edit-mode');
      _syncSidebarReset();
      const editBtn = paneEl.querySelector('[id$="-edit-btn"]') || document.getElementById(pane + '-edit-btn');
      if (editBtn) {
        editBtn.textContent = '✏ 편집 모드';
        editBtn.classList.remove('btn-primary');
        editBtn.classList.add('btn-ghost');
      }
      if (pane === 'cp') setCpEditable(paneEl, false);
      if (pane === 'ws') setWsEditable(paneEl, false);
      if (pane === 'daily' && typeof window.dailySetEditable === 'function') window.dailySetEditable(false);
      if (pane === 'imf' && typeof window.imfSetEditable === 'function') window.imfSetEditable(false);
      if (pane === 'ms' && typeof window.msSetEditable === 'function') window.msSetEditable(false);
    }
  }
}


/* n개씩 순차 배치 실행 — n8n 동시 요청 과부하 방지 */
async function _batchRun(tasks, size = 3) {
  for (let i = 0; i < tasks.length; i += size)
    await Promise.all(tasks.slice(i, i + size).map(fn => fn()));
}

/* ── CP DB CRUD 저장 ── */
/* ── 라이트박스 ── */
function openPhoto(el) {
  const box = document.getElementById('lightbox-box');
  const cap = document.getElementById('lightbox-caption');
  box.innerHTML = '';
  const clone = el.cloneNode(true);
  clone.style.cssText = 'width:100%;height:100%;border-radius:0;cursor:default;font-size:18px;gap:10px';
  box.appendChild(clone);
  const thumb = el.closest('.ws-photo-thumb');
  cap.textContent = thumb ? (thumb.querySelector('.ws-photo-caption')?.textContent || '') : '';
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox();
    closeRevModal();
    closeCarModal();
    closeCftModal();
    closePartModal();
  }
});

/* ── 결과 셀 (달력 구형) ── */
function cycleResult(input) {
  const cycle = ['', '○', '✕', 'N'];
  const td = input.closest('td');
  const cur = input.value;
  if (cycle.includes(cur)) {
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    input.value = next;
    td.classList.remove('r-ok', 'r-ng', 'r-n', 'r-num');
    if (next === '○') td.classList.add('r-ok');
    else if (next === '✕') td.classList.add('r-ng');
    else if (next === 'N') td.classList.add('r-n');
  }
}

/* ── 전체 데이터 초기화 ── */
function resetAllData() {
  if (!confirm('저장된 모든 데이터를 삭제하시겠습니까?\n(CP·작업표준서·설비일상·초중종·마스터샘플 전체)\n\n이 작업은 되돌릴 수 없습니다.')) return;
  const keys = Object.keys(localStorage).filter(k =>
    k.startsWith('ait_') || k.startsWith('daily_')
  );
  keys.forEach(k => localStorage.removeItem(k));
  alert(`✅ ${keys.length}개 항목 삭제 완료. 페이지를 새로고침합니다.`);
  location.reload();
}

/* ── 차종(라인) CRUD ── */
function loadCars() {
  return JSON.parse(localStorage.getItem('ait_cars') || 'null') || [{ id: 1, name: 'GN7 FL OHCL' }];
}
function saveCarsToStorage(cars) {
  localStorage.setItem('ait_cars', JSON.stringify(cars));
}
async function initCars() {
  // 구버전 IDB + 캐시 일회성 클린업
  try {
    indexedDB.deleteDatabase('ait_ws_db');
    ['ait_ws_step_def_'].forEach(prefix => {
      Object.keys(localStorage).filter(k => k.startsWith(prefix))
        .forEach(k => localStorage.removeItem(k));
    });
  } catch(e) {}

  let cars;
  try {
    cars = await AIT_API.getCars();
    cars.forEach(c => {
      if (typeof c.enabled_docs === 'string') {
        try { c.enabled_docs = JSON.parse(c.enabled_docs); } catch { c.enabled_docs = null; }
      }
      // DB가 null이면 별도 localStorage 키를 fallback으로 사용
      if (!c.enabled_docs) {
        const override = localStorage.getItem(`ait_enabled_docs_${c.id}`);
        if (override) {
          try { c.enabled_docs = JSON.parse(override); } catch {}
        }
      }
    });
    saveCarsToStorage(cars);
  } catch(e) {
    console.error('차종 로드 실패', e);
    cars = loadCars();
  }
  renderCarSelect(cars);
  window.currentCar = localStorage.getItem('ait_cur_car') || cars[0]?.name || 'GN7 FL OHCL';
  const cur = cars.find(c => c.name === window.currentCar) || cars[0];
  if (cur) {
    window.currentCarId = cur.id;
    applyEnabledDocs(cur.enabled_docs);
    // DB 메타를 window 캐시 + localStorage에 동기화
    _syncCarMetaToLocal(cur);
    // daily 탭이 이미 로드됐지만 currentCarId 미설정으로 데이터 없으면 재로드
    if (typeof loaded !== 'undefined' && loaded['daily'] &&
        typeof window._dailyGetEquip === 'function' && window._dailyGetEquip().length === 0) {
      if (typeof loadCarContent === 'function') loadCarContent('daily');
    }
    // 개정이력 DB → localStorage 초기 동기화
    if (!AIT_API.MOCK && cur.id) {
      ['cp','ws','daily','imf','ms'].forEach(pane => {
        AIT_API.getRevisions(cur.id, pane).then(rows => {
          if (!rows || !rows.length) return;
          const rd = { rev: 0, history: [] };
          rows.forEach(r => {
            const rev = parseInt(r.rev) || 0;
            if (rev > rd.rev) rd.rev = rev;
            rd.history.push({ rev, date: r.rev_date || '', user: r.author || '', desc: r.note || '', docs: pane });
          });
          rd.history.sort((a, b) => b.rev - a.rev);
          saveRevDataFor(pane, window.currentCar, rd);
        }).catch(() => {});
      });
    }
  }
}

function renderCarSelect(cars) {
  const sel = document.getElementById('car-sel');
  if (!sel) return;
  const cur = window.currentCar || localStorage.getItem('ait_cur_car') || cars[0]?.name || '';
  sel.innerHTML = cars.map(c =>
    `<option value="${c.id}" ${c.name === cur ? 'selected' : ''}>${c.name}</option>`
  ).join('');
}
function openCarModal() {
  const pw = prompt('관리자 비밀번호를 입력하세요');
  if (pw === null) return;
  if (pw !== 'ait1234') { alert('비밀번호가 올바르지 않습니다.'); return; }
  renderCarListInModal();
  document.getElementById('car-modal').classList.add('open');
}
function closeCarModal() {
  document.getElementById('car-modal').classList.remove('open');
  document.getElementById('car-add-input').value = '';
}
function renderCarListInModal() {
  const cars = loadCars();
  const list = document.getElementById('car-list');
  list.innerHTML = cars.map(c => {
    const enabled = c.enabled_docs || ALL_DOC_TYPES.map(d => d.id);
    const checks = ALL_DOC_TYPES.map(d =>
      `<label style="display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" data-doc="${d.id}" ${enabled.includes(d.id)?'checked':''} onchange="updateCarDocs(${c.id})"> ${d.label}
      </label>`
    ).join('');
    return `
    <div class="car-item" data-id="${c.id}" style="flex-direction:column;align-items:flex-start;gap:4px">
      <div style="display:flex;align-items:center;gap:6px;width:100%">
        <div class="car-item-name" style="flex:1">
          <span class="car-name-text">${c.name}</span>
          <input class="car-name-input" style="display:none" value="${c.name}">
        </div>
        <button class="btn btn-ghost btn-sm car-edit-btn" onclick="startEditCar(${c.id})">✏</button>
        <button class="btn btn-ghost btn-sm car-save-btn" style="display:none;color:var(--green)" onclick="confirmEditCar(${c.id})">저장</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteCar(${c.id})">🗑</button>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;padding:2px 0 4px 2px">${checks}</div>
    </div>`;
  }).join('');
}
async function updateCarDocs(id) {
  const item = document.querySelector(`.car-item[data-id="${id}"]`);
  const enabled = Array.from(item.querySelectorAll('[data-doc]')).filter(c => c.checked).map(c => c.dataset.doc);
  const cars = loadCars();
  const car  = cars.find(c => c.id === id);
  if (!car) return;
  car.enabled_docs = enabled;
  saveCarsToStorage(cars);
  // 별도 키에 저장 → initCars DB 덮어쓰기 때도 유지
  localStorage.setItem(`ait_enabled_docs_${id}`, JSON.stringify(enabled));
  if (car.name === window.currentCar) applyEnabledDocs(enabled);
  try {
    await AIT_API.updateCar(id, { enabled_docs: JSON.stringify(enabled) });
  } catch(e) {
    console.warn('문서 설정 DB 저장 실패:', e);
    window.showToast && window.showToast('문서 설정 저장 실패 — 새로고침해도 유지됩니다', 'error');
  }
}
function startEditCar(id) {
  const item = document.querySelector(`.car-item[data-id="${id}"]`);
  item.querySelector('.car-name-text').style.display = 'none';
  item.querySelector('.car-name-input').style.display = 'block';
  item.querySelector('.car-edit-btn').style.display = 'none';
  item.querySelector('.car-save-btn').style.display = 'inline-flex';
  item.querySelector('.car-name-input').focus();
}
async function confirmEditCar(id) {
  const item = document.querySelector(`.car-item[data-id="${id}"]`);
  const newName = item.querySelector('.car-name-input').value.trim();
  if (!newName) return;
  const cars = loadCars();
  const car = cars.find(c => c.id === id);
  if (car) car.name = newName;
  saveCarsToStorage(cars);
  await AIT_API.updateCar(id, { name: newName });
  renderCarSelect(cars);
  renderCarListInModal();
}
async function deleteCar(id) {
  const cars = loadCars();
  if (cars.length <= 1) { alert('최소 1개의 아이템이 필요합니다.'); return; }
  if (!confirm('이 아이템을 삭제하시겠습니까?')) return;
  if (!AIT_API.MOCK) {
    try { await AIT_API.updateCar(id, { is_active: 0 }); } catch(e) { console.warn('차종 삭제 DB 실패', e); }
  }
  const updated = cars.filter(c => c.id !== id);
  saveCarsToStorage(updated);
  renderCarSelect(updated);
  renderCarListInModal();
}
async function addCar() {
  const input = document.getElementById('car-add-input');
  const name = input.value.trim();
  if (!name) return;
  if (AIT_API.MOCK) {
    const cars = loadCars();
    const newId = Math.max(0, ...cars.map(c => c.id)) + 1;
    cars.push({ id: newId, name, enabled_docs: ALL_DOC_TYPES.map(d => d.id) });
    saveCarsToStorage(cars);
    renderCarSelect(cars);
    renderCarListInModal();
  } else {
    try {
      await AIT_API.createCar({ name, enabled_docs: JSON.stringify(ALL_DOC_TYPES.map(d => d.id)) });
      await initCars();
      renderCarListInModal();
    } catch(e) {
      alert('차종 추가 실패: ' + (e.message || e));
    }
  }
  input.value = '';
}

/* ── 차종별 콘텐츠 저장 ── */
function _wsExtractSteps(paneEl) {
  const steps = [];
  paneEl.querySelectorAll('[id^="ws-step-list-"]').forEach(list => {
    const procNum = parseInt(list.id.replace('ws-step-list-', '')) || 0;
    list.querySelectorAll('.ws-step-item').forEach((item, idx) => {
      const vid = item.querySelector('.ws-photo-inner video[src]');
      const img = item.querySelector('.ws-photo-inner img[src]');
      const mediaEl = vid || img;
      const mediaSrc = mediaEl?.src || '';
      steps.push({
        procNum, stepNum: idx + 1,
        stepName: item.querySelector('.ws-step-name')?.textContent.trim() || item.querySelector('.ws-step-name-input')?.value.trim() || '',
        specHtml: item.querySelector('.ws-step-spec')?.innerHTML || '',
        mediaUrl: (mediaSrc && !mediaSrc.startsWith('data:')) ? mediaSrc : '',
        mediaType: vid ? 'video' : 'image',
        mediaFileId: mediaEl?.dataset?.fileId || ''
      });
    });
  });
  return steps;
}
function _toDirectDriveUrl(url) {
  if (!url) return url;
  // 구 프록시 URL → CDN URL 변환
  const m = url.match(/[?&]fileId=([^&]+)/);
  if (m) return `https://lh3.googleusercontent.com/d/${m[1]}`;
  return url;
}
function _renderWsMgmtFromItems(items, paneEl, car) {
  const tb = paneEl.querySelector('#ws-mgmt-tbody');
  if (!tb || !items || !items.length) return;
  const seenProc = {};
  const delBtn = `<td class="edit-only" style="padding:2px;text-align:center"><button onclick="this.closest('tr').remove()" style="width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="삭제">✕</button></td>`;
  tb.innerHTML = items.map(r => {
    const proc = r.proc_no || '';
    if (!seenProc[proc]) seenProc[proc] = 0;
    seenProc[proc]++;
    const isDaily = (r.plan_type || '').includes('설비일상');
    const catColor = (r.category || '').includes('제품') ? '#1d4ed8' : '#15803d';
    return `<tr data-proc="${proc}" data-plan="${r.plan_type||''}"${isDaily ? ' class="daily-row"' : ''}>
      <td contenteditable="false" style="font-family:monospace;font-weight:700">${seenProc[proc]}</td>
      <td contenteditable="false" style="color:${catColor};font-weight:600;font-size:11px">${r.category||''}</td>
      <td contenteditable="false">${r.item_name||''}</td>
      <td contenteditable="false">${r.standard||''}</td>
      <td contenteditable="false">${r.method||''}</td>
      <td contenteditable="false">${r.cycle||''}</td>
      <td contenteditable="false">${r.action_plan||''}</td>
      <td contenteditable="false"${isDaily ? ' class="daily-badge"' : ''}>${r.note||''}</td>
      ${delBtn}</tr>`;
  }).join('');
  refreshMgmtRowColors(paneEl);
  // localStorage mgmt도 갱신
  try {
    const wsRaw = localStorage.getItem(`ait_ws_content_${car}`);
    if (wsRaw) { const d = JSON.parse(wsRaw); d.mgmt = tb.innerHTML; localStorage.setItem(`ait_ws_content_${car}`, JSON.stringify(d)); }
  } catch(e) {}
}

function _wsRenderStepsFromDb(rows, paneEl, car) {
  const byProc = {};
  rows.forEach(r => { const p = parseInt(r.proc_num)||0; (byProc[p]||(byProc[p]=[])).push(r); });
  const procs = Object.keys(byProc).map(Number).filter(Boolean).sort((a,b)=>a-b);
  if (!procs.length) return false;
  buildWsProcs(procs, paneEl);
  const delBtn = `<button class="edit-only" onclick="wsRemovePhoto(this)" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;line-height:1">✕</button>`;
  procs.forEach(proc => {
    const list = paneEl.querySelector(`#ws-step-list-${proc}`);
    if (!list) return;
    byProc[proc].sort((a,b)=>a.step_num-b.step_num).forEach((row, idx) => {
      const item = document.createElement('div');
      item.className = 'ws-step-item';
      let mediaHtml = typeof _wsMediaLabel === 'function' ? _wsMediaLabel() : '';
      if (row.media_url) {
        const fid = row.media_file_id || '';
        const mUrl = _toDirectDriveUrl(row.media_url);
        mediaHtml = (row.media_type === 'video')
          ? `<video src="${mUrl}" data-file-id="${fid}" controls style="width:100%;display:block;border-radius:4px;max-height:400px"></video>${delBtn}`
          : `<img src="${mUrl}" data-file-id="${fid}" style="width:100%;height:auto;display:block;border-radius:4px" onclick="openPhoto(this)">${delBtn}`;
      }
      const safeName = (row.step_name||'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      item.innerHTML = `
        <div class="ws-step-th">
          <span class="ws-step-num-badge">STEP ${idx+1}</span>
          <span class="ws-step-name" contenteditable="false">${row.step_name||''}</span>
          <input class="ws-step-name-input edit-only" type="text" placeholder="작업명 입력" value="${safeName}"
            style="background:rgba(255,255,255,.12);border:1px dashed rgba(255,255,255,.4);border-radius:4px;color:#fff;padding:3px 10px;font-size:13px;font-weight:600;min-width:180px;outline:none;font-family:inherit;flex:1"
            oninput="window._wsNameInput&&window._wsNameInput(this)">
          <button class="edit-only" onclick="wsDelStep(this)"
            style="margin-left:auto;width:24px;height:24px;border:none;background:rgba(255,255,255,.2);color:#fff;border-radius:4px;cursor:pointer;font-size:13px;flex-shrink:0;line-height:1">✕</button>
        </div>
        <div class="ws-step-body">
          <div class="ws-photo-cell">
            <div class="ws-photo-inner" ${row.media_url ? 'style="position:relative"' : ''}>${mediaHtml}</div>
          </div>
          <div class="ws-spec-cell">
            <div class="ws-step-spec" contenteditable="false">${row.spec_html||''}</div>
          </div>
        </div>`;
      list.appendChild(item);
    });
  });
  const raw = localStorage.getItem(`ait_ws_content_${car}`);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      const safety = paneEl.querySelector('#ws-safety');
      if (safety && d.safety !== undefined) safety.innerHTML = d.safety;
      // 관리항목(mgmt)은 아래 DB 우선 로드로 처리 (localStorage 우선 제거)
      // DB에 media_url 없는 step → localStorage 이미지로 보완
      Object.entries(d.steps || {}).forEach(([proc, stepData]) => {
        if (!stepData?.list) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = stepData.list;
        tmp.querySelectorAll('.ws-step-item').forEach((idbItem, i) => {
          const dbItems = paneEl.querySelectorAll(`#ws-step-list-${proc} .ws-step-item`);
          const dbItem = dbItems[i];
          if (!dbItem) return;
          const inner = dbItem.querySelector('.ws-photo-inner');
          if (!inner || inner.querySelector('img[src], video[src]')) return; // DB에 이미 이미지 있음
          const idbInner = idbItem.querySelector('.ws-photo-inner');
          if (!idbInner?.querySelector('img[src], video[src]')) return;
          inner.innerHTML = idbInner.innerHTML;
          inner.style.position = 'relative';
          // data-file-id 있는 base64 → CDN URL 변환
          inner.querySelectorAll('img[data-file-id], video[data-file-id]').forEach(el => {
            if (el.src?.startsWith('data:') && el.dataset.fileId)
              el.src = AIT_API.driveUrl(el.dataset.fileId);
          });
        });
      });
      setTimeout(() => {
        if (typeof _wsRenderThumb === 'function') _wsRenderThumb();
        if (typeof _wsShowStep === 'function') _wsShowStep(typeof _wsIdx !== 'undefined' ? _wsIdx : 0);
      }, 50);
    } catch(e) {}
  }
  const cpMeta = _cpMetaGet(car);
  const wsPn = paneEl.querySelector('#ws-pn'); const wsPnm = paneEl.querySelector('#ws-pname');
  if (wsPn)  wsPn.textContent  = cpMeta.partno   || '';
  if (wsPnm) wsPnm.textContent = cpMeta.partname || '';
  setWsEditable(paneEl, false);
  refreshMgmtRowColors(paneEl);
  if (procs.length && typeof showProcess === 'function') {
    showProcess(procs[0], paneEl.querySelector('#ws-proc-nav .proc-btn.active'));
  }
  setTimeout(() => {
    if (typeof _wsRenderThumb === 'function') _wsRenderThumb();
    if (typeof _wsShowStep === 'function') _wsShowStep(typeof _wsIdx !== 'undefined' ? _wsIdx : 0);
  }, 50);
  // 관리항목은 loadCarContent('ws')에서 _buildWsMgmtFromCpRows로 직접 렌더 (단일 진실 소스: CP DB)
  return true;
}

function _saveCarContent(pane, car) {
  const paneEl = document.getElementById('pane-' + pane);
  if (!paneEl) return;
  if (pane === 'cp') {
    // 메타바 저장
    const stageMassEl = paneEl.querySelector('#cp-stage-mass');
    const metaPartno  = paneEl.querySelector('#cp-meta-partno');
    const metaPartname= paneEl.querySelector('#cp-meta-partname');
    const metaLinename= paneEl.querySelector('#cp-meta-linename');
    const cpMeta = {
      stage:    stageMassEl?.checked ? '양산' : '시작',
      partno:   metaPartno?.textContent.trim()   || '',
      partname: metaPartname?.textContent.trim() || '',
      linename: metaLinename?.textContent.trim() || ''
    };
    _cpMetaSet(car, cpMeta);
    if (!AIT_API.MOCK && window.currentCarId) {
      AIT_API.updateCar(window.currentCarId, cpMeta)
        .then(() => _updateCarCache(window.currentCarId, cpMeta))
        .catch(e => console.warn('CP 메타 DB 저장 실패', e));
    }
  } else if (pane === 'ws') {
    const data = { steps: {}, mgmt: '', procs: [] };
    const safety = paneEl.querySelector('#ws-safety');
    if (safety) data.safety = safety.innerHTML;
    const tb = paneEl.querySelector('#ws-mgmt-tbody');
    if (tb) {
      const _clone = tb.cloneNode(true);
      _clone.querySelectorAll('td:not(.edit-only)').forEach(td => {
        td.contentEditable = 'false';
        td.style.background = '';
        td.style.cursor = '';
      });
      data.mgmt = _clone.innerHTML;
    }
    paneEl.querySelectorAll('[id^="ws-step-list-"]').forEach(list => {
      const proc = list.id.replace('ws-step-list-', '');
      const clone = list.cloneNode(true);
      // fileId 있는 base64만 Drive URL로 교체, 나머지 base64는 IDB용으로 유지
      clone.querySelectorAll('img[data-file-id], video[data-file-id]').forEach(el => {
        if (el.src && el.src.startsWith('data:') && el.dataset.fileId) {
          el.src = AIT_API.driveUrl(el.dataset.fileId);
        }
      });
      data.steps[proc] = { list: clone.innerHTML };
    });
    data.procs = [...paneEl.querySelectorAll('[id^="ws-step-list-"]')]
      .map(d => parseInt(d.id.replace('ws-step-list-', ''))).filter(Boolean).sort((a,b)=>a-b);
    if (!AIT_API.MOCK && window.currentCarId) {
      AIT_API.syncWsSteps(window.currentCarId, _wsExtractSteps(paneEl)).catch(e => console.warn('WS DB 동기화 실패', e));
    }
    // localStorage: base64 제거 후 저장 (5MB 한계 우회)
    try {
      const _tmp = document.createElement('div');
      const lsData = { safety: data.safety, mgmt: data.mgmt, procs: data.procs, steps: {} };
      Object.entries(data.steps).forEach(([proc, s]) => {
        _tmp.innerHTML = s.list || '';
        _tmp.querySelectorAll('img, video').forEach(el => {
          if (el.src && el.src.startsWith('data:')) { const w = el.closest('.ws-photo-inner'); if (w) w.innerHTML = ''; }
        });
        lsData.steps[proc] = { list: _tmp.innerHTML };
      });
      localStorage.setItem(`ait_ws_content_${car}`, JSON.stringify(lsData));
    } catch(e) {}
  }
  // imf/ms: 항목 정의는 AIT_API.saveImfMeta / saveMsMeta 로 관리, 일별 체크 결과는 개별 localStorage 키
  if (pane === 'daily') {
    // DOM에서 편집된 설비 정보를 DAILY_EQUIP 배열에 반영
    try {
      if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
    } catch(e) { console.warn('_dFlushInfo 오류 (무시됨):', e); }
    try {
      const dailyList = typeof window._dailyGetEquip === 'function' ? window._dailyGetEquip() : null;
      if (dailyList && dailyList.length) {
        localStorage.setItem(`ait_daily_equip_${car}`, JSON.stringify(dailyList));
      }
    } catch(e) { console.warn('daily localStorage 저장 오류 (무시됨):', e); }
  }
}

/* ── 관리항목 공정 행 배경색 갱신 ── */
function refreshMgmtRowColors(paneEl) {
  const el = paneEl || document.getElementById('pane-ws');
  if (!el) return;
  el.querySelectorAll('#ws-mgmt-tbody tr').forEach(tr => {
    const plan = (tr.dataset.plan || '').trim();
    const isDaily = plan.includes('설비일상');
    tr.classList.toggle('mgmt-proc-row', isDaily);
    tr.style.background = '';
    [...tr.cells].forEach(td => { td.style.background = ''; });
  });
}

/* ── 작업표준서 공정 동적 빌드 ── */
function buildWsProcs(procs, paneEl) {
  if (!procs || procs.length === 0) return;
  const nav  = paneEl.querySelector('#ws-proc-nav');
  const area = paneEl.querySelector('#ws-step-area');
  if (!nav || !area) return;

  nav.innerHTML = procs.map((p, i) =>
    `<button class="proc-btn${i === 0 ? ' active' : ''}" onclick="showProcess(${p},this)">공정 ${p}</button>`
  ).join('');

  area.innerHTML = procs.map((p, i) => `
    <div class="ws-step-list" id="ws-step-list-${p}"${i > 0 ? ' style="display:none"' : ''}></div>`
  ).join('') + `
    <div class="edit-only" style="margin:8px 0 12px;display:flex;gap:8px;align-items:center;padding:0 4px">
      <button class="btn btn-primary btn-sm" onclick="addStep()" style="font-size:13px;padding:7px 14px">＋ STEP 추가</button>
    </div>
    <div id="ws-empty-hint" style="text-align:center;padding:40px 20px;color:var(--text3);font-size:13px;background:#fff;border-top:1px solid #e5e7eb">
      작업 STEP이 없습니다.<br>편집 모드에서 <strong>＋ STEP 추가</strong>를 눌러 작성하세요.
    </div>`;

  // STEP 유무에 따라 빈 힌트 토글
  const obs = new MutationObserver(() => {
    const hasSteps = paneEl.querySelectorAll('.ws-step-item').length > 0;
    const hint = paneEl.querySelector('#ws-empty-hint');
    if (hint) hint.style.display = hasSteps ? 'none' : 'block';
  });
  paneEl.querySelectorAll('[id^="ws-step-list-"]').forEach(r => obs.observe(r, { childList: true }));

  // 첫 번째 공정 표시
  if (typeof showProcess === 'function') {
    showProcess(procs[0], nav.querySelector('.proc-btn.active'));
  }
}

/* ── 작업표준서 편집 모드 ── */
function setWsEditable(paneEl, on) {
  // STEP 이름: 편집모드 = input 노출 + span 숨김 / 읽기모드 = span 노출
  paneEl.querySelectorAll('.ws-step-name').forEach(el => {
    el.style.display = on ? 'none' : '';
  });
  if (on) {
    paneEl.querySelectorAll('.ws-step-name-input').forEach(inp => {
      inp.value = inp.closest('.ws-step-th')?.querySelector('.ws-step-name')?.textContent.trim() || '';
    });
  }
  // 헤더 바 STEP 이름 input/span 토글
  const currName  = paneEl.querySelector('#ws-curr-name');
  const currInput = paneEl.querySelector('#ws-curr-name-input');
  if (currName)  currName.style.display  = on ? 'none' : '';
  if (currInput) { currInput.style.display = on ? '' : 'none'; if (on) currInput.value = currName?.textContent.trim() || ''; }
  // STEP 주기
  paneEl.querySelectorAll('.ws-step-period').forEach(el => {
    el.contentEditable = on ? 'true' : 'false';
    el.style.outline = on ? '1px dashed rgba(255,255,255,.6)' : '';
    el.style.borderRadius = on ? '3px' : '';
  });
  // STEP 기준 텍스트
  paneEl.querySelectorAll('.ws-step-spec').forEach(el => {
    el.contentEditable = on ? 'true' : 'false';
    el.style.outline = on ? '1px dashed #c7d7ff' : '';
    el.style.borderRadius = on ? '3px' : '';
  });
  // 안전 주의사항
  const safetyEl = paneEl.querySelector('#ws-safety');
  if (safetyEl) {
    safetyEl.contentEditable = on ? 'true' : 'false';
    safetyEl.style.outline = on ? '1px dashed #fca5a5' : '';
    safetyEl.style.background = on ? '#fff1f1' : '#fff7f7';
    safetyEl.style.cursor = on ? 'text' : '';
  }
  // 관리항목 표 td
  paneEl.querySelectorAll('#ws-mgmt-tbody td:not(.edit-only)').forEach(td => {
    td.contentEditable = on ? 'true' : 'false';
    td.style.background = on ? '#edf3ff' : '';
    td.style.cursor = on ? 'text' : '';
  });
  // 편집 모드 진입 시 구분 셀 변경 감지
  const tbody = paneEl.querySelector('#ws-mgmt-tbody');
  if (tbody) {
    if (on) {
      tbody._gubnHandler = () => refreshMgmtRowColors(paneEl);
      tbody.addEventListener('input', tbody._gubnHandler);
    } else {
      if (tbody._gubnHandler) tbody.removeEventListener('input', tbody._gubnHandler);
      refreshMgmtRowColors(paneEl);
    }
  }
  if (typeof window._wsApplyEditMode === 'function') window._wsApplyEditMode(on);
}

/* ── CP 메타바 ── */
/* ── 차종별 콘텐츠 복원 (loadTab 후 호출) ── */
function loadCarContent(pane) {
  const car = getCurrentCar();
  const isBase = (car === 'GN7 FL OHCL');
  const paneEl = document.getElementById('pane-' + pane);
  if (!paneEl) return;

  if (pane === 'cp') {
    const tbody = paneEl.querySelector('#cp-tbody');
    if (!tbody) return;

    const _initCp = () => {
      initCpDocHeader(paneEl, car);
      initCpMeta(paneEl, car);
      initCpFlowDiagram(paneEl);
      initCpEventListeners();
      setCpEditable(paneEl, false);
      // 뷰 모드에서도 전체 행 표시 (기본 펼침)
      paneEl.querySelectorAll('.cp-group-hd').forEach(hd => hd.classList.add('cp-grp-open'));
      paneEl.querySelectorAll('.cp-child').forEach(tr => tr.classList.add('cp-open'));
    };

    if (!AIT_API.MOCK) {
      _buildCpHtmlFromDb(car).then(html => {
        if (html) { tbody.innerHTML = html; _initCp(); }
        else {
          tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:40px;color:#9ca3af;font-size:13px">
            이 아이템의 CP 데이터가 없습니다.<br>편집 모드에서 항목을 추가하세요.</td></tr>`;
          _initCp();
        }
      }).catch(e => {
        console.warn('CP 로드 실패:', e);
        tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:40px;color:#ef4444;font-size:13px">
          CP 데이터 로드 실패. 새로고침하세요.</td></tr>`;
      });
      return;
    }
    _initCp();

  } else if (pane === 'ws') {
    const _applyWsData = (rawJson) => {
      let data = null;
      if (rawJson) { try { data = JSON.parse(rawJson); } catch(e) { console.warn('WS 복원 실패', e); } }
      if (data) {
        const procs = data.procs
          || Object.keys(data.steps || {}).map(Number).filter(Boolean).sort((a,b)=>a-b);
        if (procs.length > 0) buildWsProcs(procs, paneEl);
        const safety = paneEl.querySelector('#ws-safety');
        if (safety && data.safety !== undefined) safety.innerHTML = data.safety;
        const tb = paneEl.querySelector('#ws-mgmt-tbody');
        if (tb && data.mgmt !== undefined) tb.innerHTML = data.mgmt;
        Object.entries(data.steps || {}).forEach(([proc, stepData]) => {
          const list = paneEl.querySelector(`#ws-step-list-${proc}`);
          if (list && typeof stepData === 'object' && stepData.list !== undefined) {
            list.innerHTML = stepData.list;
          }
        });
        // base64→Drive CDN URL 변환, 구 프록시 URL도 직접 CDN으로 교체
        if (typeof AIT_API !== 'undefined') {
          paneEl.querySelectorAll('img[data-file-id], video[data-file-id]').forEach(el => {
            if (el.src && el.src.startsWith('data:')) {
              el.src = AIT_API.driveUrl(el.dataset.fileId);
            } else if (el.src && typeof _toDirectDriveUrl === 'function') {
              el.src = _toDirectDriveUrl(el.src);
            }
          });
          // fileId 없어도 구 프록시 URL이면 변환
          paneEl.querySelectorAll('img, video').forEach(el => {
            if (el.src && el.src.includes('/photo-serve?')) {
              el.src = _toDirectDriveUrl(el.src);
            }
          });
        }
        const cpMeta = _cpMetaGet(car);
        const wsPn = paneEl.querySelector('#ws-pn'); const wsPnm = paneEl.querySelector('#ws-pname');
        if (wsPn)  wsPn.textContent  = cpMeta.partno   || '';
        if (wsPnm) wsPnm.textContent = cpMeta.partname || '';
        setWsEditable(paneEl, false);
        refreshMgmtRowColors(paneEl);
        if (procs.length > 0 && typeof showProcess === 'function') {
          const activeBtn = paneEl.querySelector('#ws-proc-nav .proc-btn.active');
          showProcess(procs[0], activeBtn);
        }
        // showProcess→_wsOnProcChange 체인 실패 대비 명시적 뷰 갱신
        setTimeout(() => {
          if (typeof _wsRenderThumb === 'function') _wsRenderThumb();
          if (typeof _wsShowStep === 'function') _wsShowStep(typeof _wsIdx !== 'undefined' ? _wsIdx : 0);
        }, 50);
      } else {
        const cpProcs = [...new Set(
          [...document.querySelectorAll('#cp-tbody tr.cp-child')]
            .map(tr => parseInt(tr.cells[0]?.textContent.trim()))
            .filter(Boolean)
        )].sort((a,b)=>a-b);
        const fallbackProcs = cpProcs.length > 0 ? cpProcs : [20,30,40,50,60];
        buildWsProcs(fallbackProcs, paneEl);
        if (!isBase) {
          const tb2 = paneEl.querySelector('#ws-mgmt-tbody');
          if (tb2) tb2.innerHTML = '';
        }
      }
    };
    // DB 우선 → localStorage 폴백 (관리항목은 항상 CP rows에서 직접 빌드)
    const _lsFallback = () => _applyWsData(localStorage.getItem(`ait_ws_content_${car}`));
    if (!AIT_API.MOCK && window.currentCarId) {
      // 작표: STEP은 ws_steps에서 로드, 관리항목은 CP rows에서 직접 빌드 (단일 진실 소스)
      Promise.all([
        AIT_API.getWsSteps(window.currentCarId).catch(() => []),
        AIT_API.getCpRows(window.currentCarId).catch(() => [])
      ]).then(([stepsRows, cpRows]) => {
        // 1. STEP: DB에서 로드, 없으면 localStorage 폴백 (공정 nav · step list 빌드)
        if (stepsRows && stepsRows.length) {
          _wsRenderStepsFromDb(stepsRows, paneEl, car);
        } else {
          _lsFallback();
        }
        // 2. 관리항목: CP rows에서 직접 빌드 (단일 진실 소스, STEP 렌더 후 mgmt-tbody 덮어씀)
        let cpProcs = [];
        if (cpRows && cpRows.length) {
          cpProcs = _buildWsMgmtFromCpRows(cpRows, paneEl);
        }
        // 3. STEP이 없어 공정 nav가 비어있으면 CP rows의 공정으로 빌드
        if (cpProcs.length && !paneEl.querySelector('#ws-proc-nav .proc-btn')) {
          buildWsProcs(cpProcs, paneEl);
        }
        refreshMgmtRowColors(paneEl);
      });
    } else {
      _lsFallback();
    }

  } else if (pane === 'imf') {
    if (typeof imfRenderAll === 'function') imfRenderAll();

  } else if (pane === 'ms') {
    if (typeof msRenderAll === 'function') msRenderAll();
  } else if (pane === 'daily') {
    // 설비일상: CP DB rows를 단일 진실 소스로 사용 (복사 없이 직접 렌더)
    if (!AIT_API.MOCK && window.currentCarId) {
      const linename = _cpMetaGet(car).linename || '';
      AIT_API.getCpRows(window.currentCarId).then(rows => {
        if (rows && rows.length) {
          const list = _buildDailyFromCpRows(rows, linename);
          if (list.length && typeof window._dInitEquip === 'function') window._dInitEquip(list);
          else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
        } else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
      }).catch(() => { if (typeof window._dFlushInfo === 'function') window._dFlushInfo(); });
    } else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
  }
}
