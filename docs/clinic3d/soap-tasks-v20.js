import {balanceReasoning} from './balance-reasoning.js?v=72';
import {balanceCues} from './balance-conditions.js?v=72';
import {staticCOPPanel} from './realistic-panels.js?v=72';
export function renderSOAPTask(task,{wrap,nodeEl,button,stepBook,record,refresh,onCue}){
 if(task.type!=='staticCOP')return false;
 wrap.replaceChildren();wrap.hidden=false;
  const judgment=nodeEl('section','clinical-quiz');
  function ask(){
   judgment.replaceChildren();
   if(!stepBook.get('cop71_open')||!stepBook.get('cop71_closed'))return;
   const interpretation='本例闭眼 30 秒的路径比睁眼时长，平均速度更高，说明去除视觉后维持双足站立更困难。';
   if(stepBook.get('cop71_interpreted')||stepBook.get('copObservation72')){judgment.append(nodeEl('p','',interpretation),balanceReasoning({stepBook,button,refresh,record}));return;}
   judgment.append(nodeEl('h4','','同一位患者闭眼后，哪项变化有数据支持？'));
   const feedback=nodeEl('p','');feedback.setAttribute('role','status');
   for(const [i,label] of ['可以定位到右踝某条韧带受损','本例闭眼时路径变长、平均速度增大','足以判断已经可以安全跑跳'].entries()){
    judgment.append(button(label,()=>{const correct=i===1;if(correct)stepBook.set('copObservation72',true);
     record('clinic3d_static_balance_reading',{choice:i,correct,source:'synthetic',condition:'double-leg-open-and-closed-30s'});refresh();
     if(correct){onCue?.(balanceCues.result);ask();}else feedback.textContent=i===0?'轨迹来自双足合力，无法定位单侧韧带。再比较路径和速度。':'跑跳还涉及动态控制。这里只记录了原地站立。';
    }));
   }
   judgment.append(feedback);
  }
  wrap.append(staticCOPPanel({caseResults:true,onCue,onObserve(condition){
   if(!stepBook.get('cop71_'+condition)){stepBook.set('cop71_'+condition,true);if(stepBook.get('cop71_open')&&stepBook.get('cop71_closed'))stepBook.set('cop54_full',true);record('clinic3d_static_cop_observed',{condition,seconds:30,synthetic:true});refresh();ask();}
  }}),judgment);ask();return true;
}
