/* ── CP 관리계획서 전용 로직 ── */

/* ── CP 그룹 토글 / 유틸 ── */
function toggleCpGroup(gid) {
  const hd = document.querySelector(`.cp-group-hd[data-gid="${gid}"]`);
  const children = document.querySelectorAll(`.cp-child[data-gid="${gid}"]`);
  const opening = !hd.classList.contains('cp-grp-open');
  hd.classList.toggle('cp-grp-open', opening);
  children.forEach(tr => tr.classList.toggle('cp-open', opening));
}
function cpExpandAll(expand) {
  document.querySelectorAll('.cp-group-hd').forEach(hd => hd.classList.toggle('cp-grp-open', expand));
  document.querySelectorAll('.cp-child').forEach(tr => tr.classList.toggle('cp-open', expand));
}
function cpResetToDefault() {
  const pw = prompt('비밀번호를 입력하세요');
  if (pw !== 'ait1234') { alert('비밀번호가 올바르지 않습니다.'); return; }
  if (!confirm('CP 저장 데이터를 삭제하고 DB 원본으로 복원합니다.\n계속하시겠습니까?')) return;
  location.reload();
}
/* ── CP 컬럼 인덱스 자동 감지: cells[1]에 ● 포함 시 OLD 포맷 ── */
function _cpIdx(cells) {
  return { procNo:0, procNm:2, equip:3, cat:6, item:7, std:8, method:9, cycle:10, plan:11, owner:12, action:13, note:14 };
}

/* ── CP DB rows → 설비일상 구조 빌드 (단일 진실 소스) ── */
function _buildDailyFromCpRows(rows, linename) {
  const equipMap = {}, equipOrder = [];
  rows.forEach(r => {
    if (r.is_deleted) return;
    const plan = r.ctrl_method || '';
    if (!plan.includes('설비일상')) return;
    const equip = r.equip_name || '', procNo = String(r.proc_no || ''), procNm = r.proc_name || '';
    if (['수입검사','출하검사'].some(k => procNm.includes(k))) return;
    const itm = r.ctrl_item || '';
    if (!equip || !itm) return;
    if (!equipMap[equip]) {
      equipMap[equip] = { sheet: equip, proc_no: procNo, proc_name: procNm, location: linename, manager: '', items: [] };
      equipOrder.push(equip);
    }
    equipMap[equip].items.push({ no: String(equipMap[equip].items.length + 1), name: itm, std: r.standard || '', method: r.tool || '', cycle: r.sample_freq || '' });
  });
  return equipOrder.map(k => equipMap[k]);
}

/* ── CP DB rows → WS 관리항목 렌더 (단일 진실 소스) ── */
function _buildWsMgmtFromCpRows(rows, paneEl) {
  const seenProc = {}, procOrder = [];
  let mgmtHtml = '';
  const delBtn = `<td class="edit-only" style="padding:2px;text-align:center"><button onclick="this.closest('tr').remove()" style="width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="삭제">✕</button></td>`;
  const _n = v => (!v || v === 'null') ? '' : v;
  rows.forEach(r => {
    const procNo = String(r.proc_no || '');
    if (!procNo) return;
    const procNm = r.proc_name || '';
    if (['수입검사','출하검사'].some(k => procNm.includes(k))) return;
    if (!seenProc[procNo]) { seenProc[procNo] = 0; procOrder.push(Number(procNo)); }
    seenProc[procNo]++;
    const cat = _n(r.ctrl_category), item = _n(r.ctrl_item), std = _n(r.standard);
    const method = _n(r.tool), cycle = _n(r.sample_freq), plan = _n(r.ctrl_method);
    const action = _n(r.reaction_plan), note = _n(r.linked_doc);
    const isDaily = plan.includes('설비일상') || plan.includes('점검');
    const catColor = cat.includes('제품') ? '#1d4ed8' : '#15803d';
    mgmtHtml += `<tr data-proc="${procNo}" data-plan="${plan}"${isDaily ? ' class="daily-row"' : ''}>
      <td contenteditable="false" style="font-family:monospace;font-weight:700">${seenProc[procNo]}</td>
      <td contenteditable="false" style="color:${catColor};font-weight:600;font-size:11px">${cat}</td>
      <td contenteditable="false">${item}</td>
      <td contenteditable="false">${std}</td>
      <td contenteditable="false">${method}</td>
      <td contenteditable="false">${cycle}</td>
      <td contenteditable="false">${action}</td>
      <td contenteditable="false"${isDaily ? ' class="daily-badge"' : ''}>${note}</td>
      ${delBtn}</tr>`;
  });
  const tb = paneEl.querySelector('#ws-mgmt-tbody');
  if (tb) { tb.innerHTML = mgmtHtml; refreshMgmtRowColors(paneEl); }
  return procOrder.filter(Boolean);
}


const _N = '#1e3264';
function _smSt(v){ v=v.toUpperCase(); if(v.includes('MAIN')) return `color:${_N};font-weight:700`; if(v.includes('SUB')) return 'color:#6b7280;font-weight:600'; if(v.includes('외주')) return 'color:#b45309;font-weight:600'; return 'color:#9ca3af'; }
function _catSt(v){ if(v.includes('제품')) return `color:${_N};font-weight:600`; if(v.includes('공정')) return 'color:#6b7280;font-weight:600'; return 'color:#9ca3af'; }
function _planSt(v){ if(!v) return 'color:#9ca3af'; if(v.includes('작업표준서')||v.includes('작표')) return `color:${_N};font-weight:600`; if(v.includes('설비일상')||v.includes('점검')) return 'color:#16a34a;font-weight:600'; if(v.includes('QC')||v.includes('기준서')) return 'color:#f97316;font-weight:600'; if(v.includes('FMEA')||v.includes('SOP')) return 'color:#7c3aed;font-weight:600'; return 'color:#6b7280'; }
const _cpStyleMap = { 1:_smSt, 6:_catSt, 11:_planSt };
function initCpEventListeners() {
  const tbody = document.getElementById('cp-tbody');
  if (!tbody || tbody._cpListenerAttached) return;
  tbody._cpListenerAttached = true;
  tbody.addEventListener('input', function(e) {
    const td = e.target.closest('td[contenteditable]'); if (!td) return;
    const tr = td.closest('tr.cp-child');               if (!tr) return;
    const idx = Array.from(tr.cells).indexOf(td);
    const fn  = _cpStyleMap[idx];                       if (!fn) return;
    const txt = td.textContent.trim();
    let span = td.querySelector('span');
    if (!span) { span = document.createElement('span'); span.textContent = txt; td.innerHTML = ''; td.appendChild(span); }
    span.style.cssText = fn(txt);
  });

}

