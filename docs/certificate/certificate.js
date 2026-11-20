const $=id=>document.getElementById(id),names={all:'全课程：足踝虚拟诊室、人体运动学13实验与肌肉彩绘23组课程',clinic:'足踝虚拟诊室',lab:'人体运动学13实验',painting:'肌肉彩绘23组课程'};let progress=null,cert=null,credentials=[];
function message(t){$('status').textContent=t;}
async function gather(){const p=window.DXXHub?.profile?.();if(!p)throw Error('请先回首页登记姓名和学号。');const candidates=[];for(const store of [localStorage,sessionStorage])for(let i=0;i<store.length;i++){const key=store.key(i);if(!/^dxx_.*(session|soap)/.test(key))continue;try{const raw=JSON.parse(store.getItem(key));const s=raw?.session||raw;if(s?.id&&s.student?.studentId===p.studentId&&s.student?.teacher===p.teacher&&s.student?.name===p.name){const token=localStorage.getItem('dxx_learning_capability_v15_'+s.id);if(token)candidates.push({id:s.id,token});}}catch{}}
 // Clinical sessions predate learner tokens. Enroll only the locally held complete session descriptor.
 for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key.startsWith('dxx_clinic3d_v21_'))continue;try{const s=JSON.parse(localStorage.getItem(key));if(s?.sessionId&&s.student?.studentId===p.studentId&&s.student?.teacher===p.teacher&&s.student?.name===p.name){const session={id:s.sessionId,caseId:s.caseId,startedAt:s.startedAt,student:s.student},old=localStorage.getItem('dxx_learning_capability_v15_'+s.sessionId);const r=await fetch('/api/learning/start',{method:'POST',headers:{'Content-Type':'application/json',...(old?{'X-Learner-Token':old}:{})},body:JSON.stringify({session})});const j=await r.json();if(r.ok){localStorage.setItem('dxx_learning_capability_v15_'+s.sessionId,j.accessToken);candidates.push({id:s.sessionId,token:j.accessToken});}}}catch{}}
 credentials=[...new Map(candidates.map(x=>[x.id,x])).values()].slice(0,80);if(!credentials.length)throw Error('暂时没有已同步的学习记录。请先进入一个模块开始学习。');return credentials;
}
async function request(action){const r=await fetch('/api/learning/certificate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessions:credentials,scope:$('scope').value,action})});const j=await r.json();if(!r.ok)throw Error(j.error||'核对未完成');return j;}
function reset() {cert=null;$('certificate').classList.add('locked');$('watermark').hidden=false;$('downloads').hidden=true;$('issue').disabled=true;$('certNumber').textContent='尚未签发';$('certDate').textContent='完成记录核验后签发';$('achievement').textContent='完成全部体验后，这里将留下你的学习足迹。';}
let revision=0;
const original={title:$('certificate').querySelector('h2').innerHTML,seal:$('seal').innerHTML,note:document.querySelector('.scope-note').textContent,criteria:$('criteria').textContent};
function examAppearance(on){
 $('certificate').querySelector('h2').innerHTML=on?'人体运动学<br><strong>学习完成证书</strong>':original.title;
 $('seal').innerHTML=on?'<span>达标</span>知识测试':original.seal;
 $('criteria').textContent=on?'人体运动学测试共 30 题，每题 1 分。得分达到 25 分即完成学习并自动签发证书。':original.criteria;
 document.querySelector('.scope-note').textContent=on?'本证书记录人体运动学知识测试的达标成绩。':original.note;
 $('issue').hidden=on;
}
function issued(value,description){
 cert=value;$('certificate').classList.remove('locked');$('watermark').hidden=true;$('downloads').hidden=false;
 $('achievement').textContent=description;$('certNumber').textContent='证书编号 '+cert.id;$('certDate').textContent='签发日期 '+new Date(cert.issued_at).toLocaleDateString('zh-CN');
}
async function refresh(){
 const rev=++revision,isExam=$('scope').value==='exam';
 reset();progress=null;examAppearance(isExam);$('items').replaceChildren();$('recipient').textContent='致认真探索的你';$('refresh').disabled=true;
 try{
  let current;
  if(isExam){
   const p=window.DXXHub.profile();if(!p)throw Error('请先回首页登记姓名和学号。');
   const {staticSite,examCredential,staticProgress}=await import('../learning/exam-records.js');
   if(staticSite){current=await staticProgress(p);}
   else{
    const auth=examCredential(p);
    if(!auth){current={owner:p,attempted:false,eligible:false,done:0,total:30,passScore:25};}
    else{credentials=[auth];current=await request('status');}
   }
   if(rev!==revision)return;
   progress=current;$('recipient').textContent=current.owner.name+' 同学';
   $('progress').textContent=current.attempted?'最高成绩 '+current.done+' / '+current.total+' 分':'尚未交卷';
   if(current.eligible&&current.certificate){
    const e=JSON.parse(current.certificate.evidence_json),line='在人体运动学知识测试中取得 '+e.score+' / '+e.total+' 分，达到学习完成标准。';
    issued(current.certificate,line);$('items').textContent=line;
    message(staticSite?'证书与成绩保存在本浏览器，可下载或打印。':'平台已按达标成绩签发证书，可下载或打印。');
   }else{message('完成测试并取得 25 分或以上，即可获得本证书。');}
  }else{
   await gather();if(rev!==revision)return;current=await request('status');if(rev!==revision)return;progress=current;
   $('recipient').textContent=progress.owner.name+' 同学';$('progress').textContent=progress.done+' / '+progress.total+' · '+progress.percent+'%';
   $('items').replaceChildren(...progress.items.map(i=>{const d=document.createElement('div');d.className=i.done?'complete':'';d.textContent=(i.done?'✓ ':'○ ')+i.label;return d;}));
   $('issue').disabled=!progress.eligible;message(progress.eligible?'全部体验记录已核对，可以领取证书。':'尚未完成的项目已列在下方，可以自由返回补学。');
  }
 }catch(e){if(rev===revision){message(e.message);$('progress').textContent='等待学习记录';}}finally{if(rev===revision)$('refresh').disabled=false;}
}
$('scope').onchange=refresh;$('refresh').onclick=refresh;
$('issue').onclick=async()=>{const rev=revision;$('issue').disabled=true;try{const result=await request('issue');if(rev!==revision)return;progress=result;issued(result.certificate,'已完成「'+names[result.certificate.scope]+'」规定的全部体验，完成率100%。特颁此证，纪念主动探索与持续学习。');message('荣誉证书已签发并存入教师可查的学习记录。');}catch(e){if(rev===revision)message(e.message);}finally{if(rev===revision)$('issue').disabled=!progress?.eligible;}};
$('print').onclick=()=>{if(cert)window.print();};$('download').onclick=async()=>{if(!cert)return;const style=await (await fetch('certificate.css')).text();const copy=$('certificate').cloneNode(true);const blob=await (await fetch('../assets/runner-hero-v23.png')).blob();const art=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});copy.querySelector('.motion-art').src=art;const article=copy.outerHTML,items=$('items').outerHTML;const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>动小学学习体验完成证书</title><style>'+style+'</style><main>'+article+'<section class="checklist"><h2>学习报告</h2>'+items+'<p>签发记录摘要 SHA-256：'+cert.evidence_hash+'</p><p>登记信息由学生自报。</p></section></main></html>';const a=document.createElement('a'),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));a.href=url;a.download='动小学_'+cert.id+'_证书与报告.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const p=window.DXXHub?.profile();
if(new URLSearchParams(location.search).get('scope')==='exam')$('scope').value='exam';
else if(p){
 try{const key='dxx_case_test_v1_'+JSON.stringify([p.teacher,p.studentId,p.name])+'_history';
 if((JSON.parse(localStorage.getItem(key))||[]).some(r=>r.version==='ankle30-v1'&&r.passed))$('scope').value='exam';}catch{}
}
refresh();
