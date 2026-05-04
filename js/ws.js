function showProcess(num, el) {
  document.querySelectorAll('.proc-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');

  document.querySelectorAll('[id^="ws-step-list-"]').forEach(list => {
    list.style.display = (parseInt(list.id.replace('ws-step-list-', '')) === num) ? '' : 'none';
  });
  document.querySelectorAll('#ws-mgmt-tbody tr').forEach(r => {
    r.style.display = (parseInt(r.dataset.proc) === num) ? '' : 'none';
  });

  const lbl = document.getElementById('ws-proc-label');
  if (lbl) lbl.textContent = '공정 ' + num + ' 전체';
  const procNum = document.getElementById('ws-proc-num');
  if (procNum) procNum.textContent = num;

  // CP 테이블에서 해당 공정 정보 읽기
  // 공정흐름도 변환 여부에 따라 인덱스 분기 (변환 후: 0=번호,1=흐름도,2=공정명,3=설비명)
  const cpRows = [...document.querySelectorAll('#cp-tbody tr.cp-child')]
    .filter(tr => parseInt(tr.cells[0]?.textContent.trim()) === num);
  const isTransformed = cpRows[0]?.cells[1]?.classList.contains('cp-flow-cell');
  const nameIdx  = isTransformed ? 2 : 1;
  const equipIdx = isTransformed ? 3 : 2;
  const equips = [...new Set(cpRows.map(tr => tr.cells[equipIdx]?.textContent.trim()).filter(v => v && v !== 'MAIN' && v !== 'SUB' && !v.includes('외주')))];
  const info = {
    name:  cpRows[0]?.cells[nameIdx]?.textContent.trim() || '',
    equip: equips.join(', ')
  };
  document.querySelectorAll('#pane-ws [data-hdr]').forEach(c => {
    c.textContent = info[c.dataset.hdr] ?? '';
  });
  if (typeof window._wsOnProcChange === 'function') window._wsOnProcChange();
}

function _wsMediaLabel() {
  return `
    <label class="ws-add-photo edit-only">
      <span style="font-size:24px">📷</span>
      <span style="font-size:11px;color:var(--text3)">사진 / 동영상 선택</span>
      <input type="file" accept="image/*,video/*" style="display:none" onchange="wsLoadPhoto(this)">
    </label>`;
}

function addStep() {
  const list = [...document.querySelectorAll('[id^="ws-step-list-"]')].find(d => d.style.display !== 'none');
  if (!list) return;
  const num = list.querySelectorAll('.ws-step-item').length + 1;

  const item = document.createElement('div');
  item.className = 'ws-step-item';
  item.innerHTML = `
    <div class="ws-step-th">
      <span class="ws-step-num-badge">STEP ${num}</span>
      <span class="ws-step-name" contenteditable="false" style="display:none"></span>
      <input class="ws-step-name-input edit-only" type="text" placeholder="작업명 입력"
        style="background:rgba(255,255,255,.12);border:1px dashed rgba(255,255,255,.4);border-radius:4px;color:#fff;padding:3px 10px;font-size:13px;font-weight:600;min-width:180px;outline:none;font-family:inherit;flex:1"
        oninput="window._wsNameInput&&window._wsNameInput(this)">
      <button class="edit-only" onclick="wsDelStep(this)"
        style="margin-left:auto;width:24px;height:24px;border:none;background:rgba(255,255,255,.2);
               color:#fff;border-radius:4px;cursor:pointer;font-size:13px;flex-shrink:0;line-height:1">✕</button>
    </div>
    <div class="ws-step-body">
      <div class="ws-photo-cell">
        <div class="ws-photo-inner">${_wsMediaLabel()}</div>
      </div>
      <div class="ws-spec-cell">
        <div class="ws-step-spec" contenteditable="false"></div>
      </div>
    </div>`;

  list.appendChild(item);

  const hint = document.getElementById('ws-empty-hint');
  if (hint) hint.style.display = 'none';

  const pane = document.getElementById('pane-ws');
  if (pane && pane.classList.contains('edit-mode')) {
    item.querySelector('.ws-step-name').contentEditable = 'true';
    item.querySelector('.ws-step-spec').contentEditable = 'true';
  }

  // 새 step 선택 후 헤더 input에 포커스
  if (typeof _wsShowStep === 'function') {
    const newIdx = list.querySelectorAll('.ws-step-item').length - 1;
    _wsShowStep(newIdx);
    setTimeout(() => {
      const inp = document.getElementById('ws-curr-name-input');
      if (inp && inp.style.display !== 'none') inp.focus();
    }, 0);
  }
}

