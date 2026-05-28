// ── 한→영 번역 (Google Translate 비공식 API, 무료/키 불필요) ──────────────────
async function _gtTranslate(text) {
  if (!text || !/[가-힣]/.test(text)) return text;
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=' + encodeURIComponent(text);
    const res  = await fetch(url);
    const data = await res.json();
    return (data[0] || []).map(x => x[0]).join('').trim() || text;
  } catch(e) { return text; }
}

async function _translateRows(rows) {
  const safe = v => (!v || v === 'null') ? '' : String(v);
  const FIELDS = ['proc_name','equip_name','ctrl_item','standard','tool','sample_freq','ctrl_method','owner','reaction_plan','linked_doc'];

  // 유니크 한국어 텍스트 수집
  const unique = new Set();
  for (const row of rows) {
    for (const f of FIELDS) {
      const v = safe(row[f]);
      if (v && /[가-힣]/.test(v)) unique.add(v);
    }
  }

  // 개별 번역 (dedup으로 실제 호출 수 최소화)
  const map = {};
  for (const text of unique) {
    map[text] = await _gtTranslate(text);
  }

  // rows에 번역 적용
  return rows.map(row => {
    const r = { ...row };
    for (const f of FIELDS) {
      const v = safe(r[f]);
      if (map[v]) r[f] = map[v];
    }
    return r;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
window.print_cp_gentex = async function() {
  const paneEl   = document.getElementById('pane-cp');
  const carSel   = document.getElementById('car-sel');
  const carName  = carSel?.options[carSel?.selectedIndex]?.text || '';
  const carId    = window.currentCarId;
  const cpMeta   = typeof _cpMetaGet === 'function' ? (_cpMetaGet(carName) || {}) : {};

  const stage    = paneEl?.querySelector('#cp-stage-view')?.textContent.trim()    || cpMeta.stage    || '양산';
  const carmodel = paneEl?.querySelector('#cp-meta-model')?.textContent.trim()    || carName;
  const partno   = paneEl?.querySelector('#cp-meta-partno')?.textContent.trim()   || cpMeta.partno   || '';
  const partname = paneEl?.querySelector('#cp-meta-partname')?.textContent.trim() || cpMeta.partname || '';
  const revBadge = paneEl?.querySelector('#cp-rev-badge')?.textContent || '';
  const revNum   = parseInt(revBadge.replace(/[^0-9]/g, '')) || 0;

  // ── 로딩 팝업 먼저 열기 ────────────────────────────────────────────────────
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) { alert('팝업 차단을 해제해주세요.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>CONTROL PLAN - ${carName}</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8">
    <div style="text-align:center;color:#1e3264">
      <div style="font-size:28px;margin-bottom:12px">⏳</div>
      <div style="font-size:16px;font-weight:700">Translating to English...</div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px">잠시 기다려주세요</div>
    </div></body></html>`);
  win.document.close();

  // ── DB 페치 ────────────────────────────────────────────────────────────────
  const [revisions, signs, cpRowsRaw, cpMetaDb] = await Promise.all([
    AIT_API.getRevisions(carId, 'cp').catch(() => []),
    AIT_API.getRevisionSigns(carId, 'cp').catch(() => []),
    AIT_API.getCpRows(carId).catch(() => []),
    AIT_API.getCpMeta(carId).catch(() => null)
  ]);
  const cpRowsOrig = (cpRowsRaw || []).filter(r => !r.is_deleted);

  // ── 번역 ───────────────────────────────────────────────────────────────────
  const cpRows = await _translateRows(cpRowsOrig);

  let cftArr = [];
  try {
    const cftSrc = cpMetaDb?.cft || cpMeta.cft;
    cftArr = typeof cftSrc === 'string' ? JSON.parse(cftSrc) : (cftSrc || []);
  } catch(e) {}

  const sigsByRev = {};
  (signs || []).forEach(s => {
    const rv = String(s.rev);
    if (!sigsByRev[rv]) sigsByRev[rv] = {};
    sigsByRev[rv][s.role] = s;
  });
  const signedRevNums = Object.keys(sigsByRev).map(Number).filter(n => !isNaN(n));
  const maxSignedRev  = signedRevNums.length ? Math.max(...signedRevNums) : revNum;
  const latestSigns   = sigsByRev[String(maxSignedRev)] || sigsByRev[String(revNum)] || {};

  const dUrl = fid => (fid && typeof AIT_API.driveUrl === 'function') ? AIT_API.driveUrl(fid) : '';
  const safe = v   => (!v || v === 'null') ? '' : String(v);
  const logoUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/ait-logo.png');

  // Phase 체크박스 (영문)
  const stageEn  = stage === '시작' ? 'Prototype' : stage === '선행양산' ? 'Pre-launch' : 'Production';
  const phaseBox = label =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:10px;font-size:7pt">
       <span style="display:inline-block;width:9px;height:9px;border:0.5pt solid #000;text-align:center;line-height:9px;font-size:6pt">${stageEn===label?'■':''}</span>${label}
     </span>`;

  const signCell = sg => {
    const img = sg?.sign_file_id
      ? `<img src="${dUrl(sg.sign_file_id)}" style="max-height:22px;max-width:44px;object-fit:contain;display:block;margin:1px auto" onerror="this.style.display='none'">`
      : '';
    return `<div style="font-size:6.5pt;font-weight:700;text-align:center">${safe(sg?.signer_name)}</div>${img}`;
  };

  const revsSorted = [...(revisions||[])].sort((a,b) => (a.rev||0)-(b.rev||0));
  const revDate    = safe(revsSorted[revsSorted.length-1]?.rev_date).substring(0,10) || '';
  const issueDate  = safe(revsSorted[0]?.rev_date).substring(0,10) || '';

  const cftText = cftArr.length
    ? cftArr.map(c => [safe(c.name), safe(c.dept), safe(c.title)].filter(Boolean).join(' ')).join(' / ')
    : '';

  // ── 헤더 영역 ──────────────────────────────────────────────────────────────
  const B = 'border:0.5pt solid #000;';
  const headerHtml = `
<div style="font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;font-size:7pt;padding:5mm 7mm 2mm">
  <table style="border-collapse:collapse;width:100%;margin-bottom:3px">
    <tr>
      <td style="width:54px;border:1pt solid #7a90b8;padding:3px;text-align:center;vertical-align:middle">
        <img src="${logoUrl}" style="height:22px;object-fit:contain" onerror="this.style.display='none'">
      </td>
      <td style="border-top:1pt solid #7a90b8;border-bottom:1pt solid #7a90b8;text-align:center;font-size:13pt;font-weight:900;letter-spacing:4px;color:#1e3264;padding:4px">
        CONTROL PLAN
      </td>
      <td style="width:88px;border:1pt solid #7a90b8;text-align:center;font-size:7pt;font-weight:700;color:#b91c1c;letter-spacing:2px;padding:4px;vertical-align:middle">
        CONFIDENTIAL
      </td>
    </tr>
  </table>
  <table style="border-collapse:collapse;width:100%">
    <tr>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;width:9%;font-size:6pt">Phase Covered</td>
      <td style="${B}padding:2px 5px;width:16%">${phaseBox('Prototype')}${phaseBox('Pre-launch')}${phaseBox('Production')}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;width:6%;font-size:6pt">Part No.</td>
      <td style="${B}padding:2px 6px;width:10%">${partno}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;width:9%;font-size:6pt">Latest Change Level</td>
      <td style="${B}padding:2px 6px;width:5%">${latestRev?.rev_display || 'Rev. ' + revNum}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;width:8%;font-size:6pt">Organization</td>
      <td style="${B}padding:2px 6px;width:9%">AIT Co., Ltd.</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;width:5%;font-size:6pt">Site</td>
      <td style="${B}padding:2px 6px">Production Team</td>
    </tr>
    <tr>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Part Name</td>
      <td colspan="3" style="${B}padding:2px 6px">${partname}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Project Name</td>
      <td colspan="2" style="${B}padding:2px 6px">${carmodel}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Customer</td>
      <td colspan="2" style="${B}padding:2px 6px">GENTEX</td>
    </tr>
    <tr>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">CFT / Area Responsible</td>
      <td colspan="5" style="${B}padding:2px 6px;font-size:6pt">${cftText}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Revision Date</td>
      <td style="${B}padding:2px 6px">${revDate}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Issue Date</td>
      <td style="${B}padding:2px 6px">${issueDate}</td>
    </tr>
    <tr>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Prepared by</td>
      <td style="${B}padding:2px 6px;text-align:center;vertical-align:middle;height:36px">${signCell(latestSigns.author)}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Verified by</td>
      <td style="${B}padding:2px 6px;text-align:center;vertical-align:middle">${signCell(latestSigns.reviewer)}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Approved by</td>
      <td style="${B}padding:2px 6px;text-align:center;vertical-align:middle">${signCell(latestSigns.approver)}</td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Document No.</td>
      <td style="${B}padding:2px 6px"></td>
      <td style="${B}background:#fffde7;font-weight:700;padding:2px 4px;font-size:6pt">Rev. No.</td>
      <td style="${B}padding:2px 6px">${latestRev?.rev_display || String(revNum).padStart(2,'0')}</td>
    </tr>
  </table>
</div>`;

  // ── 데이터 테이블 ───────────────────────────────────────────────────────────
  cpRows.sort((a,b) => {
    const pa = parseFloat(a.proc_no)||0, pb = parseFloat(b.proc_no)||0;
    return pa !== pb ? pa-pb : (a.sort_order||0)-(b.sort_order||0);
  });

  const procGroups = [];
  let curProc = null;
  for (const row of cpRows) {
    if (row.proc_no !== curProc) { procGroups.push({proc_no:row.proc_no, rows:[], equipGroups:[]}); curProc = row.proc_no; }
    procGroups[procGroups.length-1].rows.push(row);
  }
  for (const pg of procGroups) {
    let curEq = Symbol();
    for (const row of pg.rows) {
      const eq = safe(row.equip_name);
      if (eq !== curEq) { pg.equipGroups.push({equip:eq, rows:[]}); curEq = eq; }
      pg.equipGroups[pg.equipGroups.length-1].rows.push(row);
    }
  }

  const tableRows = [];
  for (const pg of procGroups) {
    const total = pg.rows.length;
    let pDone = false, itemNo = 1;
    for (const eg of pg.equipGroups) {
      const eqRS = eg.rows.length; let eDone = false;
      for (const row of eg.rows) {
        let h = '<tr>';
        if (!pDone) {
          const pname   = safe(row.proc_name);
          const isInsp  = pname.toLowerCase().includes('incoming') || pname.toLowerCase().includes('outgoing')
                       || pname.includes('수입검사') || pname.includes('출하검사');
          const subSym  = !isInsp && row.flow_sub ? '◇' : '';
          const mainSym = isInsp ? '◇' : (row.flow_main ? (row.flow_outsource ? '△' : '○') : '');
          const outSym  = !isInsp && row.flow_outsource && !row.flow_main ? '△' : '';
          h += `<td rowspan="${total}" style="${B}text-align:center;font-weight:700;font-size:6.5pt;vertical-align:middle">${safe(row.proc_no)}</td>`;
          h += `<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${subSym}</td>`;
          h += `<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${mainSym}</td>`;
          h += `<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${outSym}</td>`;
          h += `<td rowspan="${total}" style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${pname}</td>`;
          pDone = true;
        }
        if (!eDone) {
          h += `<td rowspan="${eqRS}" style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.equip_name)}</td>`;
          eDone = true;
        }

        const cat    = safe(row.ctrl_category);
        const item   = safe(row.ctrl_item);
        const fpfRaw = safe(row.char_general) || safe(row.fpf) || '';
        const scMark = fpfRaw && fpfRaw !== '-' && fpfRaw !== '—' && fpfRaw !== 'null'
          ? (fpfRaw==='1'||fpfRaw==='true'||fpfRaw==='Y' ? 'SC' : fpfRaw) : '';

        // sample_freq → Size / Freq. 분리 ("10pcs / Lot" 형식)
        const sampleRaw  = safe(row.sample_freq);
        const slashIdx   = sampleRaw.indexOf('/');
        const sampleSize = slashIdx >= 0 ? sampleRaw.substring(0, slashIdx).trim() : '';
        const sampleFreq = slashIdx >= 0 ? sampleRaw.substring(slashIdx+1).trim() : sampleRaw;

        h += `<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle">${itemNo}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${cat==='공정'?item:''}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${cat==='제품'?item:''}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.standard)}</td>`;
        h += `<td style="${B}text-align:center;font-size:6pt;font-weight:700;vertical-align:middle;color:#1d4ed8">${scMark}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.tool)}</td>`;
        h += `<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle">${sampleSize}</td>`;
        h += `<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle">${sampleFreq}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.ctrl_method)}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle">${safe(row.owner)}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.reaction_plan)}</td>`;
        h += `<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.linked_doc)}</td>`;
        h += '</tr>';
        tableRows.push(h); itemNo++;
      }
    }
  }

  // 컬럼 비율 — 2Ball xlsx 비중 기준
  const bodyHtml = `
<div style="padding:0 7mm 6mm;font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;font-size:7pt">
  <table style="border-collapse:collapse;width:100%">
    <colgroup>
      <col style="width:3%">                          <!-- Process No. -->
      <col style="width:1.5%">                        <!-- Sub -->
      <col style="width:1.5%">                        <!-- Main -->
      <col style="width:1.5%">                        <!-- Out Sourcing -->
      <col style="width:7%">                          <!-- Process Name -->
      <col style="width:6.5%">                        <!-- Machine/Jig -->
      <col style="width:2%">                          <!-- CC No. -->
      <col style="width:6%">                          <!-- CC Process -->
      <col style="width:6%">                          <!-- CC Product -->
      <col style="width:11%">                         <!-- Specification/Tolerance -->
      <col style="width:3%">                          <!-- Special Char. -->
      <col style="width:6.5%">                        <!-- Eval/Measurement -->
      <col style="width:3.5%">                        <!-- Sample Size -->
      <col style="width:3.5%">                        <!-- Sample Freq. -->
      <col style="width:7%">                          <!-- Control Method -->
      <col style="width:5%">                          <!-- Contact -->
      <col style="width:10%">                         <!-- Escalation Plan -->
      <col style="width:8%">                          <!-- Document -->
    </colgroup>
    <thead>
      <tr style="background:#fffde7;text-align:center;vertical-align:middle">
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Process<br>No.</th>
        <th colspan="3" style="${B}padding:2px;font-size:5.5pt">Process Flow</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Process<br>Name</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Machine / Jig<br>/ Fixture / Tools</th>
        <th colspan="4" style="${B}padding:2px;font-size:5.5pt">Control Characteristics</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5pt">Special<br>Char.</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Evaluation /<br>Measurement<br>Technique</th>
        <th colspan="2" style="${B}padding:2px;font-size:5.5pt">Sample</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Control Method<br>(Error Proofing)</th>
        <th colspan="2" style="${B}padding:2px;font-size:5.5pt">Reaction Plan</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Document<br>(Record)</th>
      </tr>
      <tr style="background:#fffde7;text-align:center;vertical-align:middle">
        <th style="${B}padding:2px;font-size:5pt">Sub</th>
        <th style="${B}padding:2px;font-size:5pt">Main</th>
        <th style="${B}padding:2px;font-size:5pt">Out<br>Sourcing</th>
        <th style="${B}padding:2px;font-size:5pt">No.</th>
        <th style="${B}padding:2px;font-size:5pt">Process</th>
        <th style="${B}padding:2px;font-size:5pt">Product</th>
        <th style="${B}padding:2px;font-size:5pt">Specification<br>/ Tolerance</th>
        <th style="${B}padding:2px;font-size:5pt">Size</th>
        <th style="${B}padding:2px;font-size:5pt">Freq.</th>
        <th style="${B}padding:2px;font-size:5pt">Contact</th>
        <th style="${B}padding:2px;font-size:5pt">Escalation Plan<br>(Corrective Action)</th>
      </tr>
    </thead>
    <tbody>${tableRows.join('')}</tbody>
  </table>
</div>`;

  // ── 최종 HTML 작성 ──────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CONTROL PLAN - ${carName}</title>
<style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif; margin:0; background:#f0f0f0; }
#pset { position:fixed;top:0;left:0;right:0;z-index:9999;background:#1e3264;color:#fff;
  padding:6px 14px;display:flex;align-items:center;gap:10px;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.4); }
#pset select { font-size:11px;padding:2px 5px;border-radius:4px;color:#111; }
#pset button { padding:4px 14px;background:#4ade80;color:#0f172a;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer; }
.ps { height:42px; }
@media print { #pset,.ps { display:none!important; } body { background:#fff; } }
</style>
</head>
<body>
<div id="pset">
  <b>🖨 CONTROL PLAN (GENTEX)</b>
  <label>Scale
    <select id="scl" onchange="document.getElementById('body-wrap').style.zoom=(this.value/100)">
      <option value="100">100%</option><option value="95" selected>95%</option>
      <option value="90">90%</option><option value="85">85%</option><option value="80">80%</option>
    </select>
  </label>
  <button onclick="window.print()">Print</button>
  <span style="font-size:10px;opacity:.65">※ This bar is excluded from printing</span>
</div>
<div class="ps"></div>
<div id="body-wrap" style="zoom:.95">
${headerHtml}
${bodyHtml}
</div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
};
