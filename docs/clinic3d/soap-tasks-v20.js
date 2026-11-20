import {staticCOPPanel} from './realistic-panels.js';
export function renderSOAPTask(task,{wrap,nodeEl,button,stepBook,record,refresh}){
 if(task.type!=='staticCOP')return false;
 wrap.replaceChildren();wrap.hidden=false;
  const judgment=nodeEl('section','clinical-quiz');
  function ask(){
   judgment.replaceChildren();
   if(!stepBook.get('cop54_full'))return;
   const interpretation='本例30秒路径较长、平均速度较高，提示本次双足站立时姿势摆动较大。复查时沿用相同站姿、视觉条件和时长。';
   if(stepBook.get('cop54_interpreted')){judgment.append(nodeEl('p','',interpretation));return;}
   judgment.append(nodeEl('h4','','叠加参考轨迹比较，本次双足站立表现如何？'));
   const feedback=nodeEl('p','');feedback.setAttribute('role','status');
   for(const [i,label] of ['可以定位到右踝某条韧带受损','同条件下，扭伤后示例的姿势摆动较大','足以判断已经可以安全跑跳'].entries()){
    judgment.append(button(label,()=>{const correct=i===1;if(correct)stepBook.set('cop54_interpreted',true);
     record('clinic3d_static_balance_reading',{choice:i,correct,source:'synthetic',condition:'double-leg-eyes-open-30s'});refresh();
     if(correct)ask();else feedback.textContent=i===0?'轨迹来自双足合力，无法定位单侧韧带。再比较路径和速度。':'跑跳还涉及动态控制。这里只记录了原地站立。';
    }));
   }
   judgment.append(feedback);
  }
  wrap.append(staticCOPPanel({caseResults:true,onObserve(){
   if(!stepBook.get('cop54_full')){stepBook.set('cop54_full',true);record('clinic3d_static_cop_observed',{bothSeries:true,seconds:30,synthetic:true});refresh();ask();}
  }}),judgment);ask();return true;
}