window._wsNameInput = function(input) {
  const nameEl = input.closest('.ws-step-th')?.querySelector('.ws-step-name');
  if (nameEl) nameEl.textContent = input.value;
  if (typeof _wsRenderThumb === 'function') _wsRenderThumb();
};

function wsDelStep(btn) {
  btn.closest('.ws-step-item').remove();
}

function wsLoadPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const inner = input.closest('.ws-photo-inner');
  const isVideo = file.type.startsWith('video/');

  if (file.size > 10 * 1024 * 1024 && !confirm(`파일 크기 ${(file.size/1024/1024).toFixed(1)}MB — 10MB 초과 파일은 업로드에 실패할 수 있습니다. 계속하시겠습니까?`)) {
    input.value = ''; return;
  }

  const delBtn = `<button class="edit-only" onclick="wsRemovePhoto(this)" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;line-height:1">✕</button>`;
  const uploadingBadge = `<div id="ws-upload-badge" style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:2px 7px;border-radius:10px">⏳ Drive 저장 중...</div>`;

  inner.style.position = 'relative';

  const r = new FileReader();
  r.onload = e => {
    const src = e.target.result;

    // 1. 즉시 base64로 표시 (낙관적 UI)
    inner.innerHTML = isVideo
      ? `<video src="${src}" controls style="width:100%;display:block;border-radius:4px;max-height:400px"></video>${delBtn}${uploadingBadge}`
      : `<img src="${src}" style="width:100%;height:auto;display:block;border-radius:4px" onclick="openPhoto(this)">${delBtn}${uploadingBadge}`;
    if (typeof _wsShowStep === 'function' && typeof _wsIdx !== 'undefined') _wsShowStep(_wsIdx);

    // 2. Drive 백그라운드 업로드
    if (typeof AIT_API !== 'undefined' && !AIT_API.MOCK) {
      const car = typeof getCurrentCar === 'function' ? getCurrentCar() : '';
      const procNum = document.getElementById('ws-proc-num')?.textContent.trim() || '';
      const stepIdx = typeof _wsIdx !== 'undefined' ? _wsIdx + 1 : 1;
      AIT_API.uploadWsPhoto({ car, proc: procNum, step: stepIdx, filename: file.name, base64: src })
        .then(res => {
          const fileId = res && res.fileId ? res.fileId : '';
          if (!fileId) throw new Error('fileId 없음');
          const url = AIT_API.driveUrl(fileId);
          const mediaEl = inner.querySelector('img, video');
          if (mediaEl) { mediaEl.src = url; mediaEl.dataset.fileId = fileId; }
          inner.querySelector('#ws-upload-badge')?.remove();
          if (typeof _wsShowStep === 'function' && typeof _wsIdx !== 'undefined') _wsShowStep(_wsIdx);
        })
        .catch(err => {
          console.warn('[WS] Drive 업로드 실패:', err.message || err);
          // base64를 DOM/localStorage에 남기지 않고 원래 상태로 복원
          inner.style.position = '';
          inner.innerHTML = _wsMediaLabel();
          if (typeof _wsShowStep === 'function' && typeof _wsIdx !== 'undefined') _wsShowStep(_wsIdx);
          alert('Drive 업로드 실패: 서버 연결을 확인하고 다시 시도해주세요.');
        });
    }
  };
  r.readAsDataURL(file);
  input.value = '';
}

function wsRemovePhoto(btn) {
  const inner = btn.closest('.ws-photo-inner');
  const mediaEl = inner.querySelector('img[data-file-id], video[data-file-id]');
  if (mediaEl && mediaEl.dataset.fileId && typeof AIT_API !== 'undefined' && !AIT_API.MOCK) {
    AIT_API.deleteWsPhoto(mediaEl.dataset.fileId).catch(e => console.warn('Drive 미디어 삭제 실패', e));
  }
  inner.style.position = '';
  inner.innerHTML = _wsMediaLabel();
}
