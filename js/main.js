/* ── 역할 기반 접근 제어 ── */
const ROLE_PERMS = {
  admin:         ['cp','ws','daily','imf','ms','spec','insp','qpoint'],
  cp_editor:     ['cp','ws','daily','ms','insp'],
  qpoint_editor: ['qpoint'],
  viewer:        [],
  general:       []
};

function getMyRole() {
  try { return JSON.parse(localStorage.getItem('ait_user') || '{}').role || 'viewer'; }
  catch { return 'viewer'; }
}

function canEdit(pane) {
  return (ROLE_PERMS[getMyRole()] || []).includes(pane);
}

function applyRoleUI() {
  const role = getMyRole();
  const isAdmin = role === 'admin';

  // 아이템 관리 + 설정 버튼 (admin만)
  document.querySelectorAll('.sidebar-footer .sidebar-btn').forEach(btn => {
    const oc = btn.getAttribute('onclick') || '';
    if (oc.includes('openCarModal') || oc.includes('openSettingsModal'))
      btn.style.display = isAdmin ? '' : 'none';
  });
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.style.display = isAdmin ? '' : 'none';

  // 전체 초기화 버튼 (admin만)
  const resetWrap = document.getElementById('sidebar-reset-btn');
  if (resetWrap && !isAdmin) resetWrap.style.display = 'none';

  // 사용자 정보 표시
  try {
    const u = JSON.parse(localStorage.getItem('ait_user') || '{}');
    const nameEl = document.getElementById('sidebar-user-name');
    if (nameEl) nameEl.textContent = u.name || u.email || '';
    const roleEl = document.getElementById('sidebar-user-role');
    if (roleEl) {
      const labels = { admin: '전체관리자', cp_editor: 'CP편집자', qpoint_editor: 'Q-Point편집자', viewer: '읽기전용', general: '읽기전용' };
      roleEl.textContent = labels[role] || role;
    }
  } catch {}
}

/* ── 탭 전환 ── */
function showTab(id, el) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.getElementById('pane-' + id).classList.add('active');
  el.classList.add('active');
}

