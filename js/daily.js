function openDetail(pane, day, card) {
  // 기존 선택 해제
  document.querySelectorAll(`#pane-${pane} .day-card`).forEach(c => c.classList.remove('day-selected'));
  card.classList.add('day-selected');
  const panel = document.getElementById('detail-' + pane);
  panel.classList.add('open');
  // 날짜 타이틀 업데이트
  const dowArr = ['','월','화','수','목','금','토','일'];
  // April 2026: day 1 = Wed(3), offset = 2
  const dow = dowArr[((day + 1) % 7) + 1] || '';
  const titleEl = panel.querySelector('.detail-title');
  if (titleEl) titleEl.textContent = `4월 ${day}일 점검 입력`;
  panel.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function closeDetail(pane) {
  document.getElementById('detail-' + pane).classList.remove('open');
  document.querySelectorAll(`#pane-${pane} .day-card`).forEach(c => c.classList.remove('day-selected'));
}

function cycleResultBtn(btn, pane) {
  const cycle = ['', '○', '✕', 'N'];
  const classMap = {'○':'rb-ok','✕':'rb-ng','N':'rb-n'};
  const cur = btn.textContent.trim();
  const idx = cycle.indexOf(cur);
  const next = cycle[(idx + 1) % cycle.length];
  btn.textContent = next || '—';
  btn.classList.remove('rb-ok','rb-ng','rb-n','rb-num');
  if (next && classMap[next]) btn.classList.add(classMap[next]);
  // 이상 발생 시 이상내용 영역 표시/숨김
  const panel = btn.closest('.detail-panel');
  if (panel) {
    const abnArea = panel.querySelector('.abnormal-area');
    if (abnArea) {
      const hasNg = panel.querySelector('.rb-ng');
      abnArea.style.display = hasNg ? 'flex' : 'none';
    }
  }
}
