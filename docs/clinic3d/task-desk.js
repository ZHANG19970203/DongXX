const stages = [
 ['损伤机制','injury_mechanism'],['床旁查体','ankle_stress'],['坐站足弓观察','arch_view'],['足弓选骨','arch_compare'],
 ['足底扫描','pressure_compare'],['踝足运动辨认','alignment'],
 ['踝足肌力','muscle_match'],['静态平衡判读','static_cop'],['步态观察','gait_events']
];
export function installTaskDesk(snapshot){
  const desk=document.getElementById('taskDesk'), content=desk.querySelector('[data-content]');
  const buttons=[...desk.querySelectorAll('[data-section]')];
  function show(section){
    const state=snapshot()||{};
    const complete=id=>{const r=state.taskReceipts?.[id],scope=({muscle_match:'simulated-ankle-strength',alignment:'ankle-motion-knowledge',static_cop:'static-balance-interpretation'})[id];return !!r&&(!scope||r.scope===scope);};
    const count=stages.filter(([,id])=>complete(id)).length;
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===section)));
    content.replaceChildren();
    const add=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;content.append(e);return e;};
    if(section==='info'){
      add('h2','反复崴脚的原因是什么？');
      add('p','跟随陈女士下楼扭伤右踝的经历，先检查右踝稳定性，再比较坐位和站位足弓，最后结合肌肉功能与步态解释她的困难。');
      const a=add('a','回看五段病例原片');a.href='../project-guide/film.html';a.target='_blank';a.rel='noopener';
    }else if(section==='steps'){
      add('h2','核心操作完成 '+count+' / '+stages.length);
      const bar=add('progress','');bar.max=stages.length;bar.value=count;bar.setAttribute('aria-label','已完成的核心操作');
      const list=add('ul','');
      for(const [title,id] of stages){
        const row=document.createElement('li'),status=document.createElement('span');
        const text=complete(id)?'已完成':state.taskReceipts?.[id]?'有旧版记录':state.skippedSteps?.[id]?'已跳过':state.visited?.includes(id)?'已进入':'待学习';
        status.textContent=text;row.append(title,status);list.append(row);
      }
    }else{
      add('h2','本次病例记录');
      const omitted=stages.filter(([,id])=>state.skippedSteps?.[id]&&!complete(id)).length;
      add('p','核心操作已完成 '+count+' 项，已跳过 '+omitted+' 项。');
      const a=add('a','打开个人学习反馈 →');a.href='../index.html#finish';
    }
  }
  for(const b of buttons)b.addEventListener('click',()=>show(b.dataset.section));
  for(const b of document.querySelectorAll('[data-open-desk]'))b.addEventListener('click',()=>{show(b.dataset.openDesk);desk.showModal();});
  desk.querySelector('[data-close]').addEventListener('click',()=>desk.close());
}