/* ── 활성 문서 탭 표시/숨김 ── */
const ALL_DOC_TYPES = [
  { id: 'cp',     label: '관리계획서' },
  { id: 'ws',     label: '작업표준서' },
  { id: 'daily',  label: '설비일상점검표' },
  { id: 'imf',    label: '초중종물' },
  { id: 'ms',     label: '마스터샘플' },
  { id: 'spec',   label: '사양표' },
  { id: 'insp',   label: '공정검사기준서' },
  { id: 'qpoint', label: 'Q-Point' }
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
  const editPane = document.querySelector('.pane.active.edit-mode');
  if (editPane) {
    const curPaneId = editPane.id.replace('pane-', '');
    const ans = confirm('편집 중인 내용이 있습니다.\n\n[확인] 저장하고 차종 변경\n[취소] 차종 변경 취소');
    if (!ans) {
      const prevCar = window.currentCar;
      Array.from(sel.options).forEach((o, i) => { if (o.text === prevCar) sel.selectedIndex = i; });
      return;
    }
    if (typeof saveDocument === 'function') saveDocument(curPaneId);
  }
  const opt = sel.options[sel.selectedIndex];
  window.currentCar   = opt.text;
  window.currentCarId = opt.value;
  localStorage.setItem('ait_cur_car', window.currentCar);
  // 활성 문서 탭 적용
  const cars = loadCars();
  const car  = cars.find(c => String(c.id) === String(opt.value));
  applyEnabledDocs(car?.enabled_docs);
  if (car) _syncCarMetaToLocal(car);
  // 개정이력 DB 갱신 (차종 전환 시)
  if (!AIT_API.MOCK && window.currentCarId) {
    const _ncId = window.currentCarId, _ncName = window.currentCar;
    [...new Set(['cp','ws','daily','imf','ms','spec'].map(p => _revGroupKey(p)))].forEach(pane => {
      AIT_API.getRevisions(_ncId, pane).then(rows => {
        const validRows = (rows || []).filter(r => r && r.id != null);
        const rd = { rev: 0, history: [] };
        validRows.forEach(r => {
          const rev = parseInt(r.rev) || 0;
          if (rev > rd.rev) rd.rev = rev;
          rd.history.push({ rev, date: r.rev_date || '', user: r.author || '', desc: r.note || '', docs: pane, dbId: r.id, rev_display: r.rev_display || '' });
        });
        rd.history.sort((a, b) => b.rev - a.rev);
        saveRevDataFor(pane, _ncName, rd);
        updateAllRevDisplays();
      }).catch(() => {});
    });
  }
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

async function toggleTabEditMode(pane, btn) {
  if (!canEdit(pane)) { alert('편집 권한이 없습니다.'); return; }
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
    try {
      const res = await fetch('https://aitechn8n.ngrok.app/webhook/ait/auth/edit-pw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
        body: JSON.stringify({ password: pw })
      });
      const raw = await res.json();
      const data = Array.isArray(raw) ? raw[0] : raw;
      if (!data.ok) { alert('비밀번호가 올바르지 않습니다.'); return; }
    } catch { alert('서버 연결 오류. 잠시 후 다시 시도하세요.'); return; }
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
    if (pane === 'insp' && typeof window.inspSetEditable === 'function') window.inspSetEditable(true);
    if (pane === 'spec' && typeof window.specSetEditable === 'function') window.specSetEditable(true);
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
const _STANDALONE_PANES = ['cp', 'ws', 'daily', 'imf', 'ms', 'insp', 'qpoint', 'spec'];
// cp / ws / daily 는 동일한 개정 이력 공유
function _revGroupKey(pane) {
  return (pane === 'ws' || pane === 'daily') ? 'cp' : pane;
}
const _revMemStore = {}; // localStorage 대신 메모리 캐시 사용
function getRevDataFor(pane, carName) {
  if (!_STANDALONE_PANES.includes(pane)) return getRevData(carName);
  const key = `${_revGroupKey(pane)}:${carName}`;
  if (!_revMemStore[key]) _revMemStore[key] = { rev: 0, history: [] };
  return _revMemStore[key];
}
function saveRevDataFor(pane, carName, data) {
  if (!_STANDALONE_PANES.includes(pane)) { saveRevData(carName, data); return; }
  const key = `${_revGroupKey(pane)}:${carName}`;
  _revMemStore[key] = data;
}

function updateRevDisplay(pane) {
  const carName = getCurrentCar();
  const rd = _STANDALONE_PANES.includes(pane) ? getRevDataFor(pane, carName) : getRevData(carName);
  const badge = document.getElementById(pane + '-rev-badge');
  const dateEl = document.getElementById(pane + '-rev-date');
  if (badge) badge.textContent = rd.history[0]?.rev_display || `Rev. ${rd.rev}`;
  if (dateEl) dateEl.textContent = `개정일: ${rd.history[0]?.date || '-'}`;
}

function updateAllRevDisplays() {
  ['cp','ws','daily','imf','ms','insp','spec'].forEach(updateRevDisplay);
}

let _revModalPane = null;
let _revDbMap = {};
let _signsMap = {};

function _signCell(rev, role, fileId, name, liveMode) {
  if (fileId) {
    const proxyUrl = `https://aitechn8n.ngrok.app/webhook/ait/sign-img?fileId=${fileId}`;
    const delBtn = liveMode
      ? `<button onclick="event.stopPropagation();removeSign(${rev},'${role}')" title="서명 삭제"
           style="position:absolute;top:0;right:0;background:#ef4444;border:none;border-radius:3px;color:#fff;font-size:9px;padding:1px 4px;cursor:pointer;line-height:1.4">✕</button>`
      : '';
    return `<div style="position:relative;display:inline-block">
      <img data-proxy-img="${proxyUrl}" src="" style="max-height:44px;max-width:80px;display:block;margin:0 auto;object-fit:contain">
      ${name ? `<div style="font-size:10px;color:var(--text2);margin-top:1px">${name}</div>` : ''}
      ${delBtn}</div>`;
  }
  if (!liveMode) return `<span style="color:var(--text2)">—</span>`;
  return `<button onclick="openSignModal(${rev},'${role}')"
    style="background:none;border:1px dashed #d1d5db;border-radius:4px;color:#9ca3af;font-size:11px;padding:3px 8px;cursor:pointer;white-space:nowrap">서명</button>`;
}

function removeSign(rev, role) {
  if (getMyRole() !== 'admin') { alert('관리자 권한이 필요합니다.'); return; }
  AIT_API.deleteSign(window.currentCarId, _revGroupKey(_revModalPane), rev, role)
    .then(() => openRevModal(_revModalPane))
    .catch(e => alert('삭제 실패: ' + (e.message || e)));
}

function openRevModal(pane) {
  _revModalPane = pane || null;
  const carName = getCurrentCar();

  function _renderRevModal() {
    const rd = (pane && _STANDALONE_PANES.includes(pane)) ? getRevDataFor(pane, carName) : getRevData(carName);
    const label = pane === 'imf' ? '초중종물' : pane === 'ms' ? '마스터샘플' : '';
    document.getElementById('rev-modal-car').textContent = carName + (label ? ` — ${label}` : '');
    const tbody = document.getElementById('rev-modal-tbody');
    const liveMode = !AIT_API.MOCK;
    tbody.innerHTML = rd.history.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px">개정 이력이 없습니다</td></tr>`
      : rd.history.map((h, i) => {
        const sg = _signsMap[h.rev] || {};
        const au = sg.author   || {}, rv = sg.reviewer || {}, ap = sg.approver || {};
        return `<tr>
          <td class="td-center"><span class="rev-num">Rev.${h.rev}</span></td>
          <td class="td-center" style="color:#0f766e;font-weight:600">${h.rev_display||''}</td>
          <td class="td-center">${h.date}</td>
          <td>${h.desc}</td>
          <td class="td-center">${_signCell(h.rev,'author',  au.fileId||'', au.name||h.user||'', liveMode)}</td>
          <td class="td-center">${_signCell(h.rev,'reviewer',rv.fileId||'', rv.name||'',          liveMode)}</td>
          <td class="td-center">${_signCell(h.rev,'approver',ap.fileId||'', ap.name||'',          liveMode)}</td>
          <td class="td-center"><button onclick="deleteRevEntry(${i})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px" title="이력 삭제">🗑</button></td>
        </tr>`;
      }).join('');
    // 서명 이미지 비동기 로드 (n8n proxy → base64 data URL)
    tbody.querySelectorAll('img[data-proxy-img]').forEach(img => {
      fetch(img.dataset.proxyImg, {cache: 'no-store', headers: AIT_API.authHeaders()})
        .then(r => r.json())
        .then(data => {
          const d = Array.isArray(data) ? data[0] : data;
          if (d && d.dataUrl) img.src = d.dataUrl;
        })
        .catch(() => {});
    });
    document.getElementById('rev-modal').classList.add('open');
  }

  // DB에서 이력+서명 로드 → localStorage 동기화 후 렌더링
  if (!AIT_API.MOCK && window.currentCarId) {
    Promise.all([
      AIT_API.getRevisions(window.currentCarId, _revGroupKey(pane)),
      AIT_API.getRevisionSigns(window.currentCarId, _revGroupKey(pane))
    ]).then(([rows, signs]) => {
      _revDbMap = {};
      _signsMap = {};
      const validRows = (rows || []).filter(r => r && r.id != null);
      if (validRows.length) {
        const rd = { rev: 0, history: [] };
        validRows.forEach(r => {
          const rev = parseInt(r.rev) || 0;
          if (rev > rd.rev) rd.rev = rev;
          _revDbMap[rev] = r;
          rd.history.push({ rev, date: r.rev_date || '', user: r.author || '', desc: r.note || '', docs: pane, dbId: r.id, rev_display: r.rev_display || '' });
        });
        rd.history.sort((a, b) => b.rev - a.rev);
        saveRevDataFor(pane, carName, rd);
        updateAllRevDisplays();
      }
      if (signs && signs.length) {
        signs.forEach(s => {
          const rev = parseInt(s.rev);
          if (!_signsMap[rev]) _signsMap[rev] = {};
          _signsMap[rev][s.role] = { name: s.signer_name || '', fileId: s.sign_file_id || '' };
        });
      }
      _renderRevModal();
    }).catch(() => _renderRevModal());
  } else {
    _renderRevModal();
  }
}

function deleteRevEntry(idx) {
  if (getMyRole() !== 'admin') { alert('관리자 권한이 필요합니다.'); return; }
  if (!confirm('이 개정 이력을 삭제하시겠습니까?')) return;
  const carName = getCurrentCar();
  const pane = _revModalPane;
  const isStandalone = pane && _STANDALONE_PANES.includes(pane);
  const rd = isStandalone ? getRevDataFor(pane, carName) : getRevData(carName);
  const entry = rd.history[idx];
  const dbId = entry && entry.dbId;

  const _doDelete = () => {
    rd.history.splice(idx, 1);
    rd.rev = rd.history.length > 0 ? Math.max(...rd.history.map(h => h.rev)) : 0;
    if (isStandalone) saveRevDataFor(pane, carName, rd);
    else saveRevData(carName, rd);
    updateAllRevDisplays();
    openRevModal(pane);
  };

  if (dbId && !AIT_API.MOCK && window.currentCarId) {
    AIT_API.deleteRevision(dbId)
      .then(_doDelete)
      .catch(e => alert('삭제 실패: ' + (e.message || e)));
  } else {
    _doDelete();
  }
}

function closeRevModal() {
  document.getElementById('rev-modal').classList.remove('open');
}

/* ── 전자서명 모달 ── */
let _signRev = null, _signRole = null, _signCanvasReady = false;
let _signCallback = null; // Q-Point 등 외부 컨텍스트용 콜백

function openSignModal(rev, role) {
  _signRev = rev;
  _signRole = role;
  const labels = { author: '작성자', reviewer: '검토자', approver: '승인자' };
  document.getElementById('sign-modal-title').textContent = (labels[role] || role) + ' 서명';
  document.getElementById('sign-name-input').value = '';
  const btn = document.querySelector('#sign-modal .sign-save-btn');
  if (btn) btn.disabled = false;
  if (!_signCanvasReady) { _initSignCanvas(); _signCanvasReady = true; }
  signClear();
  document.getElementById('sign-modal').classList.add('open');
}

function closeSignModal() {
  document.getElementById('sign-modal').classList.remove('open');
}

function signClear() {
  const canvas = document.getElementById('sign-canvas');
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function signSave() {
  const name = (document.getElementById('sign-name-input').value || '').trim();
  if (!name) { alert('이름을 입력하세요'); return; }
  const canvas = document.getElementById('sign-canvas');
  const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  if (!Array.from(px).some((v, i) => i % 4 === 3 && v > 0)) { alert('서명을 그려주세요'); return; }
  const base64 = canvas.toDataURL('image/png');
  if (_signCallback) {
    const cb = _signCallback; _signCallback = null;
    cb(name, base64); closeSignModal(); return;
  }
  const btn = document.querySelector('#sign-modal .sign-save-btn');
  if (btn) btn.disabled = true;
  const _roleSeq = {author:'01', reviewer:'02', approver:'03'};
  const _seq = _roleSeq[_signRole] || '01';
  const _safeCar = (window.currentCar || '').replace(/[^a-zA-Z0-9가-힣]/g,'_').slice(0,20) || 'car';
  let _fn;
  if (_revModalPane === 'insp') {
    _fn = _safeCar + '-' + String(_signRev||0) + '-' + _seq + '.png';
  } else {
    _fn = (_revModalPane||'cp') + '_' + _safeCar + '_r' + String(_signRev||0) + '_' + (_signRole||'x') + '.png';
  }
  _fn = _fn.replace(/[^a-zA-Z0-9가-힣._-]/g,'_');
  AIT_API.signRevision(window.currentCarId, _revGroupKey(_revModalPane), _signRev, _signRole, name, base64, _fn)
    .then(() => { closeSignModal(); openRevModal(_revModalPane); })
    .catch(e => { alert('저장 실패: ' + (e.message || e)); if (btn) btn.disabled = false; });
}

function openSignModalWith(title, prefillName, callback) {
  _signCallback = callback;
  document.getElementById('sign-modal-title').textContent = title;
  document.getElementById('sign-name-input').value = prefillName || '';
  const btn = document.querySelector('#sign-modal .sign-save-btn');
  if (btn) btn.disabled = false;
  if (!_signCanvasReady) { _initSignCanvas(); _signCanvasReady = true; }
  signClear();
  document.getElementById('sign-modal').classList.add('open');
}

function _initSignCanvas() {
  const canvas = document.getElementById('sign-canvas');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy];
  }
  function start(e) { e.preventDefault(); drawing = true; const [x,y] = pos(e); ctx.beginPath(); ctx.moveTo(x,y); }
  function move(e)  { if (!drawing) return; e.preventDefault(); const [x,y] = pos(e); ctx.lineTo(x,y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x,y); }
  function end()    { drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
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

    const paneLabels = { cp:'CP', ws:'작업표준서', daily:'설비일상점검표', imf:'초중종물', ms:'마스터샘플', insp:'공정검사기준서', spec:'사양표', qpoint:'Q-Point' };
    let doRevise = confirm(`개정하시겠습니까?\n\n[확인] 예 — 개정번호 자동 부여\n[취소] 아니오 — 저장만 (개정번호 유지)`);

    if (doRevise) {
      const rd = getRevDataFor(pane, carName);
      const newRev = rd.history.length === 0 ? 0 : rd.rev + 1;
      const desc = prompt(newRev === 0 ? `개정 내용을 입력하세요\nRev.0 (최초 작성)` : `개정 내용을 입력하세요\nRev.${rd.rev} → Rev.${newRev}`);
      if (desc === null) {
        doRevise = false; // 설명 입력 취소 → 개정 없이 저장만 진행
      } else {
        const revDisplay = prompt(`표시 리비전 코드 입력 (선택사항)\n비우면 숫자 Rev.${newRev} 그대로 사용\n예: AAB, 001, AAA`) || '';
        const today = new Date();
        const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
        rd.rev = newRev;
        rd.history.unshift({ rev: newRev, date: dateStr, user: '', desc: desc || '내용 변경', docs: paneLabels[pane] || pane, rev_display: revDisplay });
        saveRevDataFor(pane, carName, rd);
        updateAllRevDisplays();
        if (!AIT_API.MOCK && window.currentCarId) {
          AIT_API.addRevision(window.currentCarId, _revGroupKey(pane), {
            rev_date: dateStr, note: desc || '내용 변경', author: '', rev_display: revDisplay
          }).catch(e => console.warn('개정이력 DB 저장 실패', e));
        }
        alert(`✅ Rev.${newRev}${revDisplay ? ' (' + revDisplay + ')' : ''} 개정 완료\n개정일: ${dateStr}`);
      }
    }

    snapshots[pane] = current;

    // 차종별 콘텐츠 localStorage 저장
    _saveCarContent(pane, carName);

    // DB 저장 (MOCK=false 일 때)
    if (!AIT_API.MOCK) {
      if (pane === 'cp') {
        const paneEl = document.getElementById('pane-cp');
        window.showSaving && window.showSaving();
        _saveCpToDb(carName, paneEl)
          .then(async msg => {
            window.hideSaving && window.hideSaving();
            window.showToast && window.showToast('CP 저장 완료 (' + msg + ')', 'success');
            // CP 변경 → daily + 공정검사기준서 동기화
            if (window.currentCarId) {
              try {
                const cpRows = await AIT_API.getCpRows(window.currentCarId);
                const carObj = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));

                // ① 설비일상 기준 동기화
                const equipments = _buildDailyFromCpRows(cpRows, carObj?.linename || '');
                if (equipments.length) {
                  await AIT_API.syncDailyEquip(window.currentCarId, equipments);
                  const freshEquips = await AIT_API.getDailyEquipments(window.currentCarId);
                  const equipIdMap = {};
                  freshEquips.forEach(e => { equipIdMap[e.equip_name] = e.id; });
                  const allItems = [];
                  equipments.forEach(eq => {
                    const eId = equipIdMap[eq.sheet || eq.equip_name];
                    if (!eId) return;
                    (eq.items || []).forEach((it, idx) => {
                      allItems.push({ equip_id: eId, item_no: it.no, item_name: it.name, standard: it.std, method: it.method, cycle: it.cycle, sort_order: idx });
                    });
                  });
                  if (allItems.length) await AIT_API.syncDailyItems(window.currentCarId, allItems);
                }

                // ② 공정검사기준서 공정 탭 동기화 (proc_no 기준, 사진·검사항목 보존)
                const cpProcOrder = [], cpProcMap = {};
                cpRows.forEach(r => {
                  const key = String(r.proc_no || '');
                  if (key && !cpProcMap[key]) { cpProcMap[key] = r.proc_name || ''; cpProcOrder.push(key); }
                });
                if (cpProcOrder.length) {
                  const inspDoc = await AIT_API.getInspDoc(window.currentCarId);
                  const existingMap = {};
                  ((inspDoc && inspDoc.procs) || []).forEach(p => { existingMap[String(p.proc_no)] = p; });
                  const newProcs = cpProcOrder.map(procNo => {
                    const ex = existingMap[procNo];
                    if (ex) { ex.proc_name = cpProcMap[procNo]; return ex; }
                    return { id: Date.now().toString(36) + Math.random().toString(36).slice(2,5), proc_no: procNo, proc_name: cpProcMap[procNo], proc_type: '일반공정', items: [] };
                  });
                  const merged = Object.assign({}, inspDoc || {}, { procs: newProcs });
                  await AIT_API.saveInspDoc(window.currentCarId, merged);
                  if (typeof window.inspLoadDoc === 'function') window.inspLoadDoc();
                }
              } catch(e) {
                console.warn('CP 연동 동기화 실패:', e);
              }
            }
            // CP 변경 → 이번 달부터의 설비일상 실적만 초기화 (과거 기록 보존, 이미지 제외)
            if (window.currentCarId) {
              const now = new Date();
              const fromDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
              AIT_API.resetDailyOnCpChange(window.currentCarId, fromDate)
                .then(() => console.log('설비일상 실적 초기화 완료 (from', fromDate, ')'))
                .catch(e => console.warn('설비일상 초기화 실패 (n8n 미설정?):', e));
            }
          })
          .catch(e => {
            window.hideSaving && window.hideSaving();
            window.showToast && window.showToast('CP 저장 실패: ' + (e?.message || String(e)), 'error');
          });
      }
      if (pane === 'daily') {
        // localStorage 저장은 _saveCarContent에서 처리됨
        const dailyList = typeof window._dailyGetEquip === 'function' ? window._dailyGetEquip() : null;
        if (dailyList && dailyList.length && window.currentCarId) {
          window.showSaving && window.showSaving();
          AIT_API.syncDailyEquip(window.currentCarId, dailyList)
            .then(() => {
              window.hideSaving && window.hideSaving();
              window.showToast && window.showToast('설비일상점검표 저장 완료', 'success');
            })
            .catch(e => {
              window.hideSaving && window.hideSaving();
              window.showToast && window.showToast('설비일상점검표 저장 실패: ' + (e?.message || String(e)), 'error');
            });
        } else {
          window.showToast && window.showToast('설비일상점검표 저장 완료', 'success');
        }
      }
      if (pane === 'ms' && typeof window._msSyncToDb === 'function' && window.currentCarId) {
        window.showSaving && window.showSaving();
        window._msSyncToDb()
          .then(() => {
            window.hideSaving && window.hideSaving();
            window.showToast && window.showToast('마스터샘플 저장 완료', 'success');
          })
          .catch(e => {
            window.hideSaving && window.hideSaving();
            window.showToast && window.showToast('마스터샘플 저장 실패: ' + (e?.message || String(e)), 'error');
          });
      }
      if (pane === 'spec') {
        window.showToast && window.showToast('사양표 저장 완료', 'success');
      }
      if (pane === 'insp' && window.currentCarId) {
        if (typeof window._inspSyncToDb === 'function') {
          window.showSaving && window.showSaving();
          window._inspSyncToDb()
            .then(() => { window.hideSaving && window.hideSaving(); window.showToast && window.showToast('공정검사기준서 저장 완료', 'success'); })
            .catch(e => { window.hideSaving && window.hideSaving(); window.showToast && window.showToast('공정검사기준서 저장 실패: ' + (e?.message || String(e)), 'error'); });
        } else {
          window.showToast && window.showToast('공정검사기준서 저장 완료', 'success');
        }
      }
      if (pane === 'qpoint' && window.currentCarId) {
        if (typeof window._qpSyncToDb === 'function') {
          window.showSaving && window.showSaving();
          window._qpSyncToDb()
            .then(() => { window.hideSaving && window.hideSaving(); window.showToast && window.showToast('Q-Point 저장 완료', 'success'); })
            .catch(e => { window.hideSaving && window.hideSaving(); window.showToast && window.showToast('Q-Point 저장 실패: ' + (e?.message || String(e)), 'error'); });
        } else {
          window.showToast && window.showToast('Q-Point 저장 완료', 'success');
        }
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
      if (pane === 'insp' && typeof window.inspSetEditable === 'function') window.inspSetEditable(false);
      if (pane === 'spec' && typeof window.specSetEditable === 'function') window.specSetEditable(false);
      if (editBtn) { editBtn.style.background = ''; editBtn.style.color = ''; }
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
    closeSettingsModal();
  }
});

