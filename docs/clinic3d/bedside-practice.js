import {bothBedsideTests} from './progress-migration.js';
import {createDialogueAudio} from './dialogue-audio.js';
import {preparationDuration,preparationLabel} from './exam-protection.js';
export const PRACTICE_LINES={
 consent:'检查一下您的踝关节有没有松弛。',
 agree:'可以。',
 fast:'有点疼，请先停一下。',
 finish:'两项床旁查体已完成，结果已记录。'
};
export function createBedsidePractice({ui,camera,seek,onSkip=()=>ui.querySelector('[data-back]')?.click(),onComplete=()=>{},onContinue,checkpoint,saveCheckpoint=()=>{},agreed=false,record=()=>{},voiceEnabled=()=>true}){
 const bottom=ui.querySelector('.bedside-bottom'),line=ui.querySelector('.bedside-line');
 ui.classList.add('bedside-practice');ui.querySelector('.bedside-controls').hidden=true;
 const actions=document.createElement('div');actions.className='practice-actions';
 const status=document.createElement('p');status.className='practice-feedback';status.setAttribute('role','status');
 const markers=document.createElement('div');markers.className='practice-markers';ui.append(markers);bottom.append(status,actions);
 const audio=createDialogueAudio({enabled:voiceEnabled,onTalking:()=>{},onStatus:message=>{status.textContent=message;}});
 let transferSpeech=null;
 let active=true,stage='consent',test=0,pose,transfer=0,amount=0,drag=null,hold=0,loaded=false,grips={fixedWeight:0,heelWeight:0},attempts=0,errors=0,completed=[],returnTime=null,demo=null,currentSample=0,lastAspect=camera.aspect;
 const origin=performance.now(),omitted=new Set(checkpoint?.omitted||[]);
 if(checkpoint){
  test=checkpoint.test===1?1:0;completed=[...new Set(checkpoint.completed||[])];
  grips={...grips,...checkpoint.grips};attempts=checkpoint.attempts||0;errors=checkpoint.errors||0;
 }
 const elapsed=()=>Math.round((performance.now()-origin)/1000)+(checkpoint?.elapsedSeconds||0);
 let retryNeedsConsent=!!checkpoint?.retryNeedsConsent;
 let pressElapsed=0;
 let path=null;
 const svgNS='http://www.w3.org/2000/svg';
 const label=()=>test===0?'前抽屉试验':'内翻加压试验';
 const emit=(type,payload={})=>record('clinic3d_bedside_'+type,{test:label(),stage,...payload,teachingSimulation:true,measuredForce:false});
 async function say(role,text){
  const start=performance.now(),source=stage;
  while(active&&stage===source){
   const result=await audio.speak(role==='patient'?'陈女士':'林治疗师',text);
   if(!result.failed||!active||stage!==source)break;
   await new Promise(resolve=>{
    const retry=button('重播这句',()=>{retry.remove();resolve();},'replay-voice');
    const observer=new MutationObserver(()=>{if(!retry.isConnected){observer.disconnect();resolve();}});
    observer.observe(ui,{childList:true,subtree:true});
   });
  }
  const remaining=Math.max(1500,Math.min(6000,text.length*65))-(performance.now()-start);if(active&&remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));};
 function button(text,fn,attr){const b=document.createElement('button');b.type='button';b.textContent=text;if(attr)b.dataset.practice=attr;b.onclick=fn;actions.append(b);return b;}
 function clear(){actions.replaceChildren();markers.replaceChildren();status.textContent='';drag=null;}
 function draw(value){currentSample=value;if(lastAspect!==camera.aspect){path=null;drag=null;hold=0;loaded=false;}lastAspect=camera.aspect;pose=seek(value,{...grips,showForces:stage==='demo'||stage==='pressing',conversation:stage==='consent'?'initial':stage==='retry'&&retryNeedsConsent?'retry':null});lastAspect=camera.aspect;positionMarkers();}
 function baseline(){return test===0?6.55:10.97;}
 function poseAmount(value){amount=value;draw((test===0?6.6:11.25)+value*(test===0?1.45:1.55));}
 function startDemo(){
  demo={elapsed:0,from:stage,grips:{...grips}};emit('demo',{from:stage});
  grips={fixedWeight:0,heelWeight:0};setStage('demo');draw(baseline());
 }
 function endDemo(){if(!demo)return;const previous=demo;demo=null;grips=previous.grips;setStage(previous.from,true);}
 function setStage(next,resuming=false){audio.cancel();stage=next;ui.dataset.practiceStage=next;ui.dataset.practiceTest=String(test);clear();
  if(next==='consent'){
   draw(-preparationDuration);line.textContent='检查前，先向陈女士说明目的并征求同意。';
   const consent=button('说明检查并征求同意',async()=>{
     consent.disabled=true;
     emit('consent',{agreed:false});
     line.textContent='林治疗师：'+PRACTICE_LINES.consent;
     await say('therapist',PRACTICE_LINES.consent);
     if(!active||stage!=='consent')return;
     line.textContent='陈女士：'+PRACTICE_LINES.agree;
     await say('patient',PRACTICE_LINES.agree);
     if(!active||stage!=='consent')return;
     emit('consent',{agreed:true});
     setStage('protection');
   },'consent');
  }else if(next==='protection'){transfer=resuming?Math.min(preparationDuration,checkpoint?.phaseTime||0):0;draw(transfer-preparationDuration);line.textContent=preparationLabel(transfer);if(!resuming)emit('protection_started');
  }else if(next==='transfer'){transfer=resuming?Math.min(6.2,checkpoint?.phaseTime||0):0;draw(transfer);line.textContent='陈女士，您先坐到床边，再慢慢躺下。';const ticket={};transferSpeech=ticket;say('therapist',line.textContent).finally(()=>{if(transferSpeech===ticket)transferSpeech=null;});}
  else if(next==='fixed'||next==='heel'){
   draw(baseline());line.textContent=next==='fixed'?(test===1?'内翻加压试验：右手应固定哪里？':label()+'：左手应固定在哪里？'):(test===1?'左手虎口应贴住哪里？':label()+'：右手应托握哪里？');
   let targets=next==='fixed'?[['胫骨下段','shin'],['前足','toes'],['足跟','heel']]:[['足跟','heel'],['脚趾','toes'],['小腿中段','shin']];
   if(test===1)targets=next==='fixed'?[['小腿中段','oppositeShin'],['胫骨下缘（踝关节上方）','shin'],['前足','toes']]:[['足内侧缘','oppositeHeel'],['前足','toes'],['足外侧缘（靠近足跟）','heel']];
   for(const [i,[text,id]] of targets.entries()){const b=document.createElement('button');b.type='button';b.textContent=String(test===1?i+1:['shin','heel','toes'].indexOf(id)+1);b.setAttribute('aria-label',text);b.dataset.target=id;b.onclick=()=>{
    const correct=id===(stage==='fixed'?'shin':'heel');emit('placement',{target:id,location:text,hand:(stage==='fixed')===(test===1)?'right':'left',correct});
    if(!correct){errors++;status.textContent=test===1?(stage==='fixed'?'右手整掌固定踝关节上方的胫骨下缘。':'左手虎口贴住靠近足跟的足外侧缘。'):stage==='fixed'?'固定点在踝关节上方的小腿下段。':'右手兜住跟骨，从后足带动。';return;}
    if(stage==='fixed'){grips.fixedWeight=1;setStage('heel');}else{grips.heelWeight=1;setStage('move');}
   };markers.append(b);button(b.textContent+' · '+text,()=>b.click());}
   button('看双手示范',startDemo,'demo');positionMarkers();
  }else if(next==='move'||next==='return'){
   const returning=next==='return';
   amount=returning?1:0;hold=0;loaded=returning;returnTime=null;path=null;draw(baseline());
   if(returning)poseAmount(1);else if(!resuming)attempts++;
   line.textContent=test===0?'固定小腿，沿直箭头带动足跟向患者前方平移。稍停，再缓慢回位。':returning?'压力已解除。沿弧线缓慢回到中立位。':'右手稳住胫骨下缘，左手虎口贴住足外侧缘，带动跟骨内收、内翻。';
   const handle=document.createElement('button');handle.type='button';handle.className='practice-handle';handle.dataset.target='drag';handle.textContent=test===0?'带动足跟':returning?'缓慢回位':'内收、内翻';handle.setAttribute('aria-label',handle.textContent+'，也可沿箭头使用方向键');markers.append(handle);
   const guide=document.createElement('span');guide.className='practice-direction';markers.append(guide);
   if(test===1){
    guide.hidden=true;
    const arc=document.createElementNS(svgNS,'svg');arc.classList.add('inversion-arc');arc.setAttribute('aria-hidden','true');
    for(const name of ['polyline','polygon'])arc.append(document.createElementNS(svgNS,name));
    markers.append(arc);
   }
   const leader=document.createElement('span');leader.className='heel-leader';markers.append(leader);
   handle.onpointerdown=e=>{if(drag||returnTime!==null)return;e.preventDefault();handle.setPointerCapture(e.pointerId);const start=pointAt(amount);drag={x:e.clientX-start.x,y:e.clientY-start.y,last:performance.now(),lastAmount:amount,pointer:e.pointerId};emit('motion_start',{attempt:attempts});};
   handle.onpointermove=e=>{if(drag?.pointer!==e.pointerId)return;const {value,lateral}=readGesture(e.clientX-drag.x,e.clientY-drag.y);const elapsed=performance.now()-drag.last;
    if(value<-.16||lateral>travel()*.40){fail('direction','方向不对，请先回到原位，重新确认箭头方向。');return;}
    if(value>1.25||(elapsed>12&&Math.abs(value-drag.lastAmount)/elapsed>.0032)){fail('too_fast',PRACTICE_LINES.fast);return;}
    drag.last=performance.now();drag.lastAmount=value;move(Math.max(0,Math.min(1,value)));
   };
   handle.onpointerup=e=>{if(drag?.pointer!==e.pointerId)return;drag=null;if(returning){status.textContent='继续缓慢回位。';return;}if(loaded&&amount<=.10)success();else{status.textContent=test===1?'尚未到达终末位，请重新操作。':'请连续完成带动、保持和回位。';emit('incomplete',{amplitude:amount,held:loaded});hold=0;loaded=false;returnTime=0;}};
   handle.onpointercancel=e=>{if(drag?.pointer===e.pointerId)fail('interrupted','操作中断，请重新开始。');};
   handle.onkeydown=e=>{
    const keys={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowRight:[1,0],ArrowLeft:[-1,0]},key=keys[e.key];if(!key)return;e.preventDefault();
    if(drag||returnTime!==null)return;
    const a=pointAt(Math.max(0,amount-.04)),b=pointAt(Math.min(1,amount+.04)),dx=b.x-a.x,dy=b.y-a.y;
    const alignment=(key[0]*dx+key[1]*dy)/Math.hypot(dx,dy);
    if(Math.abs(alignment)<.55){status.textContent='请使用与箭头方向最接近的方向键。';return;}
    move(Math.max(0,Math.min(1,amount+Math.sign(alignment)*.035)));if(stage==='move'&&test===0&&loaded&&amount<=.10)success();
   };
   button('停止检查',()=>fail('student_stop','检查已停止。先让患者放松，再决定是否重新尝试。'),'stop');
   if(!returning)button('看双手示范',startDemo,'demo');else handle.focus();
   positionMarkers();
  }else if(next==='pressure'){
   draw(12.8);line.textContent='保持终末位，在右外踝外侧轻轻加压。';
   const press=()=>{if(stage!=='pressure')return;emit('lateral_pressure',{location:'lateral_malleolus',atEndRange:true});pressElapsed=0;setStage('pressing');};
   const pin=document.createElement('button');pin.type='button';pin.textContent='＋';pin.dataset.target='malleolus';pin.setAttribute('aria-label','在右外踝外侧轻压');pin.onclick=press;markers.append(pin);
   button('轻压外踝外侧',press,'press').focus();button('停止检查',()=>fail('student_stop','检查已停止。'),'stop');positionMarkers();
  }else if(next==='pressing'){
   line.textContent='保持跟骨位置，轻压后松开。';draw(12.8);
  }else if(next==='demo'){
   line.textContent=test===0?'左手整掌贴稳小腿，右手托住足跟。红箭头显示施力方向。':'右手固定胫骨下缘，左手虎口贴住足外侧缘。';
   button('返回自己操作',endDemo,'end-demo');
  }else if(next==='retry'){
   if(retryNeedsConsent){
    draw(baseline());
    const retry=button('休息后询问是否继续',async()=>{retry.disabled=true;line.textContent='可以吗？';await say('therapist',line.textContent);if(!active||stage!=='retry')return;status.textContent='陈女士：好。';await say('patient','好。');if(active&&stage==='retry'){emit('consent',{agreed:true,retry:true});grips={fixedWeight:0,heelWeight:0};setStage('fixed');}},'retry');
    button('结束本次检查',onSkip,'leave');
   }else button('重新操作',()=>setStage('move'),'retry');
  }else if(next==='next'){draw(10.2);
   line.textContent='陈女士保持仰卧，接下来做内翻加压试验。';
   button('开始内翻加压试验',()=>{test=1;grips={fixedWeight:0,heelWeight:0};setStage('neutral');},'next-test');
  }else if(next==='neutral'){
   draw(10.2);line.textContent='陈女士仰卧。先将右踝摆在中立位。';
   button('摆至中立位',()=>{transfer=0;setStage('positioning');},'neutral');
  }else if(next==='positioning'){
   line.textContent='将右脚摆正，足底与小腿约呈直角。';draw(10.2);
  }else if(next==='interpret'){draw(15);
   line.textContent='病例资料提示右侧前移、内翻倾斜较对侧略大。怎样解释这一发现？';
   button('提示机械性松弛，还需结合病史和功能检查',()=>{emit('interpretation',{correct:true});setStage('complete');},'interpret-correct');
   button('可以直接确定韧带完全断裂',()=>{errors++;emit('interpretation',{correct:false});status.textContent='单凭手法检查不能确定韧带完全断裂，请重新选择。';},'interpret-wrong');
  }else if(next==='complete'){draw(15);
   line.textContent=omitted.size?'床旁练习已结束，跳过的操作已单独记录。':PRACTICE_LINES.finish;
   status.textContent='记录的是本次学习操作，不是患者实测位移、角度或施力大小。';
   const result={completed:[...completed],attempts,errors,elapsedSeconds:elapsed(),scope:'simulated-operation',clinicalSkillAssessed:false};if(!omitted.size){
    if(!bothBedsideTests(result)){
     test=completed.includes('anterior_drawer')?1:0;grips={fixedWeight:0,heelWeight:0};
     return setStage(test===1?'neutral':'fixed');
    }
    if(!resuming)emit('completed',result);
    onComplete(result);
   }
   button(onContinue?'继续接诊':'结束本项练习',()=>omitted.size?onSkip():(onContinue||(()=>ui.querySelector('[data-back]').click()))(),'continue');
  }
  snapshot();
 }
 function snapshot(){
  if(stage!=='demo')saveCheckpoint({stage,test,omitted:[...omitted],completed:[...completed],grips:{...grips},attempts,errors,retryNeedsConsent,phaseTime:transfer,elapsedSeconds:elapsed()});
 }
 function travel(){return markers.clientWidth<450?65:100;}
 function project(v){const r=markers.getBoundingClientRect(),p=v.clone().project(camera);return {x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2};}
 function gesturePath(){
  const origin=project(pose.heel),points=[];
  for(let i=0;i<=16;i++){
   const t=i/16,v=pose.heel.clone();
   if(test===0)v.addScaledVector(pose.anterior,.1*t);
   else v.addScaledVector(pose.sole,.1*(Math.cos(t*.86)-1)).addScaledVector(pose.tiltDirection,.1*Math.sin(t*.86));
   const q=project(v);points.push({x:q.x-origin.x,y:q.y-origin.y});
  }
  const length=points.slice(1).reduce((s,q,i)=>s+Math.hypot(q.x-points[i].x,q.y-points[i].y),0);
  return points.map(q=>({x:q.x*travel()/length,y:q.y*travel()/length}));
 }
 function pointAt(t){const f=t*16,i=Math.min(15,Math.floor(f)),a=path[i],b=path[i+1];return {x:a.x+(b.x-a.x)*(f-i),y:a.y+(b.y-a.y)*(f-i)};}
 function readGesture(x,y){
  let best={value:0,lateral:Infinity};
  for(let i=0;i<16;i++){
   const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y;
   let u=((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy);
   if(i>0)u=Math.max(0,u);if(i<15)u=Math.min(1,u);
   const lateral=Math.hypot(x-a.x-u*dx,y-a.y-u*dy);if(lateral<best.lateral)best={value:(i+u)/16,lateral};
  }return best;
 }
 function positionMarkers(){if(!pose)return;
  const points=[...markers.querySelectorAll('[data-target]:not(.practice-handle)')].map(b=>{
   const id=b.dataset.target;
   let point=id==='shin'?pose.fixed:id==='toes'?pose.bigToe:id==='malleolus'?pose.malleolus:pose.heel;
   if(id==='oppositeShin'||id==='oppositeHeel'){
     if(id==='oppositeShin')point=pose.fixed.clone().lerp(pose.shin,.47);
     else{point=pose.heel.clone();point.x=2*pose.neutral.x-point.x;}
   }
   const p=project(point);
   return {b,...p,top:p.y};
  }).sort((a,b)=>a.y-b.y);
  for(let i=0;i<points.length;i++){
   const q=points[i];for(const other of points.slice(0,i))if(Math.abs(q.x-other.x)<34)q.top=Math.max(q.top,other.top+33);
   q.b.style.left=q.x+'px';q.b.style.top=q.top+'px';q.b.style.setProperty('--pin-rise',(q.top-q.y)+'px');
  }
  const guide=markers.querySelector('.practice-direction');if(guide){
    if(!path)path=gesturePath();
    const p=project(pose.heel),d=path[16],dx=p.x>markers.clientWidth*.6?-1:1;
    const minX=Math.min(...path.map(q=>q.x)),maxX=Math.max(...path.map(q=>q.x));
    const x=Math.max(48-minX,Math.min(markers.clientWidth-48-maxX,p.x+dx*Math.min(140,markers.clientWidth*.26))),y=p.y-8;
    const h=markers.querySelector('.practice-handle'),leader=markers.querySelector('.heel-leader');
    const q=pointAt(amount),hx=x+q.x,hy=y+q.y;h.style.left=hx+'px';h.style.top=hy+'px';
    leader.style.left=p.x+'px';leader.style.top=p.y+'px';leader.style.width=Math.hypot(hx-p.x,hy-p.y)+'px';leader.style.transform=`rotate(${Math.atan2(hy-p.y,hx-p.x)}rad)`;
    guide.style.left=x+'px';guide.style.top=y+'px';guide.style.transform=`rotate(${Math.atan2(d.y,d.x)}rad)`;guide.style.width=travel()+'px';
    const arc=markers.querySelector('.inversion-arc');if(arc){
     arc.style.left=x+'px';arc.style.top=y+'px';arc.firstChild.setAttribute('points',path.map(q=>q.x+','+q.y).join(' '));
     const end=stage==='return'?path[0]:d,prev=stage==='return'?path[1]:path[15],angle=Math.atan2(end.y-prev.y,end.x-prev.x),cx=Math.cos(angle),cy=Math.sin(angle);
     arc.lastChild.setAttribute('points',[[end.x,end.y],[end.x-12*cx+5*cy,end.y-12*cy-5*cx],[end.x-12*cx-5*cy,end.y-12*cy+5*cx]].map(p=>p.join(',')).join(' '));
    }
  }
 }
 function move(value){
   if(stage!=='move'&&stage!=='return')return;
   returnTime=null;poseAmount(value);
   if(test===1){
     if(stage==='return'&&value<=.001)success();
     else if(stage==='move'&&value>=.999)setStage('pressure');
   }else status.textContent=loaded?'现在缓慢回到原位。':value>=.75?'保持片刻，然后缓慢回位。':'缓慢带动，留意患者反应。';
 }
 function fail(kind,message){if(['direction','too_fast'].includes(kind))errors++;emit('motion_feedback',{kind,amplitude:amount});retryNeedsConsent=kind==='too_fast'||kind==='student_stop';if(retryNeedsConsent)grips={fixedWeight:0,heelWeight:0};drag=null;returnTime=null;amount=0;hold=0;loaded=false;draw(baseline());setStage('retry');line.textContent=message;if(kind==='too_fast')say('patient',PRACTICE_LINES.fast);}
 function success(){emit('motion_complete',{held:true,returned:true,amplitudeIsInterfaceScale:true});const key=test===0?'anterior_drawer':'inversion_stress';if(!omitted.has(test)&&!completed.includes(key))completed.push(key);draw(baseline());
  if(test===0&&completed.includes('inversion_stress')){test=1;setStage('interpret');}else setStage(test===0?'next':'interpret');}
 function keydown(e){if(!active)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(stage==='move')fail('student_stop','检查已停止。先让患者放松，再决定是否重新尝试。');else if(stage==='demo'){endDemo();}else ui.querySelector('[data-back]')?.click();}if(e.key==='Tab'){const nodes=[...ui.querySelectorAll('button')].filter(x=>!x.disabled&&x.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(!ui.contains(document.activeElement)){e.preventDefault();first.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
 function visibility(){if(document.hidden)snapshot();if(document.hidden&&['move','pressure','pressing','return'].includes(stage)&&(drag||amount>0))fail('interrupted','操作已暂停。返回后确认患者状态，再重新尝试。');}
 window.addEventListener('pagehide',snapshot);
 document.addEventListener('keydown',keydown,true);document.addEventListener('visibilitychange',visibility);
 const resumeStage=agreed&&checkpoint?.stage==='consent'?null:checkpoint?.stage;
 // Resume a gesture at a stable pose, retaining completed manoeuvres.
 const restore={positioning:'fixed',pressing:'return'};
 setStage((restore[resumeStage]||resumeStage)||(agreed?'protection':'consent'),!!resumeStage);
 actions.querySelector('button')?.focus();
 function skip(){
   if(!active)return;
   if(stage==='complete'){actions.querySelector('[data-practice=continue]').click();return;}
   if(stage==='demo'){endDemo();return;}
   if(stage==='next'){actions.querySelector('[data-practice="next-test"]').click();return;}
   emit('step_skipped',{assessmentCredit:false});omitted.add(test);
   if(stage==='consent'||(stage==='retry'&&retryNeedsConsent)){onSkip();return;}
   if(stage==='fixed')grips.fixedWeight=1;
   if(stage==='heel')grips.heelWeight=1;
   const next={protection:'transfer',transfer:'fixed',neutral:'fixed',positioning:'fixed',fixed:'heel',heel:'move',move:test===0?'next':'pressure',pressure:'return',pressing:'return',return:'interpret',retry:test===0?'next':'interpret',interpret:'complete'}[stage];
   if(next)setStage(next);else onSkip();
 }
 return {skip,changeView(){path=null;if(stage==='move'&&(drag||amount>0)){drag=null;amount=0;hold=0;loaded=false;returnTime=null;draw(baseline());status.textContent='已切换视角，从原位开始。';}else draw(currentSample);},tick(dt){
  if(camera.aspect!==lastAspect)draw(currentSample);
  if(document.hidden)return;
  if(stage==='protection'){transfer=Math.min(preparationDuration,transfer+dt);draw(transfer-preparationDuration);line.textContent=preparationLabel(transfer);if(transfer>=preparationDuration){emit('protection_completed',{mask:true,gloves:true,handHygieneDemonstration:true,handHygieneEpisodes:1,dispenserPresses:1,sequenceSeconds:preparationDuration});setStage('transfer');}}
  else if(stage==='transfer'){transfer=Math.min(6.2,transfer+dt);draw(transfer);if(transfer>=6.2&&!transferSpeech)setStage('fixed');}
  else if(stage==='positioning'){transfer=Math.min(.77,transfer+dt);draw(10.2+transfer);if(transfer>=.77){emit('position',{patient:'supine',ankle:'neutral'});setStage('fixed');}}
  else if(stage==='pressing'){pressElapsed=Math.min(.85,pressElapsed+dt);draw(12.8+pressElapsed);if(pressElapsed>=.85)setStage('return');}
  else if(stage==='demo'&&demo){
   demo.elapsed+=dt;const t=demo.elapsed;
   const between=(a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a)));
   grips.fixedWeight=between(0,.55);grips.heelWeight=between(.28,.88);
   if(test===0){
     poseAmount(between(1.3,2.9)*(1-between(3.65,5.15)));
     if(t>=5.55)endDemo();
   }else{
     draw(t<1.3?10.97:Math.min(15,11.25+t-1.3));
     line.textContent=t<1.3?'右踝中立，右手固定胫骨下缘，左手虎口贴住足外侧缘。':t<2.85?'从足跟带动跟骨内收、内翻。':t<3.7?'保持终末位，在外踝外侧轻轻加压。':'解除压力，缓慢回位。';
     if(t>=5.6)endDemo();
   }
  }
  else if(stage==='move'){if(test===0&&returnTime===null&&amount>=.75){hold+=dt;if(hold>=.55)loaded=true;}else if(!loaded)hold=0;if(returnTime!==null){returnTime+=dt;poseAmount(Math.max(0,amount-dt*.6));if(amount===0)returnTime=null;}}
  positionMarkers();
 },close(){snapshot();active=false;audio.dispose();window.removeEventListener('pagehide',snapshot);document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);markers.remove();},getState:()=>({stage,test,amount,loaded,completed:[...completed]})};
}
