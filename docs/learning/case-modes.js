import {items as previousItems,el,supportFigure} from './case-items.js';
import {sampleGait} from '../clinic3d/gait-lesson.js';
import {bank,grade,ownerKey} from './exam-records.js';

const items=bank.items, free=document.querySelector('#freeMode'),test=document.querySelector('#testMode');
const exam=document.querySelector('#caseExam'),projects=document.querySelector('#freeProjects');
let profileKey='',draft=null,history=[],storageOK=true,submitting=false;
function save(which,value){try{localStorage.setItem(profileKey+which,JSON.stringify(value));}catch{storageOK=false;}}
function get(which,fallback){try{return JSON.parse(localStorage.getItem(profileKey+which))??fallback;}catch{return fallback;}}
function initialize(){
  const p=window.DXXHub?.profile(), key=p?'dxx_case_test_v1_'+ownerKey(p):'';
  if(key===profileKey)return;
  profileKey=key;draft=key?get('_draft',null):null;history=key?get('_history',[]):[];storageOK=true;
  if(!Array.isArray(history))history=[];
  if(draft&&!draft.version&&draft.answers?.length===previousItems.length){
    draft.answers=[...draft.answers,...Array(items.length-previousItems.length).fill(null)];
    draft.version=bank.version;save('_draft',draft);
  }
  if(draft&&(draft.version!==bank.version||!Array.isArray(draft.answers)||draft.answers.length!==items.length||
    !Number.isInteger(draft.index)||draft.index<0||draft.index>items.length||history.some(r=>r.id===draft.id)))draft=null;
  toggle('free');
}
function toggle(mode){
  free.setAttribute('aria-pressed',String(mode==='free'));test.setAttribute('aria-pressed',String(mode==='test'));
  projects.hidden=mode==='test';exam.hidden=mode==='free';document.body.dataset.studyMode=mode;
  if(mode==='test')render();
}
function button(text,fn,main=false){const b=el('button',text,main?'primary':'');b.type='button';b.onclick=fn;return b;}
function start(){draft={id:crypto.randomUUID(),version:bank.version,index:0,answers:Array(items.length).fill(null)};save('_draft',draft);render(true);}
function move(index){draft.index=index;save('_draft',draft);render(true);}
function heading(text){const h=el('h3',text);h.tabIndex=-1;exam.append(h);return h;}
function notice(){if(!storageOK)exam.append(el('p','浏览器未能保存这次记录，请在离开前保存成绩和证书。'));}
function certificateLink(){
  const a=el('a','查看学习完成证书','exam-certificate');a.href='certificate/index.html?scope=exam';return a;
}
function counts(answers){
  return {answered:answers.filter(Number.isInteger).length,skipped:answers.filter(a=>a==='skip').length,blank:answers.filter(a=>a==null).length};
}
async function finish(b){
  if(submitting||!draft)return;
  const current=profileKey, attempt=draft, p=window.DXXHub.profile();
  if(!p||current!=='dxx_case_test_v1_'+ownerKey(p)){initialize();return;}
  submitting=true;exam.querySelectorAll('button').forEach(control=>control.disabled=true);b.textContent='正在评分…';
  try{
    const result=await grade(p,attempt);
    if(profileKey!==current)return;
    const saved=get('_history',history);
    history=[result,...saved.filter(x=>x.id!==result.id)];
    save('_history',history);
    if(get('_draft',null)?.id===attempt.id)save('_draft',null);
    draft=null;showResult(result,true);
  }catch(e){
    if(profileKey===current){render();const error=el('p',e.message||'评分服务暂时不可用，作答已保留，请再次交卷。');error.setAttribute('role','alert');exam.prepend(error);}
  }finally{submitting=false;}
}
function render(focus=false){
  exam.replaceChildren();
  if(!draft){
    heading('人体运动学知识测试');
    exam.append(el('p','共 30 题，每题 1 分。答错、跳过和交卷时漏答均得 0 分。达到 25 分即完成学习，获得平台证书。'),button(history.length?'重新测试':'开始测试',start,true));
    if(history.length)exam.append(button('查看上次结果',()=>showResult(history[0],true)));
    if(history.some(r=>r.version===bank.version&&r.passed))exam.append(certificateLink());
    notice();return;
  }
  const i=draft.index,q=items[i];let h;
  if(!q){
    const c=counts(draft.answers);
    h=heading('核对作答');exam.append(el('p',`已答 ${c.answered} 题，已跳过 ${c.skipped} 题，漏答 ${c.blank} 题。交卷前可以返回任一题修改。`));
    const submit=button('交卷并评分',e=>finish(e.currentTarget),true);exam.append(submit);
    const listing=el('div',null,'exam-list');items.forEach((item,n)=>listing.append(button((n+1)+' · '+item.title+'　'+(draft.answers[n]==='skip'?'已跳过':draft.answers[n]==null?'未作答':'已作答'),()=>move(n))));exam.append(listing);
  }else{
    exam.append(el('small',`第 ${i+1} / ${items.length} 题　·　${q.title}　·　1 分`));h=heading(q.prompt);
    if(q.id==='support')exam.append(supportFigure(sampleGait));
    const choices=el('fieldset',null,'exam-options');choices.setAttribute('aria-label',q.prompt);
    const controls=el('div',null,'exam-actions');
    const next=button(i===items.length-1?'核对作答':'下一题',()=>move(i+1),true);
    q.choices.forEach((c,n)=>{const label=el('label'),radio=el('input');radio.type='radio';radio.name='caseAnswer';radio.value=String(n);radio.checked=draft.answers[i]===n;
      radio.onchange=()=>{draft.answers[i]=n;save('_draft',draft);next.disabled=false;};label.append(radio,el('span',c));choices.append(label);});
    next.disabled=!Number.isInteger(draft.answers[i]);
    if(i>0)controls.append(button('上一题',()=>move(i-1)));
    controls.append(button('跳过此步骤',()=>{draft.answers[i]='skip';move(i+1);}),button('提前交卷',()=>move(items.length)),next);exam.append(choices,controls);
  }
  notice();if(focus)h.focus({preventScroll:true});
}
function showResult(r,focus){
  exam.replaceChildren();const legacy=!r.version&&r.total===previousItems.length, questions=legacy?previousItems:items;
  const h=heading(legacy?'旧版 5 题测试记录':`测试成绩　${r.correct} / ${r.total} 分`);
  const c=counts(r.answers);
  exam.append(el('p',`答对 ${r.correct} 题，答错 ${c.answered-r.correct} 题，跳过 ${c.skipped} 题，未答 ${c.blank} 题。`));
  if(legacy)exam.append(el('p','本次为原 5 题练习。完成新版 30 题测试并达到 25 分即可获证。'));
  else if(r.passed)exam.append(el('p','已完成学习，平台学习完成证书已签发。'),certificateLink());
  else exam.append(el('p',`本次距达标还差 ${bank.passScore-r.correct} 分。可查看逐题解析后重新测试。`));
  exam.append(button('返回自由模式',()=>toggle('free')),button('重新测试',start));
  questions.forEach((q,i)=>{const a=r.answers[i],ok=a===q.key,row=el('details');
    row.append(el('summary',`${i+1}. ${q.title}　${ok?'正确 · 1 分':a==='skip'?'已跳过 · 0 分':a==null?'未作答 · 0 分':'答错 · 0 分'}`),el('p',q.prompt));
    if(q.id==='support')row.append(supportFigure(sampleGait));
    row.append(el('p','你的选择：'+(q.choices[a]||(a==='skip'?'已跳过':'未作答'))),el('p','正确答案：'+q.choices[q.key]),el('p',q.why));exam.append(row);});
  notice();if(focus)h.focus({preventScroll:true});
}
free.onclick=()=>toggle('free');test.onclick=()=>toggle('test');
window.addEventListener('dxx:hubview',initialize);window.addEventListener('pageshow',initialize);initialize();test.disabled=false;