/* ── 설정 모달 ── */
function openSettingsModal() {
  if (getMyRole() !== 'admin') { alert('관리자 권한이 필요합니다.'); return; }
  const pw = prompt('설정에 접근하려면 현재 편집 모드 비밀번호를 입력하세요');
  if (pw === null) return;
  fetch('https://aitechn8n.ngrok.app/webhook/ait/auth/edit-pw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
    body: JSON.stringify({ password: pw })
  }).then(r => r.json()).then(raw => {
    const data = Array.isArray(raw) ? raw[0] : raw;
    if (!data.ok) { alert('비밀번호가 올바르지 않습니다.'); return; }
    document.getElementById('settings-new-pw').value = '';
    document.getElementById('settings-new-pw2').value = '';
    document.getElementById('settings-modal').classList.add('open');
  }).catch(() => alert('서버 연결 오류. 잠시 후 다시 시도하세요.'));
}

function closeSettingsModal() {
  const el = document.getElementById('settings-modal');
  if (el) el.classList.remove('open');
}

async function saveSettingsPw() {
  const pw1 = document.getElementById('settings-new-pw').value;
  const pw2 = document.getElementById('settings-new-pw2').value;
  if (!pw1) { alert('새 비밀번호를 입력하세요.'); return; }
  if (pw1 !== pw2) { alert('비밀번호가 일치하지 않습니다.'); return; }
  try {
    const res = await fetch('https://aitechn8n.ngrok.app/webhook/ait/auth/edit-pw/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
      body: JSON.stringify({ new_password: pw1 })
    });
    if (!res.ok) throw new Error('서버 오류');
    localStorage.removeItem('ait_edit_pw');
    closeSettingsModal();
    alert('✅ 비밀번호가 변경되었습니다. 모든 계정에 즉시 적용됩니다.');
  } catch(e) {
    alert('비밀번호 변경 실패: ' + (e.message || String(e)));
  }
}

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
  window._aitCars = cars;
  renderCarSelect(cars);
  window.currentCar = localStorage.getItem('ait_cur_car') || cars[0]?.name || 'GN7 FL OHCL';
  const cur = cars.find(c => c.name === window.currentCar) || cars[0];
  if (cur) {
    // 이름 변경 등으로 저장된 이름이 DB와 다르면 실제 아이템 이름으로 동기화 (캐시 키 불일치 방지)
    if (window.currentCar !== cur.name) {
      window.currentCar = cur.name;
      localStorage.setItem('ait_cur_car', cur.name);
    }
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
      [...new Set(['cp','ws','daily','imf','ms','spec'].map(p => _revGroupKey(p)))].forEach(pane => {
        AIT_API.getRevisions(cur.id, pane).then(rows => {
          const validRows = (rows || []).filter(r => r && r.id != null);
          if (!validRows.length) return;
          const rd = { rev: 0, history: [] };
          _revDbMap = {};
          validRows.forEach(r => {
            const rev = parseInt(r.rev) || 0;
            if (rev > rd.rev) rd.rev = rev;
            _revDbMap[rev] = r;
            rd.history.push({ rev, date: r.rev_date || '', user: r.author || '', desc: r.note || '', docs: pane,
              dbId: r.id, rev_display: r.rev_display || '',
              authorSign: r.author_sign || '',
              reviewerName: r.reviewer_name || '', reviewerSign: r.reviewer_sign || '',
              approverName: r.approver_name || '', approverSign: r.approver_sign || ''
            });
          });
          rd.history.sort((a, b) => b.rev - a.rev);
          saveRevDataFor(pane, window.currentCar, rd);
          updateAllRevDisplays();
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
    `<option value="${c.id}" data-linename="${c.linename || ''}" ${c.name === cur ? 'selected' : ''}>${c.name}</option>`
  ).join('');
}
function openCarModal() {
  if (getMyRole() !== 'admin') { alert('관리자 권한이 필요합니다.'); return; }
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
// 이름을 키로 쓰는 메모리/로컬 캐시를 옛 이름 → 새 이름으로 이전
function _migrateCarNameCaches(oldName, newName) {
  if (window._cpMetaCache && window._cpMetaCache[oldName] !== undefined) {
    window._cpMetaCache[newName] = window._cpMetaCache[oldName];
    delete window._cpMetaCache[oldName];
  }
  if (window._cftCache && window._cftCache[oldName] !== undefined) {
    window._cftCache[newName] = window._cftCache[oldName];
    delete window._cftCache[oldName];
  }
  try {
    const cft = localStorage.getItem(`ait_cft_${oldName}`);
    if (cft !== null) {
      localStorage.setItem(`ait_cft_${newName}`, cft);
      localStorage.removeItem(`ait_cft_${oldName}`);
    }
  } catch {}
  try {
    const all = JSON.parse(localStorage.getItem('ait_revisions') || '{}');
    if (all[oldName] !== undefined) {
      all[newName] = all[oldName];
      delete all[oldName];
      localStorage.setItem('ait_revisions', JSON.stringify(all));
    }
  } catch {}
  Object.keys(_revMemStore).forEach(k => {
    const sep = k.indexOf(':');
    if (sep >= 0 && k.slice(sep + 1) === oldName) {
      _revMemStore[`${k.slice(0, sep)}:${newName}`] = _revMemStore[k];
      delete _revMemStore[k];
    }
  });
}
async function confirmEditCar(id) {
  const item = document.querySelector(`.car-item[data-id="${id}"]`);
  const newName = item.querySelector('.car-name-input').value.trim();
  if (!newName) return;
  const cars = loadCars();
  const car = cars.find(c => c.id === id);
  const oldName = car?.name;
  if (car) car.name = newName;
  saveCarsToStorage(cars);
  await AIT_API.updateCar(id, { name: newName });
  // 이름 변경 시 세션/캐시 동기화 — 이름-키 데이터가 새 이름을 따라가도록
  if (oldName && oldName !== newName) {
    _migrateCarNameCaches(oldName, newName);
    if (window.currentCar === oldName) {
      window.currentCar = newName;
      localStorage.setItem('ait_cur_car', newName);
    }
  }
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
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 20);
      await AIT_API.createCar({ code, name, stage: '', partno: '', partname: '', linename: '', enabled_docs: JSON.stringify(ALL_DOC_TYPES.map(d => d.id)) });
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
      const driveVid = item.querySelector('.ws-photo-inner .ws-drive-video[data-file-id]');
      const mediaEl = vid || img;
      const mediaSrc = mediaEl?.src || '';
      const _procIdMap = (window._wsProcIdMap?.[getCurrentCar()]) || {};
      steps.push({
        proc_no: procNum,
        process_id: _procIdMap[procNum] || null,
        step_no: idx + 1,
        step_name: item.querySelector('.ws-step-name')?.textContent.trim() || item.querySelector('.ws-step-name-input')?.value.trim() || '',
        spec_html: item.querySelector('.ws-step-spec')?.innerHTML || '',
        media_url: (mediaSrc && !mediaSrc.startsWith('data:')) ? mediaSrc : '',
        media_type: (vid || driveVid) ? 'video' : 'image',
        media_file_id: mediaEl?.dataset?.fileId || driveVid?.dataset?.fileId || '',
        sort_order: idx
      });
    });
  });
  return steps;
}
function _toDirectDriveUrl(url) {
  if (!url) return url;
  const m = url.match(/[?&]fileId=([^&]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`;
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([^?&\s=]+)/);
  if (lh3) return `https://drive.google.com/thumbnail?id=${lh3[1]}&sz=w1200`;
  const uc = url.match(/drive\.google\.com\/(?:uc\?.*[?&]id=|thumbnail\?.*[?&]id=)([^&\s]+)/);
  if (uc) return `https://drive.google.com/thumbnail?id=${uc[1]}&sz=w1200`;
  return url;
}
function _renderWsMgmtFromItems(items, paneEl, car) {
  const tb = paneEl.querySelector('#ws-mgmt-tbody');
  if (!tb || !items || !items.length) return;
  const seenProc = {};
  const _n = v => (!v || v === 'null') ? '' : v;
  const delBtn = `<td class="edit-only" style="padding:2px;text-align:center"><button onclick="this.closest('tr').remove()" style="width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="삭제">✕</button></td>`;
  tb.innerHTML = items.map(r => {
    const proc = r.proc_no || '';
    if (!seenProc[proc]) seenProc[proc] = 0;
    seenProc[proc]++;
    const isDaily = (r.plan_type || '').includes('설비일상');
    const catColor = (r.category || '').includes('제품') ? '#1d4ed8' : '#15803d';
    return `<tr data-proc="${proc}" data-plan="${_n(r.plan_type)}"${isDaily ? ' class="daily-row"' : ''}>
      <td contenteditable="false" style="font-family:monospace;font-weight:700">${seenProc[proc]}</td>
      <td contenteditable="false" style="color:${catColor};font-weight:600;font-size:11px">${_n(r.category)}</td>
      <td contenteditable="false">${_n(r.item_name)}</td>
      <td contenteditable="false">${_n(r.standard)}</td>
      <td contenteditable="false">${_n(r.method)}</td>
      <td contenteditable="false">${_n(r.cycle)}</td>
      <td contenteditable="false">${_n(r.action_plan)}</td>
      <td contenteditable="false"${isDaily ? ' class="daily-badge"' : ''}>${_n(r.note)}</td>
      ${delBtn}</tr>`;
  }).join('');
  refreshMgmtRowColors(paneEl);
}

function _wsRenderStepsFromDb(rows, paneEl, car, extraProcs) {
  const byProc = {};
  window._wsProcIdMap = window._wsProcIdMap || {};
  window._wsProcIdMap[car] = {};
  rows.forEach(r => {
    const p = parseInt(r.proc_num)||0;
    if (r.process_id) window._wsProcIdMap[car][p] = r.process_id;
    (byProc[p]||(byProc[p]=[])).push(r);
  });
  const stepProcs = Object.keys(byProc).map(Number).filter(Boolean).sort((a,b)=>a-b);
  const procs = (extraProcs && extraProcs.length)
    ? [...extraProcs, ...stepProcs.filter(p => !extraProcs.includes(p))]
    : stepProcs;
  if (!procs.length) return false;
  buildWsProcs(procs, paneEl);
  const delBtn = `<button class="edit-only" onclick="wsRemovePhoto(this)" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;line-height:1">✕</button>`;
  procs.forEach(proc => {
    const list = paneEl.querySelector(`#ws-step-list-${proc}`);
    if (!list) return;
    (byProc[proc] || []).sort((a,b)=>a.step_num-b.step_num).forEach((row, idx) => {
      const item = document.createElement('div');
      item.className = 'ws-step-item';
      let mediaHtml = typeof _wsMediaLabel === 'function' ? _wsMediaLabel() : '';
      if (row.media_url || row.media_file_id) {
        const fid = row.media_file_id || '';
        const mUrl = _toDirectDriveUrl(row.media_url || '');
        mediaHtml = (row.media_type === 'video')
          ? (fid
            ? `<div class="ws-drive-video" data-file-id="${fid}" style="width:100%;background:#0a1628;border-radius:4px;overflow:hidden;position:relative"><iframe src="https://drive.google.com/file/d/${fid}/preview" style="width:100%;height:280px;border:none;display:block" allow="autoplay" allowfullscreen></iframe>${delBtn}</div>`
            : `<video src="${mUrl}" data-file-id="${fid}" controls style="width:100%;display:block;border-radius:4px;max-height:400px"></video>${delBtn}`)
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
  const cpMeta = _cpMetaGet(car);
  const _wsCarE = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
  const wsPn = paneEl.querySelector('#ws-pn'); const wsPnm = paneEl.querySelector('#ws-pname');
  if (wsPn)  wsPn.textContent  = cpMeta.partno   || _wsCarE?.partno   || '';
  if (wsPnm) wsPnm.textContent = cpMeta.partname || _wsCarE?.partname || '';
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
      window.showSaving && window.showSaving();
      Promise.all([
        AIT_API.syncWsSteps(window.currentCarId, _wsExtractSteps(paneEl)),
        AIT_API.saveWsMeta(window.currentCarId, data.safety || '')
      ]).then(() => {
        window.hideSaving && window.hideSaving();
        window.showToast && window.showToast('작업표준서 저장 완료', 'success');
      }).catch(e => {
        window.hideSaving && window.hideSaving();
        window.showToast && window.showToast('작업표준서 저장 실패: ' + (e?.message || String(e)), 'error');
      });
    }
  }
  if (pane === 'insp' && typeof window.inspSaveDocData === 'function') window.inspSaveDocData();
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
    `<span class="proc-tab-wrap">` +
    `<button class="proc-btn${i === 0 ? ' active' : ''}" onclick="showProcess(${p},this)">공정 ${p}</button>` +
    `<button class="edit-only proc-del-btn" onclick="event.stopPropagation();deleteWsProc(${p},this)" title="공정 삭제">✕</button>` +
    `</span>`
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
      updateRevDisplay('cp');
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
        const _wsCarDb = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
        const wsPn = paneEl.querySelector('#ws-pn'); const wsPnm = paneEl.querySelector('#ws-pname');
        if (wsPn)  wsPn.textContent  = cpMeta.partno   || _wsCarDb?.partno   || '';
        if (wsPnm) wsPnm.textContent = cpMeta.partname || _wsCarDb?.partname || '';
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
        const _fm = _cpMetaGet(car);
        const _wsCarLs = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
        const _fpn = paneEl.querySelector('#ws-pn'); const _fpnm = paneEl.querySelector('#ws-pname');
        if (_fpn)  _fpn.textContent  = _fm.partno   || _wsCarLs?.partno   || '';
        if (_fpnm) _fpnm.textContent = _fm.partname || _wsCarLs?.partname || '';
        if (!isBase) {
          const tb2 = paneEl.querySelector('#ws-mgmt-tbody');
          if (tb2) tb2.innerHTML = '';
        }
      }
    };
    if (!AIT_API.MOCK && window.currentCarId) {
      // 작표: STEP·안전주의사항은 DB에서 로드, 관리항목은 CP rows에서 직접 빌드
      Promise.all([
        AIT_API.getWsSteps(window.currentCarId).catch(() => []),
        AIT_API.getCpRows(window.currentCarId).catch(() => []),
        AIT_API.getWsMeta(window.currentCarId).catch(() => null)
      ]).then(([stepsRows, cpRows, meta]) => {
        // 1. 안전주의사항: DB에서 로드
        if (meta && meta.safety_html !== undefined) {
          const safetyEl = paneEl.querySelector('#ws-safety');
          if (safetyEl) safetyEl.innerHTML = meta.safety_html || '';
        }
        // 2. 관리항목: CP rows에서 cpProcs 먼저 추출 (STEP nav 빌드에 사용)
        let cpProcs = [];
        if (cpRows && cpRows.length) {
          window._cpRowsForWs = cpRows; // showProcess 폴백용 캐시
          cpProcs = _buildWsMgmtFromCpRows(cpRows, paneEl);
          const activeProcNum = parseInt(paneEl.querySelector('#ws-proc-num')?.textContent.trim()) || 0;
          if (activeProcNum) {
            paneEl.querySelectorAll('#ws-mgmt-tbody tr').forEach(r => {
              r.style.display = (parseInt(r.dataset.proc) === activeProcNum) ? '' : 'none';
            });
          }
        }
        // 3. STEP: DB에서 로드 (cpProcs 전달 → CP 전체 공정 탭 포함)
        if (stepsRows && stepsRows.length) {
          _wsRenderStepsFromDb(stepsRows, paneEl, car, cpProcs);
        } else if (cpProcs.length && !paneEl.querySelector('#ws-proc-nav .proc-btn')) {
          buildWsProcs(cpProcs, paneEl);
        }
        // 4. 품번/품명 헤더 — _cpMetaCache 우선, window._aitCars 폴백
        const _hm = _cpMetaGet(car);
        const _carEntry = (window._aitCars || []).find(c => String(c.id) === String(window.currentCarId));
        console.log('[WS품번]', 'car=', car, 'carId=', window.currentCarId, 'cpMeta=', _hm, 'aitCarsEntry=', _carEntry);
        const _wsPn = paneEl.querySelector('#ws-pn');
        const _wsPnm = paneEl.querySelector('#ws-pname');
        if (_wsPn)  _wsPn.textContent  = _hm.partno   || _carEntry?.partno   || '';
        if (_wsPnm) _wsPnm.textContent = _hm.partname || _carEntry?.partname || '';
        refreshMgmtRowColors(paneEl);
      });
    }

  } else if (pane === 'imf') {
    if (typeof imfRenderAll === 'function') imfRenderAll();

  } else if (pane === 'ms') {
    if (typeof window._msReInit === 'function') window._msReInit();
  } else if (pane === 'daily') {
    if (!AIT_API.MOCK && window.currentCarId) {
      const linename = _cpMetaGet(car).linename || '';
      // CP = 단일 진실 소스: 설비목록·항목은 항상 CP 기준, DB에서 id·photo_count만 매핑
      Promise.all([
        AIT_API.getDailyEquipments(window.currentCarId).catch(() => []),
        AIT_API.getCpRows(window.currentCarId).catch(() => [])
      ]).then(([dbRows, cpRows]) => {
        if (cpRows && cpRows.length) {
          const list = _buildDailyFromCpRows(cpRows, linename);
          if (dbRows && dbRows.length) {
            const idMap = {};
            dbRows.forEach(r => { idMap[r.equip_name] = { id: r.id, photo_count: r.photo_count || 0 }; });
            list.forEach(e => { Object.assign(e, idMap[e.sheet] || {}); });
          }
          if (list.length && typeof window._dInitEquip === 'function') window._dInitEquip(list);
          else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
        } else if (dbRows && dbRows.length) {
          // CP 없을 때만 DB fallback
          if (typeof window._dInitEquip === 'function') window._dInitEquip(dbRows.map(r => ({
            id: r.id, sheet: r.equip_name,
            proc_no: String(r.proc_no || ''), proc_name: r.proc_name || '',
            location: r.location || '', manager: r.manager || '',
            sort_order: r.sort_order || 0, photo_count: r.photo_count || 0, items: []
          })));
          else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
        } else {
          if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
        }
      }).catch(() => { if (typeof window._dFlushInfo === 'function') window._dFlushInfo(); });
    } else if (typeof window._dFlushInfo === 'function') window._dFlushInfo();
  } else if (pane === 'insp') {
    if (typeof window.inspLoadDoc === 'function') window.inspLoadDoc();
  } else if (pane === 'qpoint') {
    if (typeof window.qpLoad === 'function') window.qpLoad();
  }
}

/* ── 즉시 알람 검증 (54_AIT_alarm_validate_POST webhook) ── */
window._aitAlarmValidate = async function(doc_type, parent_id, check_date, results, extra) {
  if (!parent_id || !check_date || !results || !results.length) return;
  try {
    const res = await fetch('https://aitechn8n.ngrok.app/webhook/ait/alarm/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
      body: JSON.stringify({ doc_type, parent_id, check_date, results, ...(extra || {}) })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.hasViolation && data.violations && data.violations.length) {
      const lines = data.violations.slice(0, 3)
        .map(v => `• ${v.item_name || ('항목 ' + v.item_no)}: ${v.issue_type}`);
      if (data.violations.length > 3) lines.push(`외 ${data.violations.length - 3}건`);
      if (typeof showToast === 'function')
        showToast('⚠ 이상 감지 ' + data.violations.length + '건\n' + lines.join('\n'), 'error');
    }
  } catch(e) {
    console.warn('[알람검증] webhook 호출 실패', e);
  }
};

/* ── 알람 설정 모달 (55_AIT_alarm_settings_POST webhook) ── */
const _ALARM_SETTINGS_URL = 'https://aitechn8n.ngrok.app/webhook/ait/alarm/settings';
let _alarmEnabled = null;
let _alarmReceivers = [];

function _alarmUpdateBtn(enabled) {
  _alarmEnabled = enabled;
  document.querySelectorAll('#alarm-toggle-btn').forEach(btn => {
    const icon  = btn.querySelector('#alarm-toggle-icon');
    const label = btn.querySelector('#alarm-toggle-label');
    if (icon)  icon.textContent  = enabled ? '🔔' : '🔕';
    if (label) label.textContent = enabled ? '알람설정 (ON)' : '알람설정 (OFF)';
    btn.style.color      = enabled ? '#16a34a' : '#6b7280';
    btn.style.borderColor= enabled ? '#86efac' : '#d1d5db';
  });
}

window._aitLoadAlarmState = async function() {
  try {
    const res = await fetch(_ALARM_SETTINGS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
      body: JSON.stringify({ action: 'get' })
    });
    if (!res.ok) return;
    const data = await res.json();
    _alarmEnabled = !!data.immediate_enabled;
    try { _alarmReceivers = JSON.parse(data.receivers || '[]'); } catch(e) { _alarmReceivers = []; }
    _alarmUpdateBtn(_alarmEnabled);
  } catch(e) {
    document.querySelectorAll('#alarm-toggle-label').forEach(el => { el.textContent = '알람설정'; });
    console.warn('[알람설정] 로드 실패', e);
  }
};

function _alarmModalRenderList(receivers) {
  const ul = document.getElementById('alarm-email-list');
  if (!ul) return;
  ul.innerHTML = receivers.length ? receivers.map((email, i) =>
    `<li style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f3f4f6">
      <span style="flex:1;font-size:12px;color:#111827">${email}</span>
      <button onclick="window._alarmRemoveEmail(${i})" style="border:none;background:none;color:#ef4444;cursor:pointer;font-size:14px;line-height:1;padding:2px 6px">&times;</button>
    </li>`).join('')
    : '<li style="font-size:12px;color:#9ca3af;padding:8px 0">수신자 없음</li>';
}

window._alarmRemoveEmail = function(idx) {
  _alarmReceivers.splice(idx, 1);
  _alarmModalRenderList(_alarmReceivers);
};

window._aitOpenAlarmModal = async function() {
  if (_alarmEnabled === null) await window._aitLoadAlarmState();

  // 기존 모달 제거
  const old = document.getElementById('alarm-settings-modal');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'alarm-settings-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:8000;display:flex;align-items:center;justify-content:center';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
  <div style="background:#fff;border-radius:12px;width:380px;max-width:95vw;box-shadow:0 8px 40px rgba(0,0,0,.18);overflow:hidden">
    <div style="background:#1e3264;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
      <span style="color:#fff;font-weight:700;font-size:14px">🔔 알람 설정</span>
      <button onclick="document.getElementById('alarm-settings-modal').remove()"
        style="background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;line-height:1">&times;</button>
    </div>
    <div style="padding:18px">
      <!-- 즉시알람 토글 -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e7eb;margin-bottom:14px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#111827">즉시알람</div>
          <div style="font-size:11px;color:#6b7280">저장 시 이상값 감지 → 즉시 이메일 발송</div>
        </div>
        <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
          <input type="checkbox" id="alarm-modal-toggle" ${_alarmEnabled ? 'checked' : ''}
            style="opacity:0;width:0;height:0;position:absolute"
            onchange="document.getElementById('alarm-modal-track').style.background=this.checked?'#16a34a':'#d1d5db'">
          <span id="alarm-modal-track" style="position:absolute;inset:0;border-radius:12px;background:${_alarmEnabled ? '#16a34a' : '#d1d5db'};transition:.2s"></span>
          <span style="position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:.2s;transform:translateX(0)"
            id="alarm-modal-thumb"></span>
        </label>
      </div>
      <!-- 체크박스로 thumb 위치 동기화 -->
      <style>#alarm-modal-toggle:checked ~ #alarm-modal-thumb{transform:translateX(20px)}</style>
      <!-- 수신 이메일 -->
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">수신 이메일</div>
      <ul id="alarm-email-list" style="list-style:none;padding:0;margin:0 0 10px"></ul>
      <div style="display:flex;gap:6px">
        <input id="alarm-email-input" type="email" placeholder="이메일 주소 입력"
          style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;outline:none"
          onkeydown="if(event.key==='Enter'){window._alarmAddEmail();event.preventDefault()}">
        <button onclick="window._alarmAddEmail()"
          style="border:1px solid #1e3264;background:#1e3264;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;white-space:nowrap">+ 추가</button>
      </div>
    </div>
    <div style="padding:12px 18px;background:#f9fafb;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #e5e7eb">
      <button onclick="document.getElementById('alarm-settings-modal').remove()"
        style="border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:7px 18px;font-size:12px;cursor:pointer">취소</button>
      <button id="alarm-save-btn" onclick="window._aitSaveAlarmSettings()"
        style="border:1px solid #1e3264;background:#1e3264;color:#fff;border-radius:6px;padding:7px 18px;font-size:12px;cursor:pointer;font-weight:600">저장</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  _alarmModalRenderList(_alarmReceivers);

  // 토글 thumb 위치 동기화 (CSS :checked 불가 → JS)
  const cb = document.getElementById('alarm-modal-toggle');
  const thumb = document.getElementById('alarm-modal-thumb');
  if (cb && thumb) {
    const sync = () => { thumb.style.transform = cb.checked ? 'translateX(20px)' : 'translateX(0)'; };
    sync();
    cb.addEventListener('change', sync);
  }
};

window._alarmAddEmail = function() {
  const input = document.getElementById('alarm-email-input');
  if (!input) return;
  const email = input.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    input.style.borderColor = '#ef4444'; setTimeout(() => { input.style.borderColor = '#d1d5db'; }, 1500); return;
  }
  if (_alarmReceivers.includes(email)) { input.value = ''; return; }
  _alarmReceivers.push(email);
  _alarmModalRenderList(_alarmReceivers);
  input.value = '';
};

window._aitSaveAlarmSettings = async function() {
  const btn = document.getElementById('alarm-save-btn');
  const cb  = document.getElementById('alarm-modal-toggle');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
  const enabled = cb ? cb.checked : _alarmEnabled;
  try {
    const res = await fetch(_ALARM_SETTINGS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...AIT_API.authHeaders() },
      body: JSON.stringify({ action: 'save', enabled, receivers: _alarmReceivers })
    });
    if (!res.ok) throw new Error('응답 오류');
    const data = await res.json();
    _alarmEnabled = !!data.immediate_enabled;
    _alarmUpdateBtn(_alarmEnabled);
    document.getElementById('alarm-settings-modal')?.remove();
    if (typeof showToast === 'function')
      showToast('알람 설정 저장 완료', 'success');
  } catch(e) {
    console.warn('[알람설정] 저장 실패', e);
    if (typeof showToast === 'function') showToast('알람 설정 저장 실패', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
};