/* ── CP 편집 가능 토글 ── */
function setCpEditable(paneEl, on) {
  // 라인명 인라인 편집
  const linenameEl = paneEl.querySelector('#cp-meta-linename');
  if (linenameEl) {
    linenameEl.contentEditable = on ? 'true' : 'false';
    linenameEl.style.outline = on ? '1px dashed rgba(30,50,100,.4)' : '';
    linenameEl.style.borderRadius = on ? '3px' : '';
    linenameEl.style.padding = on ? '1px 4px' : '';
    linenameEl.style.cursor = on ? 'text' : '';
  }
  // 품번/품명 편집 가능 (구 doc header - 하위호환)
  ['#cp-doc-partno','#cp-doc-partname'].forEach(sel => {
    const el = paneEl.querySelector(sel);
    if (!el) return;
    el.contentEditable = on ? 'true' : 'false';
    el.style.outline = on ? '1px dashed rgba(30,50,100,.4)' : '';
    el.style.background = on ? '#fff' : '#f8f9fa';
    el.style.cursor = on ? 'text' : '';
  });
  // 그룹헤더 colspan: 편집모드=16(삭제열 포함), 뷰모드=15
  paneEl.querySelectorAll('#cp-tbody .cp-group-hd td[colspan]').forEach(td => {
    td.setAttribute('colspan', on ? 16 : 15);
  });
  paneEl.querySelectorAll('#cp-table tbody tr.cp-child').forEach(tr => {
    for (let i = 0; i <= 14; i++) {
      if (i === 1) continue; // 공정흐름도 셀 — 시각 전용, 편집 제외
      const td = tr.cells[i];
      if (!td) continue;
      td.contentEditable = on ? 'true' : 'false';
    }
  });
  // 그룹 헤더 공정번호·공정명도 편집 가능
  paneEl.querySelectorAll('.cp-gid-no, .cp-gid-name').forEach(span => {
    span.contentEditable = on ? 'true' : 'false';
    span.style.outline = on ? '1px dashed rgba(30,50,100,.4)' : '';
    span.style.borderRadius = on ? '3px' : '';
    span.style.padding = on ? '1px 4px' : '';
  });
  // 공정흐름도 편집모드 전환 (select 표시/숨김)
  refreshCpFlowEditMode(paneEl, on);
  // 편집 진입 시 전체 그룹 펼침
  if (on) {
    paneEl.querySelectorAll('.cp-group-hd').forEach(hd => hd.classList.add('cp-grp-open'));
    paneEl.querySelectorAll('.cp-child').forEach(tr => tr.classList.add('cp-open'));
    // 각 행에 복사 버튼 추가
    paneEl.querySelectorAll('#cp-table tbody tr.cp-child').forEach(tr => {
      const lastCell = tr.querySelector('.edit-only');
      if (lastCell && !lastCell.querySelector('.cp-copy-btn')) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'cp-copy-btn';
        copyBtn.title = '행 복사';
        copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
        copyBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:#e0f2fe;color:#0369a1;border-radius:5px;cursor:pointer';
        copyBtn.onclick = function() { copyCpRow(tr); };
        lastCell.insertBefore(copyBtn, lastCell.firstChild);
        lastCell.style.width = '36px';
        lastCell.style.verticalAlign = 'middle';
        lastCell.style.padding = '4px 2px';
        lastCell.style.textAlign = 'center';
        lastCell.style.display = 'flex';
        lastCell.style.flexDirection = 'column';
        lastCell.style.alignItems = 'center';
        lastCell.style.justifyContent = 'center';
        lastCell.style.gap = '3px';
      }
    });
    // 그룹 헤더에 공통입력 버튼 추가
    paneEl.querySelectorAll('.cp-group-hd').forEach(hd => {
      if (!hd.querySelector('.cp-autofill-btn')) {
        const btn = document.createElement('button');
        btn.className = 'cp-autofill-btn';
        btn.textContent = '↓ 공통입력';
        btn.style.cssText = 'margin-left:12px;background:rgba(255,255,255,.25);border:1px solid rgba(30,50,100,.3);color:#1e3264;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer;vertical-align:middle;font-weight:600';
        btn.onclick = function(e) { e.stopPropagation(); autofillCpGroup(hd.dataset.gid); };
        const td = hd.querySelector('td');
        if (td) td.appendChild(btn);
      }
    });
    initCpOrder(paneEl);
  } else {
    paneEl.querySelectorAll('.cp-copy-btn, .cp-autofill-btn').forEach(b => b.remove());
    destroyCpOrder(paneEl);
  }
}

/* ── CP 행 추가 → 모달 ── */
function addCpRow() { openCpAddModal(); }

/* ── CP 빈 행 일괄 삭제 ── */
function deleteEmptyCpRows() {
  const rows = document.querySelectorAll('#cp-tbody tr.cp-child');
  let count = 0;
  rows.forEach(tr => {
    const item = tr.cells[7]?.textContent.trim();
    if (!item) { tr.remove(); count++; }
  });
  if (count) alert(count + '개의 빈 행을 삭제했습니다.');
  else alert('삭제할 빈 행이 없습니다.');
}

