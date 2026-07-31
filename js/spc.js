/* ══════════════════════════════════════════════════════════════
   SPC (X-bar 관리도) 탭 모듈
   tabs/spc.html 이 로드될 때 initSpcTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
window.initSpcTab = function initSpcTab() {
  var $ = function(s){ return document.querySelector(s); };
  var META = [], DATA = null, SPECIAL_ITEMS = null, SPEC_OVERRIDE = null, specAuto = false, LINE_ID = null, spcEditMode = false;
  var car = window.currentCar || '';
  $('#spc-car').textContent = car ? '· 아이템: ' + car : '';

  // 차종의 linename(OC/OD)을 검사기DB의 line_id(LINE_01=OD라인, LINE_02=OC라인)로 변환
  // (dashboard.line_master 기준 — OC/OD가 같은 품번을 공유해 라인 구분 없이는 데이터가 섞인다)
  var LINE_NAME_MAP = { 'OC':'LINE_02', 'OD':'LINE_01' };
  function resolveLineId(){
    var cpMeta = (typeof _cpMetaGet === 'function') ? _cpMetaGet(car) : null;
    var wsCar = (window._aitCars || []).find(function(c){ return String(c.id) === String(window.currentCarId); });
    var ln = String((cpMeta && cpMeta.linename) || (wsCar && wsCar.linename) || '').trim().toUpperCase();
    return LINE_NAME_MAP[ln] || null;
  }

  // CP 특별특성(char_special: C/숫자/문자/기호 등 마킹된 행)의 관리항목명+규격을 추출
  function normText(s){ return String(s||'').toLowerCase().replace(/\s+/g,''); }
  function isSpecialMark(v){ var s=String(v==null?'':v).trim(); return !!s && s!=='-' && s!=='—' && s.toLowerCase()!=='null'; }
  async function loadSpecialItems(){
    var carId = window.currentCarId;
    if(!carId) return [];
    try{
      var rows = await AIT_API.getCpRows(carId);
      return (rows||[])
        .filter(function(r){ return !r.is_deleted && isSpecialMark(r.char_special); })
        .map(function(r){ return { id: r.id, name: String(r.ctrl_item||'').trim(), standard: String(r.standard||'').trim(), ucl: r.ucl, lcl: r.lcl }; })
        .filter(function(x){ return !!x.name; });
    }catch(e){ console.warn('CP 특별특성 조회 실패', e); return []; }
  }
  // CP 관리항목명과 검사기 측정항목명이 텍스트로 안 겹치는 경우를 위한 수동 별칭(정규화된 이름 기준)
  var CTRL_ITEM_ALIAS = {
    'room소모전류': 'room(touch)on전류'
  };
  // itemName(측정항목명)과 가장 잘 맞는 CP 특별특성 행을 찾는다 (별칭 우선, 완전일치, 부분일치는 최장매칭)
  function findSpecialMatch(itemName, specialRows){
    var a = normText(itemName);
    if(!a || !specialRows || !specialRows.length) return null;
    for(var i=0;i<specialRows.length;i++){
      var alias = CTRL_ITEM_ALIAS[normText(specialRows[i].name)];
      if(alias && alias===a) return specialRows[i];
    }
    for(var i=0;i<specialRows.length;i++){ if(normText(specialRows[i].name)===a) return specialRows[i]; }
    var best=null, bestLen=0;
    specialRows.forEach(function(r){
      var b = normText(r.name);
      if(!b) return;
      if(a.indexOf(b)>=0 || b.indexOf(a)>=0){
        var len = Math.min(a.length, b.length);
        if(len>bestLen){ bestLen=len; best=r; }
      }
    });
    return best;
  }
  // CP 규격 텍스트(예: "170mA~240mA", "170 ~ 240 mA")에서 하한/상한을 추출
  function parseSpecRange(text){
    if(!text) return null;
    var m = String(text).match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z%℃°]*)\s*[~\-∼～]\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z%℃°]*)/);
    if(!m) return null;
    var lo = parseFloat(m[1]), hi = parseFloat(m[3]);
    if(isNaN(lo) || isNaN(hi)) return null;
    if(lo>hi){ var t=lo; lo=hi; hi=t; }
    return { lsl: lo, usl: hi, unit: (m[4]||m[2]||'') };
  }
  // itemName과 매칭된 CP 특별특성 행과 이름이 동일한 다른 변종(variant) 행들의 id도 모두 모은다
  // (같은 관리항목이 공통/NX5/CN8/GN7 PE 등 변종별로 중복 등록돼 있어, 규격 수정 시 전부 같이 갱신해야 함)
  function findSpecialSiblingIds(match, specialRows){
    if(!match) return [];
    var target = normText(match.name);
    return specialRows.filter(function(r){ return normText(r.name)===target; }).map(function(r){ return r.id; });
  }
  function numOrNull(v){ var s=String(v==null?'':v).trim(); if(!s) return null; var n=parseFloat(s); return isNaN(n)?null:n; }
  // 선택된 측정항목이 CP 특별특성 항목과 매칭되면 규격 상/하한(USL/LSL)과
  // 관리기준(UCL/LCL, cp_rows.ucl/lcl 에 수동 저장한 값)을 구해둔다.
  function applySpecOverride(){
    var match = findSpecialMatch($('#spc-item').value, SPECIAL_ITEMS);
    if(!match){ SPEC_OVERRIDE = null; updateSpecLabel(); _spcRenderSpecEdit(); return; }
    var parsed = parseSpecRange(match.standard);
    SPEC_OVERRIDE = {
      lsl: parsed?parsed.lsl:null, usl: parsed?parsed.usl:null,
      unit: parsed?parsed.unit:'', text: match.standard,
      ucl: numOrNull(match.ucl), lcl: numOrNull(match.lcl),
      ids: findSpecialSiblingIds(match, SPECIAL_ITEMS)
    };
    updateSpecLabel();
    _spcRenderSpecEdit();
  }
  // 편집 모드일 때 규격/관리기준 수정 입력창을 채우고 보이기/숨기기
  function _spcRenderSpecEdit(){
    var wrap = $('#spc-spec-edit');
    if(!wrap) return;
    if(spcEditMode && SPEC_OVERRIDE){
      wrap.style.display = 'inline-flex';
      $('#spc-lsl-edit').value = SPEC_OVERRIDE.lsl!=null ? SPEC_OVERRIDE.lsl : '';
      $('#spc-usl-edit').value = SPEC_OVERRIDE.usl!=null ? SPEC_OVERRIDE.usl : '';
      $('#spc-lcl-edit').value = SPEC_OVERRIDE.lcl!=null ? SPEC_OVERRIDE.lcl : '';
      $('#spc-ucl-edit').value = SPEC_OVERRIDE.ucl!=null ? SPEC_OVERRIDE.ucl : '';
    } else {
      wrap.style.display = 'none';
    }
  }
  async function _spcSaveSpecEdit(){
    if(!SPEC_OVERRIDE || !SPEC_OVERRIDE.ids || !SPEC_OVERRIDE.ids.length){ alert('CP 특별특성에 등록된 규격 항목이 아니라 저장할 곳이 없습니다.'); return; }
    var lslRaw = $('#spc-lsl-edit').value.trim(), uslRaw = $('#spc-usl-edit').value.trim();
    var lclRaw = $('#spc-lcl-edit').value.trim(), uclRaw = $('#spc-ucl-edit').value.trim();
    var payload = {}, notes = [];
    // 규격(USL/LSL): 둘 다 입력했을 때만 CP standard 텍스트를 갱신한다(문장형 규격을 덮어쓰지 않도록)
    if(lslRaw || uslRaw){
      var lsl = parseFloat(lslRaw), usl = parseFloat(uslRaw);
      if(isNaN(lsl) || isNaN(usl) || lsl>=usl){ alert('규격하한/상한을 둘 다 올바르게 입력하세요 (하한 < 상한)'); return; }
      var unit = SPEC_OVERRIDE.unit || '';
      payload.standard = lsl + unit + '~' + usl + unit;
      notes.push('규격 ' + payload.standard);
    }
    // 관리기준(UCL/LCL): 비우면 삭제 → 서버 계산값(X̄-R 관리한계)으로 되돌아간다
    if(lclRaw || uclRaw){
      var lcl = parseFloat(lclRaw), ucl = parseFloat(uclRaw);
      if(isNaN(lcl) || isNaN(ucl) || lcl>=ucl){ alert('관리하한(LCL)/관리상한(UCL)을 둘 다 올바르게 입력하세요 (LCL < UCL)'); return; }
      payload.lcl = String(lcl); payload.ucl = String(ucl);
      notes.push('관리기준 ' + lcl + '~' + ucl);
    } else {
      payload.lcl = ''; payload.ucl = '';
      if(SPEC_OVERRIDE.lcl!=null || SPEC_OVERRIDE.ucl!=null) notes.push('관리기준 해제(자동계산)');
    }
    if(!notes.length){ alert('저장할 값이 없습니다.'); return; }
    try{
      var wantUcl = payload.ucl!==undefined ? numOrNull(payload.ucl) : null;
      await Promise.all(SPEC_OVERRIDE.ids.map(function(id){ return AIT_API.updateCpRow(id, payload); }));
      SPECIAL_ITEMS = await loadSpecialItems();
      applySpecOverride();
      if(DATA) render();
      // 서버(n8n ait/cp/rows PUT)가 ucl/lcl 컬럼을 아직 저장하지 않으면 조용히 실패하므로 확인한다
      if((SPEC_OVERRIDE ? SPEC_OVERRIDE.ucl : null) !== wantUcl){
        msg('⚠ 관리기준(UCL/LCL)이 저장되지 않았습니다 — n8n ait/cp/rows 업데이트에 ucl/lcl 컬럼 반영이 필요합니다.','bad');
        return;
      }
      msg('저장했습니다: ' + notes.join(' · '));
    }catch(e){ alert('저장 실패: ' + e); }
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function msg(html, color){ $('#spc-msg').innerHTML = html ? '<div style="padding:12px 16px;border-radius:10px;background:'+(color==='bad'?'#fef2f2':'#f1f5f9')+';color:'+(color==='bad'?'#dc2626':'#475569')+'">'+html+'</div>' : ''; }

  // CP 품번(partno) 우선, 없으면 아이템(차종)명으로 모델 추정 (최장 공통 프리픽스 매칭)
  function normKey(s){ return String(s||'').toUpperCase().replace(/[^0-9A-Z-]/g,''); }
  function bestByPrefix(key, models){
    if(!key) return null;
    var best=null, bestLen=0;
    models.forEach(function(m){
      var M = normKey(m), len = 0;
      while(len<key.length && len<M.length && key[len]===M[len]) len++;
      if(len>bestLen){ bestLen=len; best=m; }
    });
    return bestLen>=6 ? best : null; // 최소 6자 이상 일치해야 신뢰 (예: "928A2-")
  }
  function guessModel(models){
    var cpMeta = (typeof _cpMetaGet === 'function') ? _cpMetaGet(car) : null;
    var wsCar = (window._aitCars || []).find(function(c){ return String(c.id) === String(window.currentCarId); });
    var partno = (cpMeta && cpMeta.partno) || (wsCar && wsCar.partno) || '';
    return bestByPrefix(normKey(partno), models) || bestByPrefix(normKey(car), models) || models[0];
  }

  function fillItems(){
    // 특별특성 항목 필터링은 서버(ait/spc/meta, carId 전달)가 DB단에서 이미 처리해서 META에 담아 준다.
    var model = $('#spc-model').value;
    var items = META.filter(function(m){ return m.model_name===model; });
    var note = (SPECIAL_ITEMS && SPECIAL_ITEMS.length)
      ? ' · <span style="color:#2563eb">CP 특별특성 항목만 표시 (서버 필터링, '+items.length+'개)</span>'
      : '';
    $('#spc-item').innerHTML = items.map(function(i){ return '<option value="'+esc(i.item_name)+'">'+esc(i.item_name)+' ('+esc(i.unit||'')+')</option>'; }).join('');
    var carEl = $('#spc-car');
    carEl.innerHTML = (car ? '· 아이템: ' + esc(car) : '') + (LINE_ID ? (' · 라인: '+esc(LINE_ID)) : ' · 라인 매핑 안됨(OC/OD만 지원)') + note;
    applySpecOverride();
  }
  function updateSpecLabel(){
    var it = META.find(function(m){ return m.model_name===$('#spc-model').value && m.item_name===$('#spc-item').value; });
    var base = it ? ('검사기 규격 '+(it.lsl!=null?it.lsl:'–')+' ~ '+(it.usl!=null?it.usl:'–')+' '+(it.unit||'')) : '';
    if(SPEC_OVERRIDE){
      var manual = (SPEC_OVERRIDE.lcl!=null && SPEC_OVERRIDE.ucl!=null);
      $('#spc-spec').innerHTML = 'CP 규격(특별특성) <b>'+esc(SPEC_OVERRIDE.text)+'</b>'
        + (SPEC_OVERRIDE.usl!=null ? ' · USL/LSL = 규격상/하한('+SPEC_OVERRIDE.lsl+' ~ '+SPEC_OVERRIDE.usl+')' : '')
        + ' · <span style="color:#7c3aed">UCL/LCL = '+(manual ? '수동('+SPEC_OVERRIDE.lcl+' ~ '+SPEC_OVERRIDE.ucl+')' : '자동계산(X&#772;-R)')+'</span>'
        + (base ? ' <span style="color:#94a3b8">'+esc(base)+'</span>' : '');
    } else {
      $('#spc-spec').textContent = base;
    }
  }

  function tiles(d){
    var oos = d.sub.filter(function(s){ return (d.usl!=null&&s.mean>d.usl) || (d.lsl!=null&&s.mean<d.lsl); }).length;
    var ooc = d.sub.filter(function(s){ return (d.ucl!=null&&s.mean>d.ucl) || (d.lcl!=null&&s.mean<d.lcl); }).length;
    var minS = d.minSamples!=null ? d.minSamples : 300;
    var suff = d.sufficientSamples!=null ? d.sufficientSamples : (d.samples>=minS);
    var cmSuffix = d.clManual ? '' : '<span style="color:#94a3b8">(자동)</span>';
    var t = [
      ['중심선 X&#773;', d.cl!=null?(+d.cl).toFixed(3):'–', ''],
      ['USL(규격상한)', d.usl!=null?(+d.usl).toFixed(3):'–', '#f59e0b'],
      ['LSL(규격하한)', d.lsl!=null?(+d.lsl).toFixed(3):'–', '#f59e0b'],
      ['UCL(관리상한)'+cmSuffix, d.ucl!=null?(+d.ucl).toFixed(3):'–', '#7c3aed'],
      ['LCL(관리하한)'+cmSuffix, d.lcl!=null?(+d.lcl).toFixed(3):'–', '#7c3aed'],
      ['관리이탈', ooc+'/'+d.sub.length, ooc?'#7c3aed':'#16a34a'],
      ['σ(단기,추정)', d.sigma!=null?(+d.sigma).toFixed(3):'–', ''],
      ['Cp / Cpk(단기)', (d.cp!=null?(+d.cp).toFixed(2):'–')+' / '+(d.cpk!=null?(+d.cpk).toFixed(2):'–'), (d.cpk!=null && d.cpk>=1.33)?'#16a34a':'#dc2626'],
      ['Pp / Ppk(장기)', (d.pp!=null?(+d.pp).toFixed(2):'–')+' / '+(d.ppk!=null?(+d.ppk).toFixed(2):'–'), (d.ppk!=null && d.ppk>=1.33)?'#16a34a':'#dc2626'],
      ['규격이탈', oos+'/'+d.sub.length, oos?'#dc2626':'#16a34a'],
      ['표본수', (d.samples||0)+'/'+minS+'+', suff?'#16a34a':'#dc2626']
    ];
    $('#spc-tiles').innerHTML = t.map(function(x){
      return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px">'
        +'<div style="font-size:11px;color:#64748b">'+x[0]+'</div>'
        +'<div style="font-size:19px;font-weight:800;margin-top:4px;color:'+(x[2]||'#1e293b')+'">'+x[1]+'</div></div>';
    }).join('');
    return { oos: oos, ooc: ooc, suff: suff, minS: minS };
  }

  function drawChart(d){
    var W=940, H=360, padL=64, padR=54, padT=16, padB=34;
    var pw=W-padL-padR, ph=H-padT-padB;
    var means = d.sub.map(function(s){ return s.mean; });
    var dataLo=Math.min.apply(null,means), dataHi=Math.max.apply(null,means);
    var dataSpan = (dataHi-dataLo) || Math.abs(dataHi||1)*0.02 || 1;
    var lines = [d.cl, d.usl, d.lsl, d.ucl, d.lcl].filter(function(v){ return v!=null; });
    var allLo=Math.min.apply(null,means.concat(lines)), allHi=Math.max.apply(null,means.concat(lines));
    var lo, hi, pad;
    if((allHi-allLo) > dataSpan*8){
      // 규격(USL/LSL)이 실제 점의 변동폭보다 훨씬 넓으면 점 변동이 보이도록 데이터 중심으로 확대
      lo=dataLo; hi=dataHi; pad=(hi-lo||1)*0.3;
    } else {
      lo=allLo; hi=allHi; pad=(hi-lo||1)*0.15;
    }
    lo-=pad; hi+=pad;
    var n=d.sub.length;
    function X(i){ return padL + (n<=1?0:(i/(n-1))*pw); }
    function Y(v){ return padT + (1-(v-lo)/(hi-lo))*ph; }
    var svg='';
    // y 그리드/라벨
    for(var k=0;k<=4;k++){ var v=lo+(hi-lo)*k/4, y=Y(v);
      svg+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="#eef2f7"/>';
      svg+='<text x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="10" fill="#94a3b8">'+v.toFixed(3)+'</text>';
    }
    function hline(v,color,dash,label){ if(v==null||v<lo||v>hi) return; var y=Y(v);
      svg+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="'+color+'" stroke-width="1.4"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
      svg+='<text x="'+(W-padR+4)+'" y="'+(y+3)+'" font-size="10" fill="'+color+'">'+label+'</text>'; }
    hline(d.usl,'#f59e0b','2 3','USL'); hline(d.lsl,'#f59e0b','2 3','LSL');
    hline(d.ucl,'#7c3aed','5 3','UCL'); hline(d.lcl,'#7c3aed','5 3','LCL');
    hline(d.cl,'#64748b',null,'CL');
    // 선
    var pts=d.sub.map(function(s,i){ return X(i)+','+Y(s.mean); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="#2563eb" stroke-width="1.6"/>';
    // 점 (규격 이탈=빨강, 관리한계 이탈=보라)
    d.sub.forEach(function(s,i){
      var out=(d.usl!=null&&s.mean>d.usl)||(d.lsl!=null&&s.mean<d.lsl);
      var ooc=(d.ucl!=null&&s.mean>d.ucl)||(d.lcl!=null&&s.mean<d.lcl);
      var color = out?'#dc2626':(ooc?'#7c3aed':'#2563eb');
      svg+='<circle cx="'+X(i)+'" cy="'+Y(s.mean)+'" r="'+((out||ooc)?4:2.4)+'" fill="'+color+'"><title>부분군 '+s.i+': '+s.mean+' '+(d.unit||'')+'</title></circle>'; });
    // x 라벨(약 10개)
    var step=Math.max(1,Math.ceil(n/10));
    for(var i=0;i<n;i+=step){ svg+='<text x="'+X(i)+'" y="'+(H-padB+16)+'" text-anchor="middle" font-size="9" fill="#94a3b8">'+d.sub[i].i+'</text>'; }
    $('#spc-svg').innerHTML=svg;
  }

  // 공정능력도(히스토그램 + 정규분포 곡선 + LSL/USL/Cp/Cpk)
  function drawCapChart(d){
    var box = $('#spc-cap');
    if(!box) return;
    if(d.cl==null || d.sigma==null || !d.sigma){ box.innerHTML=''; $('#spc-cap-title').textContent=''; return; }
    var W=940, H=260, padL=54, padR=24, padT=16, padB=34;
    var pw=W-padL-padR, ph=H-padT-padB;
    var means = d.sub.map(function(s){ return s.mean; });
    var lo = Math.min.apply(null, means), hi = Math.max.apply(null, means);
    if(d.lsl!=null) lo = Math.min(lo, d.lsl);
    if(d.usl!=null) hi = Math.max(hi, d.usl);
    var pad = (hi-lo || 1)*0.1; lo -= pad; hi += pad;

    // 히스토그램 (10구간)
    var BINS = 10, width = (hi-lo)/BINS;
    var counts = new Array(BINS).fill(0);
    means.forEach(function(v){
      var idx = width>0 ? Math.min(BINS-1, Math.max(0, Math.floor((v-lo)/width))) : 0;
      counts[idx]++;
    });
    var maxCount = Math.max.apply(null, counts.concat([1]));

    function X(v){ return padL + (v-lo)/(hi-lo)*pw; }
    function Ybar(c){ return padT + (1-c/maxCount)*ph; }

    var svg='';
    // 막대
    for(var b=0;b<BINS;b++){
      var x0=X(lo+b*width), x1=X(lo+(b+1)*width), y=Ybar(counts[b]);
      svg += '<rect x="'+x0+'" y="'+y+'" width="'+Math.max(0,x1-x0-1)+'" height="'+(padT+ph-y)+'" fill="#93c5fd"><title>'+counts[b]+'군</title></rect>';
    }
    // 정규분포 곡선 (히스토그램 최고점에 맞춰 스케일)
    var pts=[];
    for(var i=0;i<=60;i++){
      var v = lo + (hi-lo)*i/60;
      var z = (v-d.cl)/d.sigma;
      var dens = Math.exp(-0.5*z*z);
      pts.push(X(v)+','+(padT+ph*(1-dens)));
    }
    svg += '<polyline points="'+pts.join(' ')+'" fill="none" stroke="#1e3264" stroke-width="1.6"/>';
    // LSL/USL/CL 세로선
    function vline(v,color,dash,label){ if(v==null||v<lo||v>hi) return; var x=X(v);
      svg+='<line x1="'+x+'" y1="'+padT+'" x2="'+x+'" y2="'+(padT+ph)+'" stroke="'+color+'" stroke-width="1.4"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
      svg+='<text x="'+x+'" y="'+(padT-4)+'" text-anchor="middle" font-size="10" fill="'+color+'">'+label+'</text>'; }
    vline(d.lsl,'#f59e0b','2 3','LSL'); vline(d.usl,'#f59e0b','2 3','USL');
    vline(d.cl,'#64748b',null,'X̄̄');
    // x축 눈금
    for(var k=0;k<=4;k++){ var v=lo+(hi-lo)*k/4;
      svg+='<text x="'+X(v)+'" y="'+(H-padB+16)+'" text-anchor="middle" font-size="9" fill="#94a3b8">'+v.toFixed(2)+'</text>'; }
    $('#spc-cap').innerHTML = svg;
    $('#spc-cap').setAttribute('viewBox', '0 0 '+W+' '+H);

    var cp=d.cp, cpk=d.cpk;
    var okColor = (cpk!=null && cpk>=1.33) ? '#16a34a' : (cpk!=null && cpk>=1.0 ? '#f59e0b' : '#dc2626');
    $('#spc-cap-title').innerHTML = '공정능력도 — Cp <b style="color:'+(cp!=null&&cp>=1.33?'#16a34a':'#dc2626')+'">'+(cp!=null?cp:'–')+'</b>'
      +' / Cpk <b style="color:'+okColor+'">'+(cpk!=null?cpk:'–')+'</b>'
      +(cpk!=null ? (cpk>=1.33?' · 양호':cpk>=1.0?' · 주의(관리 필요)':' · 부적합(개선 필요)') : '');
  }

  function render(){
    if(!DATA){ return; }
    var d=DATA;
    // USL/LSL(규격): CP 특별특성 규격이 있으면 그걸 사용, 없으면 검사기DB 규격 그대로
    var usl = (SPEC_OVERRIDE && SPEC_OVERRIDE.usl!=null) ? SPEC_OVERRIDE.usl : d.usl;
    var lsl = (SPEC_OVERRIDE && SPEC_OVERRIDE.lsl!=null) ? SPEC_OVERRIDE.lsl : d.lsl;
    // UCL/LCL(관리기준): CP에 수동 저장한 값이 있으면 그걸 쓰고, 없으면 서버의 X̄-R 관리한계(=CL±3σ/√n)
    var clManual = !!(SPEC_OVERRIDE && SPEC_OVERRIDE.ucl!=null && SPEC_OVERRIDE.lcl!=null);
    function autoCl(sign){
      if(d.cl==null || !d.sigma) return null;
      return +(d.cl + sign*3*d.sigma/Math.sqrt(d.n||5)).toFixed(3);
    }
    var ucl = clManual ? SPEC_OVERRIDE.ucl : (d.ucl!=null ? d.ucl : autoCl(1));
    var lcl = clManual ? SPEC_OVERRIDE.lcl : (d.lcl!=null ? d.lcl : autoCl(-1));
    d = Object.assign({}, DATA, { lsl: lsl, usl: usl, ucl: ucl, lcl: lcl, clManual: clManual });
    if(d.sigma && lsl!=null && usl!=null){
      d.cp  = +(((usl-lsl)/(6*d.sigma)).toFixed(2));
      d.cpk = +(Math.min(usl-d.cl, d.cl-lsl)/(3*d.sigma)).toFixed(2);
    }
    if(d.sigmaOverall && lsl!=null && usl!=null){
      d.pp  = +(((usl-lsl)/(6*d.sigmaOverall)).toFixed(2));
      d.ppk = +(Math.min(usl-d.cl, d.cl-lsl)/(3*d.sigmaOverall)).toFixed(2);
    }
    specAuto = !!SPEC_OVERRIDE;
    var lastT = (d.sub && d.sub.length) ? d.sub[d.sub.length-1].t : null;
    var lastTStr = lastT ? String(lastT).replace('T',' ').slice(0,16) : '';
    $('#spc-chart-title').innerHTML = 'X̄ 관리도 — '+esc($('#spc-item').value)
      + (lastTStr ? ' <span style="font-weight:700;color:#16a34a;font-size:12px;margin-left:10px">&#9679; 최신 측정: '+esc(lastTStr)+'</span>' : '');
    var t=tiles(d);
    drawChart(d);
    drawCapChart(d);
    $('#spc-foot').innerHTML='모델 '+esc(d.model||$('#spc-model').value)+' · 부분군 '+d.n+'개씩 '+d.sub.length+'군 · 표본 '+(d.samples||'')
      +' · Cp/Cpk(단기) '+(d.cp!=null?d.cp:'–')+'/'+(d.cpk!=null?d.cpk:'–')
      +' · Pp/Ppk(장기) '+(d.pp!=null?d.pp:'–')+'/'+(d.ppk!=null?d.ppk:'–')
      +(t.oos?' · <span style="color:#dc2626">빨간점=규격(USL/LSL) 이탈('+t.oos+'군)</span>':'')
      +(t.ooc?' · <span style="color:#7c3aed">보라점=관리기준(UCL/LCL) 이탈('+t.ooc+'군)</span>':'')
      +(specAuto?' · <span style="color:#2563eb">USL/LSL은 CP 규격 적용</span>':'')
      +' · <span style="color:#7c3aed">UCL/LCL '+(d.clManual?'수동 설정값':'자동계산(X̄-R)')+'</span>'
      +(!t.suff?' · <span style="color:#dc2626">⚠ 표본 '+(d.samples||0)+'개 — 공정능력 판단 최소 기준('+t.minS+'개) 미달, 참고용</span>':'');
  }

  async function loadSeries(){
    var model=$('#spc-model').value, item=$('#spc-item').value, n=parseInt($('#spc-n').value,10)||5;
    var from=$('#spc-date-from').value||undefined, to=$('#spc-date-to').value||undefined;
    if(!model||!item) return;
    msg('불러오는 중…');
    try{
      DATA = await AIT_API.getSpcSeries(model, item, n, 80, LINE_ID, from, to);
      if(!DATA || DATA.error || !DATA.sub){ msg('데이터가 없습니다: '+((DATA&&DATA.error)||''),'bad'); DATA=null; $('#spc-svg').innerHTML=''; $('#spc-tiles').innerHTML=''; return; }
      msg('');
      render();
    }catch(e){ DATA=null; msg('⚠ SPC 데이터 조회 실패 — n8n 엔드포인트(ait/spc/series)가 배포됐는지 확인하세요.<br><span style="font-size:11px">'+esc(String(e))+'</span>','bad'); }
  }

  async function init(){
    LINE_ID = resolveLineId();
    try{
      var results = await Promise.all([ AIT_API.getSpcMeta(LINE_ID, window.currentCarId), loadSpecialItems() ]);
      META = results[0];
      SPECIAL_ITEMS = results[1];
      if(!Array.isArray(META)||!META.length){
        msg(LINE_ID ? ('측정항목이 없습니다. ('+car+' 라인의 검사기 데이터가 dashboard DB에 없습니다)') : '측정항목이 없습니다. (n8n ait/spc/meta 응답 비어있음)','bad');
        return;
      }
    }catch(e){
      msg('⚠ SPC 메타 조회 실패 — n8n 엔드포인트 <b>ait/spc/meta · ait/spc/series</b> 를 배포해야 합니다.<br><span style="font-size:11px">'+esc(String(e))+'</span>','bad');
      return;
    }
    var models=[]; META.forEach(function(m){ if(models.indexOf(m.model_name)<0) models.push(m.model_name); });
    $('#spc-model').innerHTML = models.map(function(m){ return '<option value="'+esc(m)+'">'+esc(m)+'</option>'; }).join('');
    $('#spc-model').value = guessModel(models);
    fillItems();
    // 이벤트
    $('#spc-model').onchange=function(){ fillItems(); loadSeries(); };
    $('#spc-item').onchange=function(){ applySpecOverride(); loadSeries(); };
    $('#spc-n').onchange=loadSeries;
    $('#spc-date-from').onchange=loadSeries;
    $('#spc-date-to').onchange=loadSeries;
    $('#spc-date-clear-btn').onclick=function(){ $('#spc-date-from').value=''; $('#spc-date-to').value=''; loadSeries(); };
    $('#spc-spec-save-btn').onclick=_spcSaveSpecEdit;
    loadSeries();
  }
  window.spcSetEditable = function(on){
    spcEditMode = !!on;
    _spcRenderSpecEdit();
  };
  init();
};
