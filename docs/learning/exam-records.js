export const bank = await fetch(new URL('ankle-exam.json', import.meta.url)).then(r=>{
  if(!r.ok)throw Error('测试题库暂未加载，请刷新页面。');
  return r.json();
});
export const staticSite = location.hostname.endsWith('.github.io');
export const ownerKey = p=>JSON.stringify([p.teacher,p.studentId,p.name]);
const sessionKey = p=>'dxx_exam_session_'+ownerKey(p);
export function examCredential(p) {
  const s=JSON.parse(localStorage.getItem(sessionKey(p))||'null');
  const token=s&&localStorage.getItem('dxx_learning_capability_v15_'+s.id);
  return token ? {id:s.id,token} : null;
}
async function post(path,body,token) {
  const r=await fetch('/api/learning/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Learner-Token':token}:{})},body:JSON.stringify(body)});
  let data;try{data=await r.json();}catch{throw Error('无法连接评分服务，作答已保留，可再次交卷。');}
  if(!r.ok)throw Error(data.error||'交卷失败，请重试。');
  return data;
}
export function localGrade(draft){
  const correct=bank.items.filter((q,i)=>q.key===draft.answers[i]).length;
  return {id:draft.id,at:new Date().toISOString(),version:bank.version,answers:[...draft.answers],
    correct,total:bank.items.length,passed:correct>=bank.passScore};
}
async function submit(p,draft) {
  let auth=examCredential(p);
  if(!auth) {
    const session={id:'exam.'+crypto.randomUUID(),caseId:'cai',startedAt:new Date().toISOString(),student:p};
    const reply=await post('start',{session});
    localStorage.setItem('dxx_learning_capability_v15_'+session.id,reply.accessToken);
    localStorage.setItem(sessionKey(p),JSON.stringify(session));
    auth={id:session.id,token:reply.accessToken};
  }
  return post('quiz',{version:bank.version,sessionId:auth.id,attemptId:draft.id,answers:draft.answers},auth.token);
}
export function grade(p,draft) {
  if(staticSite)return Promise.resolve(localGrade(draft));
  return navigator.locks?navigator.locks.request(sessionKey(p),()=>submit(p,draft)):submit(p,draft);
}
export async function staticProgress(p){
  const history=JSON.parse(localStorage.getItem('dxx_case_test_v1_'+ownerKey(p)+'_history')||'[]');
  const valid=history.filter(r=>r.version===bank.version&&r.answers?.length===bank.items.length)
    .map(r=>({...r,...localGrade(r),at:r.at})).sort((a,b)=>a.at.localeCompare(b.at));
  const first=valid.find(r=>r.passed);
  const report={owner:p,scope:'exam',eligible:!!first,attempted:valid.length>0,done:Math.max(0,...valid.map(r=>r.correct)),total:bank.items.length,passScore:bank.passScore};
  if(first){
    const proof=JSON.stringify({owner:ownerKey(p),attempt:first.id,version:bank.version,answers:first.answers,score:first.correct,total:bank.items.length});
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(proof)));
    const hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    report.certificate={scope:'exam',id:'DXX-L-'+hash.slice(0,16).toUpperCase(),issued_at:first.at,evidence_hash:hash,evidence_json:JSON.stringify({score:first.correct,total:bank.items.length})};
  }
  return report;
}
