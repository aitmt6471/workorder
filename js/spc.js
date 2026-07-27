/* ══════════════════════════════════════════════════════════════
   SPC (X-bar 관리도) 탭 모듈
   tabs/spc.html 이 로드될 때 initSpcTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
window.initSpcTab = function initSpcTab() {
  var $ = function(s){ return document.querySelector(s); };
  var META = [], DATA = null, SPECIAL_ITEMS = null, SPEC_OVERRIDE = null, specAuto = false, LINE_ID = null;
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
        .map(function(r){ return { name: String(r.ctrl_item||'').trim(), standard: String(r.standard||'').trim() }; })
        .filter(function(x){ return !!x.name; });
    }catch(e){ console.warn('CP 특별특성 조회 실패', e); return []; }
  }
  // CP 관리항목명과 검사기 측정항목명이 텍스트로 안 겹치는 경우를 위한 수동 별칭(정규화된 이름 기준)
  var CTRL_ITEM_ALIAS = {
    'room소모전류': 'room전류(touch)'
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
  // 선택된 측정항목이 CP 특별특성 항목과 매칭되면 규격 상/하한을 구해둔다.
  // 실제 UCL/LCL 반영은 render()에서 "통계 관리한계를 규격 안쪽으로 클램프"하는 방식으로 처리한다.
  function applySpecOverride(){
    $('#spc-ucl').value=''; $('#spc-lcl').value='';
    var match = findSpecialMatch($('#spc-item').value, SPECIAL_ITEMS);
    var parsed = match ? parseSpecRange(match.standard) : null;
    SPEC_OVERRIDE = parsed ? { lsl:parsed.lsl, usl:parsed.usl, unit:parsed.unit, text:match.standard } : null;
    updateSpecLabel();
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
    var base = it ? ('규격 '+(it.lsl!=null?it.lsl:'–')+' ~ '+(it.usl!=null?it.usl:'–')+' '+(it.unit||'')) : '';
    if(SPEC_OVERRIDE){
      $('#spc-spec').innerHTML = 'CP 규격(특별특성) <b>'+esc(SPEC_OVERRIDE.text)+'</b> · 관리한계는 규격('+SPEC_OVERRIDE.lsl+' ~ '+SPEC_OVERRIDE.usl+') 안쪽으로 제한'
        + (base ? ' <span style="color:#94a3b8">'+esc(base)+'</span>' : '');
    } else {
      $('#spc-spec').textContent = base;
    }
  }

  function tiles(d, ucl, lcl){
    var oos = d.sub.filter(function(s){ return s.mean>ucl || s.mean<lcl; }).length;
    var t = [
      ['중심선 X&#773;', d.cl!=null?(+d.cl).toFixed(3):'–', ''],
      ['UCL', (+ucl).toFixed(3), '#dc2626'],
      ['LCL', (+lcl).toFixed(3), '#dc2626'],
      ['σ(추정)', d.sigma!=null?(+d.sigma).toFixed(3):'–', ''],
      ['Cpk', d.cpk!=null?(+d.cpk).toFixed(2):'–', (d.cpk!=null && d.cpk>=1.33)?'#16a34a':'#dc2626'],
      ['관리이탈', oos+'/'+d.sub.length, oos?'#dc2626':'#16a34a']
    ];
    $('#spc-tiles').innerHTML = t.map(function(x){
      return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px">'
        +'<div style="font-size:11px;color:#64748b">'+x[0]+'</div>'
        +'<div style="font-size:19px;font-weight:800;margin-top:4px;color:'+(x[2]||'#1e293b')+'">'+x[1]+'</div></div>';
    }).join('');
    return oos;
  }

  function drawChart(d, ucl, lcl){
    var W=940, H=360, padL=64, padR=54, padT=16, padB=34;
    var pw=W-padL-padR, ph=H-padT-padB;
    var means = d.sub.map(function(s){ return s.mean; });
    var lines = [d.cl, ucl, lcl].filter(function(v){ return v!=null; });
    var ys = means.concat(lines);
    if(d.usl!=null) ys.push(d.usl); if(d.lsl!=null) ys.push(d.lsl);
    var lo=Math.min.apply(null,ys), hi=Math.max.apply(null,ys), pad=(hi-lo||1)*0.15;
    // 규격선이 너무 멀면 제외하고 관리한계 중심으로
    var clo=Math.min.apply(null,means.concat([ucl,lcl])), chi=Math.max.apply(null,means.concat([ucl,lcl]));
    if((hi-lo)>(chi-clo)*6){ lo=clo; hi=chi; pad=(hi-lo||1)*0.3; }
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
    hline(d.cl,'#64748b',null,'CL');
    hline(ucl,'#dc2626','5 4','UCL'); hline(lcl,'#dc2626','5 4','LCL');
    // 선
    var pts=d.sub.map(function(s,i){ return X(i)+','+Y(s.mean); }).join(' ');
    svg+='<polyline points="'+pts+'" fill="none" stroke="#2563eb" stroke-width="1.6"/>';
    // 점
    d.sub.forEach(function(s,i){ var out=s.mean>ucl||s.mean<lcl;
      svg+='<circle cx="'+X(i)+'" cy="'+Y(s.mean)+'" r="'+(out?4:2.4)+'" fill="'+(out?'#dc2626':'#2563eb')+'"><title>부분군 '+s.i+': '+s.mean+' '+(d.unit||'')+'</title></circle>'; });
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
    if(SPEC_OVERRIDE){
      // CP 특별특성 규격 상/하한으로 LSL/USL·Cp·Cpk를 재계산 (장비DB 규격 대신 CP 공식 규격 사용)
      d = Object.assign({}, DATA, { lsl: SPEC_OVERRIDE.lsl, usl: SPEC_OVERRIDE.usl });
      if(d.sigma){
        d.cp  = +(((d.usl-d.lsl)/(6*d.sigma)).toFixed(2));
        d.cpk = +(Math.min(d.usl-d.cl, d.cl-d.lsl)/(3*d.sigma)).toFixed(2);
      }
    }
    var mu=parseFloat($('#spc-ucl').value), ml=parseFloat($('#spc-lcl').value);
    // 통계로 계산된 관리한계가 규격 밖으로 나가면 규격 안쪽으로 잘라준다 (관리한계는 규격보다 넓어질 수 없음)
    var autoUcl = d.ucl, autoLcl = d.lcl, clamped = false;
    if(SPEC_OVERRIDE){
      if(SPEC_OVERRIDE.usl!=null && autoUcl>SPEC_OVERRIDE.usl){ autoUcl = SPEC_OVERRIDE.usl; clamped = true; }
      if(SPEC_OVERRIDE.lsl!=null && autoLcl<SPEC_OVERRIDE.lsl){ autoLcl = SPEC_OVERRIDE.lsl; clamped = true; }
    }
    var ucl=!isNaN(mu)?mu:autoUcl, lcl=!isNaN(ml)?ml:autoLcl;
    specAuto = clamped && isNaN(mu) && isNaN(ml);
    $('#spc-chart-title').textContent='X̄ 관리도 — '+$('#spc-item').value;
    var oos=tiles(d,ucl,lcl);
    drawChart(d,ucl,lcl);
    drawCapChart(d);
    $('#spc-foot').innerHTML='모델 '+esc(d.model||$('#spc-model').value)+' · 부분군 '+d.n+'개씩 '+d.sub.length+'군 · 표본 '+(d.samples||'')+' · Cp '+(d.cp!=null?d.cp:'–')+' / Cpk '+(d.cpk!=null?d.cpk:'–')
      +(oos?' · <span style="color:#dc2626">빨간점=관리한계 이탈('+oos+'군)</span>':'')
      +(specAuto?' · <span style="color:#2563eb">관리한계가 규격 밖으로 나가 규격 안쪽으로 제한됨</span>':((!isNaN(mu)||!isNaN(ml))?' · <span style="color:#2563eb">UCL/LCL 수동 적용</span>':''));
  }

  async function loadSeries(){
    var model=$('#spc-model').value, item=$('#spc-item').value, n=parseInt($('#spc-n').value,10)||5;
    if(!model||!item) return;
    msg('불러오는 중…');
    try{
      DATA = await AIT_API.getSpcSeries(model, item, n, 80, LINE_ID);
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
    $('#spc-ucl').oninput=function(){ specAuto=false; render(); };
    $('#spc-lcl').oninput=function(){ specAuto=false; render(); };
    loadSeries();
  }
  init();
};
