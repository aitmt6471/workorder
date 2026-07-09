/* ══════════════════════════════════════════════════════════════
   SPC (X-bar 관리도) 탭 모듈
   tabs/spc.html 이 로드될 때 initSpcTab() 을 호출한다.
   ══════════════════════════════════════════════════════════════ */
window.initSpcTab = function initSpcTab() {
  var $ = function(s){ return document.querySelector(s); };
  var META = [], DATA = null;
  var car = window.currentCar || '';
  $('#spc-car').textContent = car ? '· 아이템: ' + car : '';

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
    var model = $('#spc-model').value;
    var items = META.filter(function(m){ return m.model_name===model; });
    $('#spc-item').innerHTML = items.map(function(i){ return '<option value="'+esc(i.item_name)+'">'+esc(i.item_name)+' ('+esc(i.unit||'')+')</option>'; }).join('');
    updateSpecLabel();
  }
  function updateSpecLabel(){
    var it = META.find(function(m){ return m.model_name===$('#spc-model').value && m.item_name===$('#spc-item').value; });
    $('#spc-spec').textContent = it ? ('규격 '+(it.lsl!=null?it.lsl:'–')+' ~ '+(it.usl!=null?it.usl:'–')+' '+(it.unit||'')) : '';
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

  function render(){
    if(!DATA){ return; }
    var d=DATA;
    var mu=parseFloat($('#spc-ucl').value), ml=parseFloat($('#spc-lcl').value);
    var ucl=!isNaN(mu)?mu:d.ucl, lcl=!isNaN(ml)?ml:d.lcl;
    $('#spc-chart-title').textContent='X̄ 관리도 — '+$('#spc-item').value;
    var oos=tiles(d,ucl,lcl);
    drawChart(d,ucl,lcl);
    $('#spc-foot').innerHTML='모델 '+esc(d.model||$('#spc-model').value)+' · 부분군 '+d.n+'개씩 '+d.sub.length+'군 · 표본 '+(d.samples||'')+' · Cp '+(d.cp!=null?d.cp:'–')+' / Cpk '+(d.cpk!=null?d.cpk:'–')
      +(oos?' · <span style="color:#dc2626">빨간점=관리한계 이탈('+oos+'군)</span>':'')
      +((!isNaN(mu)||!isNaN(ml))?' · <span style="color:#2563eb">UCL/LCL 수동 적용</span>':'');
  }

  async function loadSeries(){
    var model=$('#spc-model').value, item=$('#spc-item').value, n=parseInt($('#spc-n').value,10)||5;
    if(!model||!item) return;
    msg('불러오는 중…');
    try{
      DATA = await AIT_API.getSpcSeries(model, item, n, 80);
      if(!DATA || DATA.error || !DATA.sub){ msg('데이터가 없습니다: '+((DATA&&DATA.error)||''),'bad'); DATA=null; $('#spc-svg').innerHTML=''; $('#spc-tiles').innerHTML=''; return; }
      msg('');
      render();
    }catch(e){ DATA=null; msg('⚠ SPC 데이터 조회 실패 — n8n 엔드포인트(ait/spc/series)가 배포됐는지 확인하세요.<br><span style="font-size:11px">'+esc(String(e))+'</span>','bad'); }
  }

  async function init(){
    try{
      META = await AIT_API.getSpcMeta();
      if(!Array.isArray(META)||!META.length){ msg('측정항목이 없습니다. (n8n ait/spc/meta 응답 비어있음)','bad'); return; }
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
    $('#spc-item').onchange=function(){ updateSpecLabel(); loadSeries(); };
    $('#spc-n').onchange=loadSeries;
    $('#spc-ucl').oninput=render; $('#spc-lcl').oninput=render;
    loadSeries();
  }
  init();
};