function openCpAddModal() {
  const groups = [];
  document.querySelectorAll('#cp-tbody .cp-group-hd').forEach(hd => {
    const gid = hd.dataset.gid;
    const no = hd.querySelector('.cp-gid-no')?.textContent.trim() || '';
    const name = hd.querySelector('.cp-gid-name')?.textContent.trim() || '';
    const firstChild = document.querySelector(`.cp-child[data-gid="${gid}"]`);
    const equip = firstChild?.cells[3]?.textContent.trim() || '';  // 설비명 (col shifted)
    groups.push({ gid, no, name, equip });
  });
  const grpSel = document.getElementById('cpa-group');
  grpSel.innerHTML = '<option value="">-- 새 그룹 추가 --</option>' +
    groups.map(g => `<option value="${g.gid}" data-no="${g.no}" data-name="${g.name}" data-equip="${g.equip}">${g.no} — ${g.name}</option>`).join('');
  ['cpa-proc-no','cpa-proc-name','cpa-equip','cpa-item','cpa-spec','cpa-action','cpa-note','cpa-special','cpa-fpf'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['cpa-mainsub','cpa-cat','cpa-method','cpa-cycle','cpa-plan','cpa-owner'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  document.getElementById('cp-add-modal').classList.add('open');
}
function closeCpAddModal() { document.getElementById('cp-add-modal').classList.remove('open'); }
function onCpaGroupChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('cpa-proc-no').value  = opt.dataset.no    || '';
  document.getElementById('cpa-proc-name').value = opt.dataset.name  || '';
  document.getElementById('cpa-equip').value     = opt.dataset.equip || '';
}
function submitCpAddModal() {
  const g = id => document.getElementById(id)?.value.trim() || '';
  const procNo = g('cpa-proc-no'), procName = g('cpa-proc-name'), equip = g('cpa-equip');
  const mainsub = g('cpa-mainsub'), special = g('cpa-special'), fpf = g('cpa-fpf');
  const cat = g('cpa-cat'), item = g('cpa-item'), spec = g('cpa-spec');
  const method = g('cpa-method'), cycle = g('cpa-cycle'), plan = g('cpa-plan');
  const owner = g('cpa-owner'), action = g('cpa-action'), note = g('cpa-note');
  if (!item) { alert('관리항목을 입력하세요.'); return; }
  const msStyle  = mainsub==='MAIN'?'color:#1e3264;font-weight:700':mainsub==='SUB'?'color:#6b7280;font-weight:600':'color:#b45309;font-weight:600';
  const catStyle = cat==='제품'?'color:#1e3264;font-weight:600':'color:#6b7280;font-weight:600';
  const planStyle= plan.includes('작업표준서')||plan.includes('작표')?'color:#1e3264;font-weight:600':plan.includes('설비일상')?'color:#16a34a;font-weight:600':'color:#6b7280';
  const tbody = document.querySelector('#cp-tbody'); if (!tbody) { closeCpAddModal(); return; }
  tbody.querySelectorAll('tr:not(.cp-group-hd):not(.cp-child)').forEach(tr => tr.remove());
  const cpPane = document.getElementById('pane-cp');
  const _isEditMode = cpPane?.classList.contains('edit-mode') || false;
  const _ce = _isEditMode ? 'true' : 'false';

  const groupSel = document.getElementById('cpa-group');
  let targetGid = groupSel.value;
  let targetGroupHd = null; // 삽입 기준이 되는 그룹 헤더 요소 (직접 참조)

  if (!targetGid) {
    if (!procNo || !procName) { alert('새 그룹을 추가하려면 공정번호와 공정명을 입력하세요.'); return; }
    targetGid = 'cpg-' + procNo;
    const hd = document.createElement('tr');
    hd.className = 'cp-group-hd cp-grp-open';
    hd.setAttribute('data-gid', targetGid);
    hd.setAttribute('onclick', `toggleCpGroup('${targetGid}')`);
    hd.innerHTML = `<td colspan="16" style="background:#dce6f7;color:#1e3264;padding:8px 14px;font-weight:700;cursor:pointer;user-select:none;border-bottom:2px solid #b8ccec">
      <span class="cp-gid-no" onclick="event.stopPropagation()" style="font-size:16px;font-weight:800;margin-right:10px;color:#1e3264">${procNo}</span>
      <span class="cp-gid-name" onclick="event.stopPropagation()" style="font-size:13px;color:#1e3264">${procName}</span>
      <span class="cp-chevron" style="float:right;font-size:11px;display:inline-block;color:#1e3264">&#x25BC;</span>
      <button class="edit-only" onclick="event.stopPropagation();deleteCpGroup('${targetGid}')" style="float:right;margin-left:8px;background:#fee2e2;border:1px solid #fca5a5;color:#ef4444;border-radius:4px;padding:1px 8px;font-size:11px;cursor:pointer;font-weight:600;line-height:1.8" title="그룹 삭제">🗑 삭제</button>
    </td>`;
    tbody.appendChild(hd);
    _addCpOrderBtns(hd);
    targetGroupHd = hd; // 새로 만든 헤더를 직접 참조
  } else {
    targetGroupHd = tbody.querySelector(`.cp-group-hd[data-gid="${targetGid}"]`);
  }

  const tr = document.createElement('tr');
  tr.className = 'cp-child cp-open';
  tr.setAttribute('data-gid', targetGid);
  tr.style.background = '#fff';
  tr.innerHTML = `
    <td class="td-center td-mono" contenteditable="${_ce}">${procNo}</td>
    <td class="cp-flow-cell" data-ms="${mainsub}" style="padding:0;vertical-align:middle;text-align:center">${_cpFlowHtml(mainsub, _isEditMode)}</td>
    <td contenteditable="${_ce}">${procName}</td>
    <td contenteditable="${_ce}">${equip}</td>
    <td class="td-center" contenteditable="${_ce}">${special||'—'}</td>
    <td class="td-center" contenteditable="${_ce}">${fpf||'—'}</td>
    <td class="td-center" contenteditable="${_ce}"><span style="${catStyle}">${cat}</span></td>
    <td contenteditable="${_ce}">${item}</td>
    <td contenteditable="${_ce}">${spec}</td>
    <td class="td-center" contenteditable="${_ce}">${method}</td>
    <td class="td-center" contenteditable="${_ce}">${cycle}</td>
    <td contenteditable="${_ce}"><span style="${planStyle}">${plan}</span></td>
    <td class="td-center" contenteditable="${_ce}">${owner}</td>
    <td contenteditable="${_ce}">${action}</td>
    <td contenteditable="${_ce}">${note}</td>
    <td class="td-center edit-only" style="width:36px;padding:4px 2px;vertical-align:top">
      <button class="cp-copy-btn" title="행 복사" style="display:block;width:28px;height:28px;border:none;background:#e0f2fe;color:#0369a1;border-radius:5px;cursor:pointer;font-size:13px;line-height:1;margin-bottom:2px">⎘</button>
      <button onclick="this.closest('tr').remove()" style="display:block;width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="행 삭제">✕</button>
    </td>`;
  tr.querySelector('.cp-copy-btn').onclick = function() { copyCpRow(tr); };

  // 대상 헤더의 직접 자식만 DOM 위치 기반으로 조회 → gid 중복 시에도 정확히 동작
  const directChildren = targetGroupHd ? _getGroupDirectChildren(targetGroupHd) : [];
  const lastDirect = directChildren[directChildren.length - 1];
  if (lastDirect) {
    if (lastDirect.nextSibling) tbody.insertBefore(tr, lastDirect.nextSibling);
    else tbody.appendChild(tr);
  } else if (targetGroupHd?.nextSibling) {
    tbody.insertBefore(tr, targetGroupHd.nextSibling);
  } else {
    tbody.appendChild(tr);
  }

  tr.scrollIntoView({ block: 'nearest' });
  if (cpPane) initCpFlowDiagram(cpPane);
  closeCpAddModal();
}

function copyCpRow(tr) {
  const clone = tr.cloneNode(true);
  clone.removeAttribute('data-db-id'); // 복사본은 새 행으로 처리
  const lastCell = clone.querySelector('.edit-only');
  if (lastCell) {
    lastCell.style.cssText = 'width:36px;padding:4px 2px;vertical-align:top;text-align:center';
    lastCell.innerHTML = `
      <button class="cp-copy-btn" title="행 복사" style="display:block;width:28px;height:28px;border:none;background:#e0f2fe;color:#0369a1;border-radius:5px;cursor:pointer;font-size:13px;line-height:1;margin-bottom:2px">⎘</button>
      <button onclick="this.closest('tr').remove()" style="display:block;width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="행 삭제">✕</button>`;
    clone.querySelector('.cp-copy-btn').onclick = function() { copyCpRow(clone); };
  }
  tr.parentNode.insertBefore(clone, tr.nextSibling);
  clone.scrollIntoView({ block: 'nearest' });
}

function autofillCpGroup(gid) {
  const hd = document.querySelector(`.cp-group-hd[data-gid="${gid}"]`);
  const children = document.querySelectorAll(`.cp-child[data-gid="${gid}"]`);
  if (children.length < 2) { alert('그룹에 행이 1개뿐입니다.'); return; }
  // 공정번호·공정명은 그룹 헤더 편집값 우선 (cp-gid-no / cp-gid-name)
  const no = hd?.querySelector('.cp-gid-no')?.textContent.trim()   || children[0].cells[0]?.textContent.trim();
  const nm = hd?.querySelector('.cp-gid-name')?.textContent.trim() || children[0].cells[2]?.textContent.trim();
  if (!confirm(`공정번호 "${no}", 공정명 "${nm}"\n이 값을 그룹 내 모든 행에 적용하시겠습니까?`)) return;
  children.forEach(tr => {
    if (tr.cells[0]) tr.cells[0].textContent = no;
    if (tr.cells[2]) tr.cells[2].textContent = nm;
  });
}

/* ── CP DB CRUD 저장 ── */
async function _saveCpToDb(carName, paneEl) {
  // 안정적인 carId(행 id) 우선 사용 — 이름 변경 후에도 깨지지 않음
  let carId = window.currentCarId;
  if (!carId) {
    const cars = await AIT_API.getCars();
    const found = cars.find(c => c.code === carName || c.name === carName);
    if (!found) throw new Error('차종을 찾을 수 없습니다: ' + carName);
    carId = found.id;
  }

  const dbRows = await AIT_API.getCpRows(carId);
  const dbIds = new Set(dbRows.filter(r => !r.is_deleted).map(r => r.id));

  const domRows = [...paneEl.querySelectorAll('#cp-tbody tr.cp-child')];
  const domDbIds = new Set();
  const saves = [];

  // proc_no 변경 감지: 그룹 dbId 기반 (▲▼ 이동 후 번호 수동변경 감지)
  const _toInt = v => parseInt(v) || 0;
  const oldProcNoByDbId = new Map(dbRows.map(r => [_toInt(r.id), _toInt(r.proc_no)]));
  const procNoSwaps = [];
  const _seenFromNos = new Set();

  const _cv = s => { const v = (s || '').trim(); return (v && v !== 'null') ? v : null; };
  domRows.forEach((tr, idx) => {
    const cells = tr.cells;
    const flowRaw = (cells[1]?.dataset?.ms || cells[1]?.textContent.trim() || '').toUpperCase();
    const dbId = tr.dataset.dbId ? parseInt(tr.dataset.dbId) : null;
    const data = {
      proc_no:      _cv(cells[0]?.textContent),
      flow_main:    flowRaw.includes('MAIN') ? 1 : 0,
      flow_sub:     flowRaw === 'SUB'         ? 1 : 0,
      flow_outsource: flowRaw.includes('외주') ? 1 : 0,
      proc_name:    _cv(cells[2]?.textContent),
      equip_name:   _cv(cells[3]?.textContent),
      char_special: _cv(cells[4]?.textContent),
      char_general: _cv(cells[5]?.textContent),
      ctrl_category:_cv(cells[6]?.textContent),
      ctrl_item:    _cv(cells[7]?.textContent),
      standard:     _cv(cells[8]?.textContent),
      tool:         _cv(cells[9]?.textContent),
      sample_freq:  _cv(cells[10]?.textContent),
      ctrl_method:  _cv(cells[11]?.textContent),
      owner:        _cv(cells[12]?.textContent),
      reaction_plan:_cv(cells[13]?.textContent),
      linked_doc:   _cv(cells[14]?.textContent),
      sort_order:   idx,
      is_deleted:   0
    };
    if (dbId) {
      const oldNo = oldProcNoByDbId.get(dbId) || 0;
      const newNo = _toInt(cells[0]?.textContent.trim());
      if (oldNo && newNo && oldNo !== newNo && !_seenFromNos.has(oldNo)) {
        _seenFromNos.add(oldNo);
        procNoSwaps.push({ from: oldNo, to: newNo });
      }
      domDbIds.add(dbId);
      saves.push(() => AIT_API.updateCpRow(dbId, data));
    } else {
      saves.push(() => AIT_API.createCpRow(carId, data).then(res => {
        const r = Array.isArray(res) ? res[0] : res;
        if (r?.id) tr.dataset.dbId = String(r.id);
      }));
    }
  });

  const deletes = [...dbIds].filter(id => !domDbIds.has(id))
    .map(id => () => AIT_API.deleteCpRow(id));

  await _batchRun([...saves, ...deletes], 3);
  if (!AIT_API.MOCK && procNoSwaps.length > 0) {
    await AIT_API.swapWsProcNos(carId, procNoSwaps).catch(e => console.warn('ws proc_no sync 실패:', e));
  }
  return `${saves.length}개 저장, ${deletes.length}개 삭제`;
}

/* ── CP 메타 캐시 ── */
function _cpMetaGet(car) {
  return (window._cpMetaCache && window._cpMetaCache[car]) || {};
}
function _cpMetaSet(car, meta) {
  window._cpMetaCache = window._cpMetaCache || {};
  window._cpMetaCache[car] = meta;
}

function _syncCarMetaToLocal(carObj) {
  const name = carObj.name;
  _cpMetaSet(name, {
    stage:    carObj.stage    || '시작',
    partno:   carObj.partno   || '',
    partname: carObj.partname || '',
    linename: carObj.linename || ''
  });
  window._cftCache = window._cftCache || {};
  if (carObj.cft) {
    try { window._cftCache[name] = typeof carObj.cft === 'string' ? JSON.parse(carObj.cft) : carObj.cft; } catch {}
  } else {
    try { const s = localStorage.getItem(`ait_cft_${name}`); if (s) window._cftCache[name] = JSON.parse(s); } catch {}
  }
}

function _updateCarCache(id, fields) {
  const cars = JSON.parse(localStorage.getItem('ait_cars') || '[]');
  const idx = cars.findIndex(c => c.id == id);
  if (idx >= 0) { Object.assign(cars[idx], fields); localStorage.setItem('ait_cars', JSON.stringify(cars)); }
}

function _saveCftToDb(car, cft) {
  window._cftCache = window._cftCache || {};
  window._cftCache[car] = cft;
  const cftJson = JSON.stringify(cft);
  try { localStorage.setItem(`ait_cft_${car}`, cftJson); } catch {}
  if (AIT_API.MOCK || !window.currentCarId) return;
  AIT_API.updateCar(window.currentCarId, { cft: cftJson })
    .then(() => _updateCarCache(window.currentCarId, { cft: cftJson }))
    .catch(e => console.warn('CFT DB 저장 실패', e));
}

/* ── CP 메타바 ── */
function initCpMeta(paneEl, car) {
  const meta = _cpMetaGet(car);
  const modelEl = paneEl.querySelector('#cp-meta-model');
  const pnoEl   = paneEl.querySelector('#cp-meta-partno');
  const pnmEl   = paneEl.querySelector('#cp-meta-partname');
  if (modelEl) modelEl.textContent = meta.carmodel || car;
  if (pnoEl)   pnoEl.textContent   = meta.partno   || '';
  if (pnmEl)   pnmEl.textContent   = meta.partname || '';
  const linenameEl = paneEl.querySelector('#cp-meta-linename');
  if (linenameEl) linenameEl.textContent = meta.linename || '';
  const stage = meta.stage || '시작';
  const stageStart = paneEl.querySelector('#cp-stage-start');
  const stageMass  = paneEl.querySelector('#cp-stage-mass');
  if (stageStart) stageStart.checked = (stage === '시작');
  if (stageMass)  stageMass.checked  = (stage === '양산');
  const stageView = paneEl.querySelector('#cp-stage-view');
  if (stageView) stageView.textContent = stage;
  const cft = (window._cftCache && window._cftCache[car]) || [];
  _renderCftInline(cft);
}

function openPartModal() {
  const car = getCurrentCar();
  const meta = _cpMetaGet(car);
  document.getElementById('part-modal-carmodel').value = meta.carmodel || car || '';
  document.getElementById('part-modal-partno').value   = meta.partno   || '';
  document.getElementById('part-modal-partname').value = meta.partname || '';
  document.getElementById('part-modal').classList.add('open');
  document.getElementById('part-modal-carmodel').focus();
}
function closePartModal() {
  document.getElementById('part-modal').classList.remove('open');
}
function savePartModal() {
  const carmodel = document.getElementById('part-modal-carmodel').value.trim();
  const partno   = document.getElementById('part-modal-partno').value.trim();
  const partname = document.getElementById('part-modal-partname').value.trim();
  const car = getCurrentCar();
  const meta = _cpMetaGet(car);
  meta.carmodel = carmodel;
  meta.partno   = partno;
  meta.partname = partname;
  _cpMetaSet(car, meta);
  if (!AIT_API.MOCK && window.currentCarId) {
    AIT_API.updateCar(window.currentCarId, { carmodel, partno, partname })
      .then(() => _updateCarCache(window.currentCarId, { carmodel, partno, partname }))
      .catch(e => console.warn('차종/품번/품명 DB 저장 실패', e));
  }
  // 메타바 표시 갱신
  const mdl = document.getElementById('cp-meta-model');
  const pno = document.getElementById('cp-meta-partno');
  const pnm = document.getElementById('cp-meta-partname');
  if (mdl) mdl.textContent = carmodel;
  if (pno) pno.textContent = partno;
  if (pnm) pnm.textContent = partname;
  // ws 헤더 실시간 반영
  const wsPn  = document.getElementById('ws-pn');
  const wsPnm = document.getElementById('ws-pname');
  if (wsPn)  wsPn.textContent  = partno;
  if (wsPnm) wsPnm.textContent = partname;
  // 공정검사기준서 품번/품명 실시간 반영
  if (typeof window._inspRefreshPart === 'function') window._inspRefreshPart();
  closePartModal();
}

function saveCpMetaOnChange() {
  const car = getCurrentCar();
  const paneEl = document.getElementById('pane-cp');
  if (!paneEl) return;
  const stageMass = paneEl.querySelector('#cp-stage-mass');
  const stage = stageMass?.checked ? '양산' : '시작';
  const partno   = paneEl.querySelector('#cp-meta-partno')?.textContent.trim()  || '';
  const partname = paneEl.querySelector('#cp-meta-partname')?.textContent.trim() || '';
  const linename = paneEl.querySelector('#cp-meta-linename')?.textContent.trim() || '';
  _cpMetaSet(car, { stage, partno, partname, linename });
  if (!AIT_API.MOCK && window.currentCarId) {
    const upd = { stage, partno, partname, linename };
    AIT_API.updateCar(window.currentCarId, upd)
      .then(() => _updateCarCache(window.currentCarId, upd))
      .catch(e => console.warn('메타 DB 저장 실패', e));
  }
  const stageView = paneEl.querySelector('#cp-stage-view');
  if (stageView) stageView.textContent = stage;
  // ws 헤더 실시간 반영
  const wsPn   = document.getElementById('ws-pn');
  const wsPnm  = document.getElementById('ws-pname');
  if (wsPn)  wsPn.textContent  = partno;
  if (wsPnm) wsPnm.textContent = partname;
}

function openCftModal() {
  const car = getCurrentCar();
  const cft = (window._cftCache && window._cftCache[car]) || [];
  _renderCftList(cft);
  document.getElementById('cft-modal').classList.add('open');
}
function closeCftModal() {
  document.getElementById('cft-modal').classList.remove('open');
  document.getElementById('cft-role-input').value = '';
  document.getElementById('cft-name-input').value = '';
}
function _renderCftInline(cft) {
  const el = document.getElementById('cp-cft-inline');
  if (!el) return;
  if (!cft.length) { el.textContent = '미등록'; el.style.color = '#9ca3af'; return; }
  el.style.color = '#1e3264';
  el.textContent = cft.map(m => `${m.role} ${m.name}`).join(' · ');
}
function _renderCftList(cft) {
  const list = document.getElementById('cft-list');
  if (!list) return;
  if (!cft.length) { list.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:4px 0">등록된 CFT 멤버가 없습니다.</div>'; return; }
  list.innerHTML = cft.map((m, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f3f4f6">
      <span style="background:#edf3ff;color:#1e3264;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;min-width:60px;text-align:center">${m.role}</span>
      <span style="flex:1;font-size:12px">${m.name}</span>
      <button onclick="_deleteCftMember(${i})" style="width:22px;height:22px;border:none;background:#fee2e2;color:#ef4444;border-radius:4px;cursor:pointer;font-size:12px;line-height:1">✕</button>
    </div>`).join('');
}
function addCftMember() {
  const role = document.getElementById('cft-role-input').value.trim();
  const name = document.getElementById('cft-name-input').value.trim();
  if (!role || !name) { alert('역할과 이름을 모두 입력하세요.'); return; }
  const car = getCurrentCar();
  window._cftCache = window._cftCache || {};
  const cft = (window._cftCache[car] || []).slice();
  cft.push({ role, name });
  _saveCftToDb(car, cft);
  _renderCftList(cft);
  _renderCftInline(cft);
  document.getElementById('cft-role-input').value = '';
  document.getElementById('cft-name-input').value = '';
  document.getElementById('cft-name-input').focus();
}
function _deleteCftMember(idx) {
  const car = getCurrentCar();
  window._cftCache = window._cftCache || {};
  const cft = (window._cftCache[car] || []).slice();
  cft.splice(idx, 1);
  _saveCftToDb(car, cft);
  _renderCftList(cft);
  _renderCftInline(cft);
}

/* ── CP 공정흐름도 변환 ── */
function _cpFlowHtml(raw, editMode) {
  const val = (raw || '').toUpperCase();
  const isSub  = val === 'SUB';
  const isOut  = val.includes('외주');
  const isMain = !isSub && !isOut;
  const dot = (active) => `<div style="text-align:center;font-size:15px;line-height:1;color:${active?'#1e3264':'transparent'}">●</div>`;
  const lanes = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;justify-items:center;text-align:center;width:100%">${dot(isSub)}${dot(isMain)}${dot(isOut)}</div>`;
  if (!editMode) return lanes;
  const sel = `<select onchange="window._cpFlowChange(this)" style="font-size:10px;padding:1px 2px;border:1px solid #b8ccec;border-radius:3px;background:#fff;color:#1e3264;width:100%;margin-top:3px">
    <option value="MAIN"${isMain?' selected':''}>MAIN</option>
    <option value="SUB"${isSub?' selected':''}>SUB</option>
    <option value="외주"${isOut?' selected':''}>외주</option>
  </select>`;
  return `<div style="padding:2px 2px 3px">${lanes}${sel}</div>`;
}
window._cpFlowChange = function(sel) {
  const cell = sel.closest('.cp-flow-cell');
  if (!cell) return;
  const raw = sel.value;
  cell.dataset.ms = raw;
  const paneEl = document.getElementById('pane-cp');
  const inEdit = paneEl?.classList.contains('edit-mode');
  cell.innerHTML = _cpFlowHtml(raw, inEdit);
};
function initCpFlowDiagram(paneEl) {
  const inEdit = paneEl.classList.contains('edit-mode');
  paneEl.querySelectorAll('#cp-tbody tr.cp-child').forEach(tr => {
    // 이미 변환된 행 → 편집모드 표시만 갱신
    if (tr.cells[1]?.classList.contains('cp-flow-cell')) {
      tr.cells[1].innerHTML = _cpFlowHtml(tr.cells[1].dataset.ms || 'MAIN', inEdit);
      return;
    }
    // 미변환 행 — cells[1]이 MAIN/SUB
    const msCell = tr.cells[1];
    if (!msCell) return;
    const raw = (msCell.querySelector('span')?.textContent.trim() || msCell.textContent.trim());
    const flowTd = document.createElement('td');
    flowTd.className = 'cp-flow-cell';
    flowTd.style.cssText = 'padding:0;vertical-align:middle;text-align:center';
    flowTd.dataset.ms = raw;
    flowTd.innerHTML = _cpFlowHtml(raw, inEdit);
    tr.insertBefore(flowTd, tr.cells[1]); // position 1에 삽입
    tr.deleteCell(2);                      // 원래 MAIN/SUB (now idx 2) 제거
  });
}
function refreshCpFlowEditMode(paneEl, on) {
  paneEl.querySelectorAll('#cp-tbody tr.cp-child .cp-flow-cell').forEach(cell => {
    cell.innerHTML = _cpFlowHtml(cell.dataset.ms || 'MAIN', on);
  });
}

/* ── CP 문서 헤더 초기화 (품번/품명 복원 + 공정번호/공정명/설비명 매핑) ── */
function initCpDocHeader(paneEl, car) {
  const meta = _cpMetaGet(car);
  const pno  = paneEl.querySelector('#cp-doc-partno');
  const pnm  = paneEl.querySelector('#cp-doc-partname');
  if (pno) pno.textContent  = meta.partno   || '';
  if (pnm) pnm.textContent  = meta.partname || '';
  const firstRow = paneEl.querySelector('#cp-tbody tr.cp-child');
  if (firstRow && firstRow.cells.length > 2) {
    const procnoEl  = paneEl.querySelector('#cp-doc-procno');
    const procnmEl  = paneEl.querySelector('#cp-doc-procname');
    const equipEl   = paneEl.querySelector('#cp-doc-equip');
    if (procnoEl) procnoEl.textContent = firstRow.cells[0].textContent.trim();
    if (procnmEl) procnmEl.textContent = firstRow.cells[2].textContent.trim();
    if (equipEl)  equipEl.textContent  = firstRow.cells[3].textContent.trim();
  }
}

/* ── DB에서 CP 행을 불러와 tbody HTML 생성 ── */
async function _buildCpHtmlFromDb(car) {
  try {
    // window.currentCarId 직접 사용 (getCars() 추가 호출 제거 → 로딩 속도 개선)
    const carId = window.currentCarId;
    if (!carId) return null;
    const rows = await AIT_API.getCpRows(carId);
    if (!rows || !rows.length) return null;

    const groups = {}, groupOrder = [];
    rows.forEach(r => {
      const key = String(r.proc_no || '0');
      if (!groups[key]) { groups[key] = { proc_no: r.proc_no, proc_name: r.proc_name, rows: [] }; groupOrder.push(key); }
      groups[key].rows.push(r);
    });

    let html = '';
    groupOrder.forEach(key => {
      const g = groups[key];
      const gid = 'cpg-' + (g.proc_no || key);
      html += `<tr class="cp-group-hd cp-grp-open" data-gid="${gid}" onclick="toggleCpGroup('${gid}')">
        <td colspan="16" style="background:#dce6f7;color:#1e3264;padding:8px 14px;font-weight:700;cursor:pointer;user-select:none;border-bottom:2px solid #b8ccec">
          <span class="cp-gid-no" onclick="event.stopPropagation()" style="font-size:16px;font-weight:800;margin-right:10px;color:#1e3264">${g.proc_no || ''}</span>
          <span class="cp-gid-name" onclick="event.stopPropagation()" style="font-size:13px;color:#1e3264">${g.proc_name || ''}</span>
          <span class="cp-chevron" style="float:right;font-size:11px;color:#1e3264">&#x25BC;</span>
          <button class="edit-only" onclick="event.stopPropagation();deleteCpGroup('${gid}')" style="float:right;margin-left:8px;background:#fee2e2;border:1px solid #fca5a5;color:#ef4444;border-radius:4px;padding:1px 8px;font-size:11px;cursor:pointer;font-weight:600;line-height:1.8" title="그룹 삭제">🗑 삭제</button>
        </td></tr>`;
      const _n = v => (!v || v === 'null') ? '' : v;
      g.rows.forEach(r => {
        const ms = r.flow_main ? 'MAIN' : r.flow_sub ? 'SUB' : r.flow_outsource ? '외주' : 'MAIN';
        const msStyle = ms==='MAIN'?'color:#1e3264;font-weight:700':ms==='SUB'?'color:#6b7280;font-weight:600':'color:#b45309;font-weight:600';
        const catStyle = _n(r.ctrl_category).includes('제품')?'color:#1e3264;font-weight:600':'color:#6b7280;font-weight:600';
        const plan = _n(r.ctrl_method);
        const planStyle = plan.includes('작업표준서')||plan.includes('작표')?'color:#1e3264;font-weight:600':plan.includes('설비일상')||plan.includes('점검')?'color:#16a34a;font-weight:600':'color:#6b7280';
        html += `<tr class="cp-child cp-open" data-gid="${gid}" data-db-id="${r.id}" style="background:#fff">
          <td class="td-center td-mono" contenteditable="false">${_n(r.proc_no)}</td>
          <td class="cp-flow-cell" data-ms="${ms}" style="padding:0;vertical-align:middle;text-align:center">${_cpFlowHtml(ms,false)}</td>
          <td contenteditable="false">${_n(r.proc_name)}</td>
          <td contenteditable="false">${_n(r.equip_name)}</td>
          <td class="td-center" contenteditable="false">${_n(r.char_special)||'—'}</td>
          <td class="td-center" contenteditable="false">${_n(r.char_general)||'—'}</td>
          <td class="td-center" contenteditable="false"><span style="${catStyle}">${_n(r.ctrl_category)}</span></td>
          <td contenteditable="false">${_n(r.ctrl_item)}</td>
          <td contenteditable="false">${_n(r.standard)}</td>
          <td class="td-center" contenteditable="false">${_n(r.tool)}</td>
          <td class="td-center" contenteditable="false">${_n(r.sample_freq)}</td>
          <td contenteditable="false"><span style="${planStyle}">${plan}</span></td>
          <td class="td-center" contenteditable="false">${_n(r.owner)}</td>
          <td contenteditable="false">${_n(r.reaction_plan)}</td>
          <td contenteditable="false">${_n(r.linked_doc)}</td>
          <td class="td-center edit-only" style="width:36px;padding:4px 2px;vertical-align:top">
            <button onclick="this.closest('tr').remove()" style="display:block;width:28px;height:28px;border:none;background:#fee2e2;color:#ef4444;border-radius:5px;cursor:pointer;font-size:14px;font-weight:700;line-height:1" title="행 삭제">✕</button>
          </td></tr>`;
      });
    });
    return html;
  } catch(e) {
    console.warn('DB CP 로드 실패:', e);
    return null;
  }
}

/* ── CP 그룹 순서 변경 버튼 ▲▼ (편집 모드 전용) ── */

/* 헤더 바로 다음에 붙어있는 cp-child 행들만 DOM 위치 기반으로 수집 */
function _getGroupDirectChildren(hdEl) {
  const children = [];
  let next = hdEl.nextSibling;
  while (next && !next.classList?.contains('cp-group-hd')) {
    if (next.classList?.contains('cp-child')) children.push(next);
    next = next.nextSibling;
  }
  return children;
}

function _addCpOrderBtns(hd) {
  if (hd.querySelector('.cp-order-btn')) return;
  const td = hd.querySelector('td');
  if (!td) return;
  const wrap = document.createElement('span');
  wrap.className = 'cp-order-btn';
  wrap.style.cssText = 'display:inline-flex;gap:2px;margin-right:8px;vertical-align:middle';
  // gid 문자열 대신 DOM 요소 참조를 직접 전달 → 같은 gid 중복 헤더가 있어도 정확히 동작
  wrap.innerHTML =
    `<button onclick="event.stopPropagation();moveCpGroupUp(this.closest('tr'))"
       style="width:22px;height:22px;border:1px solid #b8ccec;background:#fff;color:#1e3264;border-radius:3px;cursor:pointer;font-size:11px;line-height:1;padding:0" title="위로">▲</button>` +
    `<button onclick="event.stopPropagation();moveCpGroupDown(this.closest('tr'))"
       style="width:22px;height:22px;border:1px solid #b8ccec;background:#fff;color:#1e3264;border-radius:3px;cursor:pointer;font-size:11px;line-height:1;padding:0" title="아래로">▼</button>`;
  td.insertBefore(wrap, td.firstChild);
}

function initCpOrder(paneEl) {
  paneEl.querySelectorAll('#cp-tbody .cp-group-hd').forEach(hd => _addCpOrderBtns(hd));
}

function destroyCpOrder(paneEl) {
  paneEl.querySelectorAll('#cp-tbody .cp-order-btn').forEach(el => el.remove());
}

function moveCpGroupUp(hdEl) {
  const tbody = document.querySelector('#cp-tbody');
  if (!tbody) return;
  const allHds = [...tbody.querySelectorAll('.cp-group-hd')];
  const idx = allHds.indexOf(hdEl);
  if (idx <= 0) return;
  _cpMoveGroup(hdEl, allHds[idx - 1]);
}

function moveCpGroupDown(hdEl) {
  const tbody = document.querySelector('#cp-tbody');
  if (!tbody) return;
  const allHds = [...tbody.querySelectorAll('.cp-group-hd')];
  const idx = allHds.indexOf(hdEl);
  if (idx < 0 || idx >= allHds.length - 1) return;
  _cpMoveGroup(allHds[idx + 1], hdEl);
}

function deleteCpGroup(gid) {
  const hd = document.querySelector(`.cp-group-hd[data-gid="${gid}"]`);
  if (!hd) return;
  const children = _getGroupDirectChildren(hd);
  const no = hd.querySelector('.cp-gid-no')?.textContent.trim() || '';
  if (!confirm(`공정번호 "${no}" 그룹과 하위 ${children.length}개 행을 모두 삭제하시겠습니까?\n저장 버튼을 눌러야 DB에 반영됩니다.`)) return;
  children.forEach(tr => tr.remove());
  hd.remove();
}

/* fromHd 그룹을 toHd 바로 앞으로 이동 — 요소 참조 직접 사용 */
function _cpMoveGroup(fromHd, toHd) {
  if (!fromHd || !toHd) return;
  const tbody = fromHd.closest('tbody') || document.querySelector('#cp-tbody');
  const fromChildren = _getGroupDirectChildren(fromHd);
  fromHd.remove();
  fromChildren.forEach(tr => tr.remove());
  tbody.insertBefore(fromHd, toHd);
  fromChildren.forEach(tr => tbody.insertBefore(tr, toHd));
}
