// ── 한→영 번역 (Google Translate 비공식, 3초 타임아웃) ──────────────────────
async function _gtTranslate(text) {
  if (!text || !/[가-힣]/.test(text)) return text;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 3000);
    const url  = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=' + encodeURIComponent(text);
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    const data = await res.json();
    return (data[0] || []).map(x => x[0]).join('').trim() || text;
  } catch(e) { return text; }
}

async function _translateRows(rows) {
  const safe = v => (!v || v === 'null') ? '' : String(v);
  // owner는 ● 점 로직에 한국어 그대로 사용 → 번역 제외
  const FIELDS = ['proc_name','equip_name','ctrl_item','standard','tool','sample_freq','ctrl_method','reaction_plan','linked_doc'];

  const unique = new Set();
  for (const row of rows)
    for (const f of FIELDS) { const v = safe(row[f]); if (v && /[가-힣]/.test(v)) unique.add(v); }

  const map = {};
  await Promise.all([...unique].map(async text => {
    map[text] = await _gtTranslate(text);
  }));

  return rows.map(row => {
    const r = { ...row };
    for (const f of FIELDS) { const v = safe(r[f]); if (map[v]) r[f] = map[v]; }
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

  const stage    = paneEl?.querySelector('#cp-stage-view')?.textContent.trim()    || cpMeta.stage    || '시작';
  const linename = paneEl?.querySelector('#cp-meta-linename')?.textContent.trim() || cpMeta.linename || '';
  const carmodel = paneEl?.querySelector('#cp-meta-model')?.textContent.trim()    || carName;
  const partno   = paneEl?.querySelector('#cp-meta-partno')?.textContent.trim()   || cpMeta.partno   || '';
  const partname = paneEl?.querySelector('#cp-meta-partname')?.textContent.trim() || cpMeta.partname || '';
  const revBadge = paneEl?.querySelector('#cp-rev-badge')?.textContent || '';
  const revNum   = parseInt(revBadge.replace(/[^0-9]/g, '')) || 0;
  const cftText  = paneEl?.querySelector('#cp-cft-inline')?.textContent.trim() || '';

  // 단계 영문 변환
  const stageEn = stage === '시작' ? 'Prototype' : stage === '선행양산' ? 'Pre-launch' : 'Production';

  // ── 로딩 팝업 ─────────────────────────────────────────────────────────────
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) { alert('팝업 차단을 해제해주세요.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Control Plan (EN) - ${carName}</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f4f8">
    <div style="text-align:center;color:#1e3264">
      <div style="font-size:28px;margin-bottom:12px">⏳</div>
      <div style="font-size:16px;font-weight:700">Translating to English...</div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px">잠시 기다려주세요</div>
    </div></body></html>`);
  win.document.close();

  // ── DB 페치 ───────────────────────────────────────────────────────────────
  const [revisions, signs, cpRowsRaw, cpMetaDb] = await Promise.all([
    AIT_API.getRevisions(carId, 'cp').catch(() => []),
    AIT_API.getRevisionSigns(carId, 'cp').catch(() => []),
    AIT_API.getCpRows(carId).catch(() => []),
    AIT_API.getCpMeta(carId).catch(() => null)
  ]);
  const cpRowsOrig = (cpRowsRaw || []).filter(r => !r.is_deleted);

  // ── 번역 ─────────────────────────────────────────────────────────────────
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

  // ── 갑지 (print_cp와 동일 구조, 라벨만 영문) ─────────────────────────────
  const stageBox = (label, val) =>
    `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:12px">
       <span style="display:inline-block;width:10px;height:10px;border:1pt solid #000;text-align:center;line-height:10px;font-size:7pt">${stageEn===val?'■':''}</span>${label}
     </span>`;

  const signCell = sg => {
    const img = sg?.sign_file_id
      ? `<img src="${dUrl(sg.sign_file_id)}" style="max-height:28px;max-width:52px;object-fit:contain;display:block;margin:2px auto" onerror="this.style.display='none'">`
      : '';
    return `<div style="font-size:7pt;text-align:center;color:#374151">${safe(sg?.signer_name)}</div>${img}`;
  };

  const cftHtml = cftArr.length
    ? cftArr.map(c => `<div style="font-size:6pt;line-height:1.6">${safe(c.dept)} : ${safe(c.name)} ${safe(c.title)}</div>`).join('')
    : (cftText ? `<div style="font-size:6pt">${cftText}</div>` : '');

  const revsSorted = [...(revisions||[])].sort((a,b) => (a.rev||0)-(b.rev||0));
  const latestRev  = revsSorted[revsSorted.length - 1];
  let revRows = revsSorted.map(r => {
    const sg = sigsByRev[String(r.rev||0)] || {};
    return `<tr>
      <td style="border:0.5pt solid #000;padding:2px 4px;text-align:center">${r.rev_display || (r.rev===0||!r.rev?'-':r.rev)}</td>
      <td style="border:0.5pt solid #000;padding:2px 4px;text-align:center">${safe(r.rev_date).substring(0,10)}</td>
      <td style="border:0.5pt solid #000;padding:2px 8px;text-align:left">${safe(r.note)}</td>
      <td style="border:0.5pt solid #000;padding:2px 4px;text-align:center">${sg.author?.signer_name||safe(r.author)}</td>
      <td style="border:0.5pt solid #000;padding:2px 4px;text-align:center">${sg.reviewer?.signer_name||''}</td>
      <td style="border:0.5pt solid #000;padding:2px 4px;text-align:center">${sg.approver?.signer_name||''}</td>
    </tr>`;
  });
  while (revRows.length < 8) revRows.push(`<tr>
    <td style="border:0.5pt solid #000;padding:3px">&nbsp;</td>
    <td style="border:0.5pt solid #000"></td><td style="border:0.5pt solid #000"></td>
    <td style="border:0.5pt solid #000"></td><td style="border:0.5pt solid #000"></td>
    <td style="border:0.5pt solid #000"></td></tr>`);

  const coverHtml = `
<div style="width:210mm;min-height:297mm;padding:12mm 14mm;box-sizing:border-box;font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;font-size:7pt;position:relative;page-break-after:always">
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
    <tr>
      <td style="width:72px;border:1pt solid #7a90b8;padding:4px;text-align:center;vertical-align:middle">
        <img src="${logoUrl}" style="height:26px;object-fit:contain" onerror="this.style.display='none'">
      </td>
      <td style="border-top:1pt solid #7a90b8;border-bottom:1pt solid #7a90b8;text-align:center;font-size:16pt;font-weight:900;letter-spacing:6px;color:#1e3264;padding:6px">
        CONTROL PLAN
        <div style="font-size:8pt;font-weight:400;letter-spacing:2px;color:#6b7280;margin-top:2px">관리계획서</div>
      </td>
      <td style="width:160px;border:1pt solid #7a90b8;padding:0;vertical-align:top">
        <table style="border-collapse:collapse;width:100%;height:100%">
          <tr><td colspan="3" style="padding:2px 5px;font-size:6pt;color:#6b7280;border-bottom:0.5pt solid #d1d5db">Document No.</td></tr>
          <tr><td colspan="3" style="padding:2px 5px;font-size:6pt;border-bottom:0.5pt solid #d1d5db">&nbsp;</td></tr>
          <tr>
            <td style="background:#1e3264;color:#fff;padding:2px;font-size:6pt;text-align:center;border-right:0.5pt solid rgba(255,255,255,.3);width:33%">Prepared</td>
            <td style="background:#1e3264;color:#fff;padding:2px;font-size:6pt;text-align:center;border-right:0.5pt solid rgba(255,255,255,.3);width:33%">Reviewed</td>
            <td style="background:#1e3264;color:#fff;padding:2px;font-size:6pt;text-align:center;width:34%">Approved</td>
          </tr>
          <tr>
            <td style="padding:3px;border-right:0.5pt solid #d1d5db;border-top:0.5pt solid #d1d5db;text-align:center;vertical-align:middle;height:44px">${signCell(latestSigns.author)}</td>
            <td style="padding:3px;border-right:0.5pt solid #d1d5db;border-top:0.5pt solid #d1d5db;text-align:center;vertical-align:middle">${signCell(latestSigns.reviewer)}</td>
            <td style="padding:3px;border-top:0.5pt solid #d1d5db;text-align:center;vertical-align:middle">${signCell(latestSigns.approver)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
    <colgroup><col style="width:12%"><col style="width:22%"><col style="width:12%"><col style="width:22%"><col style="width:12%"><col></colgroup>
    <tr>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Phase</td>
      <td colspan="5" style="border:0.5pt solid #000;padding:3px 10px">
        ${stageBox('Prototype','Prototype')}${stageBox('Pre-launch','Pre-launch')}${stageBox('Production','Production')}
      </td>
    </tr>
    <tr>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Model</td>
      <td style="border:0.5pt solid #000;padding:3px 8px">${carmodel}</td>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Part Name</td>
      <td style="border:0.5pt solid #000;padding:3px 8px">${partname}</td>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Part No.</td>
      <td style="border:0.5pt solid #000;padding:3px 8px">${partno}</td>
    </tr>
    <tr>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Line</td>
      <td style="border:0.5pt solid #000;padding:3px 8px">${linename}</td>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center;font-size:6pt">CFT</td>
      <td colspan="3" style="border:0.5pt solid #000;padding:3px 8px">${cftHtml}</td>
    </tr>
    <tr>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Supplier Code</td>
      <td style="border:0.5pt solid #000;padding:3px 8px">#AIT</td>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center;font-size:6pt">Customer Eng. Approval</td>
      <td style="border:0.5pt solid #000;padding:3px 8px"></td>
      <td style="border:0.5pt solid #000;background:#FFFF99;font-weight:700;padding:3px 5px;text-align:center">Other Approval</td>
      <td style="border:0.5pt solid #000;padding:3px 8px"></td>
    </tr>
  </table>

  <div style="font-weight:700;font-size:7.5pt;margin:8px 0 3px;color:#1e3264">▶ Revision History</div>
  <table style="border-collapse:collapse;width:100%">
    <colgroup><col style="width:8%"><col style="width:14%"><col><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>
    <tr>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Rev. No.</th>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Date</th>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Description of Change</th>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Prepared</th>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Reviewed</th>
      <th style="border:0.5pt solid #000;background:#FFFF99;padding:3px;text-align:center">Approved</th>
    </tr>
    ${revRows.join('')}
  </table>
  <div style="position:absolute;bottom:12mm;right:14mm;font-size:6pt;color:#9ca3af">Retention Period: Permanent</div>
</div>`;

  // ── 본문 (print_cp와 동일 구조, 라벨만 영문) ─────────────────────────────
  cpRows.sort((a,b) => {
    const pa=parseFloat(a.proc_no)||0, pb=parseFloat(b.proc_no)||0;
    return pa!==pb ? pa-pb : (a.sort_order||0)-(b.sort_order||0);
  });

  const procGroups=[];
  let curProc=null;
  for(const row of cpRows){
    if(row.proc_no!==curProc){ procGroups.push({proc_no:row.proc_no,rows:[],equipGroups:[]}); curProc=row.proc_no; }
    procGroups[procGroups.length-1].rows.push(row);
  }
  for(const pg of procGroups){
    let curEq=Symbol();
    for(const row of pg.rows){
      const eq=safe(row.equip_name);
      if(eq!==curEq){ pg.equipGroups.push({equip:eq,rows:[]}); curEq=eq; }
      pg.equipGroups[pg.equipGroups.length-1].rows.push(row);
    }
  }

  const B='border:0.5pt solid #000;';
  const tableRows=[];
  for(const pg of procGroups){
    const total=pg.rows.length;
    let pDone=false, itemNo=1;
    for(const eg of pg.equipGroups){
      const eqRS=eg.rows.length; let eDone=false;
      for(const row of eg.rows){
        // 번역된 row에서 proc_name을 가져오되, 흐름도 기호 판단은 원본 기준
        const origRow = cpRowsOrig.find(r => r.id === row.id) || row;
        let h='<tr>';
        if(!pDone){
          const pname  = safe(row.proc_name);
          const opname = safe(origRow.proc_name);
          const isInsp = opname.includes('수입검사') || opname.includes('출하검사')
                      || pname.toLowerCase().includes('incoming') || pname.toLowerCase().includes('outgoing');
          const subSym  = !isInsp && row.flow_sub ? '◇' : '';
          const mainSym = isInsp ? '◇' : (row.flow_main ? (row.flow_outsource ? '△' : '○') : '');
          const outSym  = !isInsp && row.flow_outsource && !row.flow_main ? '△' : '';
          h+=`<td rowspan="${total}" style="${B}text-align:center;font-weight:700;font-size:6.5pt;vertical-align:middle">${safe(row.proc_no)}</td>`;
          h+=`<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${subSym}</td>`;
          h+=`<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${mainSym}</td>`;
          h+=`<td rowspan="${total}" style="${B}text-align:center;font-size:9pt;vertical-align:middle">${outSym}</td>`;
          h+=`<td rowspan="${total}" style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${pname}</td>`;
          pDone=true;
        }
        if(!eDone){
          h+=`<td rowspan="${eqRS}" style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.equip_name)}</td>`;
          eDone=true;
        }
        const cat    = safe(origRow.ctrl_category);
        const item   = safe(row.ctrl_item);
        // owner는 원본(한국어) 기준으로 ● 판단
        const owner  = safe(origRow.owner);
        const fpfRaw = safe(row.char_general)||safe(row.fpf)||'';
        const fpfMark= (fpfRaw==='1'||fpfRaw==='true'||fpfRaw==='Y')?'●':
                       (fpfRaw&&fpfRaw!=='-'&&fpfRaw!=='—'&&fpfRaw!=='null')?fpfRaw:'';
        h+=`<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle">${itemNo}</td>`;
        h+=`<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${cat==='제품'?item:''}</td>`;
        h+=`<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${cat==='공정'?item:''}</td>`;
        h+=`<td style="${B}text-align:center;font-size:8pt;vertical-align:middle">${fpfMark}</td>`;
        h+=`<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.standard)}</td>`;
        h+=`<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.tool)}</td>`;
        h+=`<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle">${safe(row.sample_freq)}</td>`;
        h+=`<td style="${B}text-align:center;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.ctrl_method)}</td>`;
        h+=`<td style="${B}text-align:center;font-size:9pt;vertical-align:middle">${owner.includes('생산')?'●':''}</td>`;
        h+=`<td style="${B}text-align:center;font-size:9pt;vertical-align:middle">${owner.includes('자재')?'●':''}</td>`;
        h+=`<td style="${B}text-align:center;font-size:9pt;vertical-align:middle">${owner.includes('품질')?'●':''}</td>`;
        h+=`<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.reaction_plan)}</td>`;
        h+=`<td style="${B}text-align:left;padding:1px 3px;font-size:5.5pt;vertical-align:middle;white-space:pre-line">${safe(row.linked_doc)}</td>`;
        h+='</tr>';
        tableRows.push(h); itemNo++;
      }
    }
  }

  const bodyHtml = `
<div style="padding:8mm 10mm;font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;font-size:7pt">
  <table style="border-collapse:collapse;width:100%;margin-bottom:3px">
    <tr>
      <td style="${B}background:#1e3264;color:#fff;padding:3px 6px;font-size:9pt;font-weight:900;letter-spacing:2px;width:13%">CONTROL PLAN</td>
      <td style="${B}background:#FFFF99;font-weight:700;padding:2px 5px;width:5%">Phase</td>
      <td style="${B}padding:2px 5px;width:7%">${stageEn}</td>
      <td style="${B}background:#FFFF99;font-weight:700;padding:2px 5px;width:5%">Model</td>
      <td style="${B}padding:2px 5px;text-align:left;width:14%">${carmodel}</td>
      <td style="${B}background:#FFFF99;font-weight:700;padding:2px 5px;width:5%">Part Name</td>
      <td style="${B}padding:2px 5px;text-align:left;width:12%">${partname}</td>
      <td style="${B}background:#FFFF99;font-weight:700;padding:2px 5px;width:5%">Part No.</td>
      <td style="${B}padding:2px 5px;text-align:left">${partno}</td>
    </tr>
  </table>
  <table style="border-collapse:collapse;width:100%">
    <colgroup>
      <col style="width:3%"><col style="width:2%"><col style="width:2%"><col style="width:2%">
      <col style="width:8%"><col style="width:7%"><col style="width:2%">
      <col style="width:7%"><col style="width:7%"><col style="width:2.5%">
      <col style="width:10%"><col style="width:5.5%"><col style="width:4%"><col style="width:7%">
      <col style="width:2.5%"><col style="width:2.5%"><col style="width:2.5%">
      <col style="width:9%"><col style="width:5%">
    </colgroup>
    <thead>
      <tr style="background:#FFFF99;text-align:center;vertical-align:middle">
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Process<br>No.</th>
        <th colspan="3" style="${B}padding:2px;font-size:6pt">Process Flow</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Process Name</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Equipment</th>
        <th colspan="3" style="${B}padding:2px;font-size:6pt">Control Item</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">F/PF<br>Special<br>Char.</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Specification</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Inspection<br>Method</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Freq.</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Control<br>Method</th>
        <th colspan="3" style="${B}padding:2px;font-size:6pt">Responsibility</th>
        <th rowspan="2" style="${B}padding:2px;font-size:5.5pt">Corrective<br>Action</th>
        <th rowspan="2" style="${B}padding:2px;font-size:6pt">Remarks</th>
      </tr>
      <tr style="background:#FFFF99;text-align:center;vertical-align:middle">
        <th style="${B}padding:2px;font-size:6pt">SUB</th>
        <th style="${B}padding:2px;font-size:6pt">MAIN</th>
        <th style="${B}padding:2px;font-size:6pt">Out-<br>source</th>
        <th style="${B}padding:2px;font-size:6pt">NO</th>
        <th style="${B}padding:2px;font-size:6pt">Product</th>
        <th style="${B}padding:2px;font-size:6pt">Process</th>
        <th style="${B}padding:2px;font-size:6pt">Prod.</th>
        <th style="${B}padding:2px;font-size:6pt">Matl.</th>
        <th style="${B}padding:2px;font-size:6pt">Qual.</th>
      </tr>
    </thead>
    <tbody>${tableRows.join('')}</tbody>
  </table>
</div>`;

  // ── 팝업 최종 출력 ────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Control Plan (EN) - ${carName}</title>
<style>
@page :first { size: A4 portrait;  margin: 0; }
@page         { size: A4 landscape; margin: 0; }
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
  <b>🖨 Control Plan (English)</b>
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
${coverHtml}
<div id="body-wrap" style="zoom:.95">${bodyHtml}</div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
};
