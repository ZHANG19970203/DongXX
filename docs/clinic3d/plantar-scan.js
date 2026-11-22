import {samplePlantarScan, renderPlantarScan} from './pressure-engine.js?v=68';

const example = samplePlantarScan();
export function pressureLegend(){
  const legend=document.createElement('div');
  legend.className='scan-legend';
  legend.setAttribute('aria-label','相对压力从低到高依次为蓝、绿、黄、橙、红');
  for(const [label,color] of [['蓝 · 低','#193ea6'],['绿','#00ba91'],['黄','#ffdc1a'],['橙','#f77514'],['红 · 高','#d32727']]){
    const key=document.createElement('span'),swatch=document.createElement('i');
    swatch.style.backgroundColor=color;key.append(swatch,label);legend.append(key);
  }
  return legend;
}

export function plantarFigure({highlightRight=false}={}){
  const figure=document.createElement('figure');
  figure.className='plantar-scan';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  renderPlantarScan(svg,example,{highlightRight});
  const caption=document.createElement('figcaption');
  caption.textContent=highlightRight?'双足站立压力示例 · 圆圈标出右足高压区':'双足站立 · 同一相对压力色标 · 教学模拟';
  figure.append(svg,pressureLegend(),caption);
  return figure;
}

export function mountPlantarScan({wrap,book,button,record,changed,scanReady}){
  const figure=plantarFigure(), completed=book.get('plantarScan')===true;
  const masks=figure.querySelectorAll('.scan-reveal');
  figure.dataset.state=completed?'ready':'waiting';
  const status=document.createElement('p');status.setAttribute('role','status');
  function finish(){
    if(!figure.isConnected||!wrap.contains(figure)||!scanReady())return;
    book.set('plantarScan',true);
    record('clinic3d_plantar_scan',{left:'typical',right:'low',condition:'bilateral-standing',source:'synthetic'});
    figure.dataset.state='ready';status.textContent='扫描完成。比较两脚内侧中足的接触宽度。';
    start.hidden=true;changed();
  }
  const start=button('开始足底扫描',()=>{
    if(!scanReady())return;
    start.disabled=true;figure.dataset.state='scanning';status.textContent='正在采集双足足印…';
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
    const animations=Array.from(masks,mask=>mask.animate([{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0% 0)'}],{duration:1400,easing:'linear'}));
    animations[0].onfinish=finish;
  });
  start.disabled=!scanReady();
  start.dataset.startScan='true';start.hidden=completed;
  status.textContent=completed?'扫描完成。比较两脚内侧中足的接触宽度。':scanReady()?'请患者双脚赤足，自然站在扫描板上。':'请先坐稳，脱掉双脚的鞋袜。';
  wrap.append(figure,status,start);
}
