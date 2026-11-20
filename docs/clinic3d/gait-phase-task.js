import {GAIT_CASE} from './gait-lesson.js';

const leftLands = GAIT_CASE.leftContactPhase;
const leftLifts = leftLands + GAIT_CASE.stance.left - 1;
const rightLifts = GAIT_CASE.stance.right;
const clips = {
  double: {label:'双支撑相', intervals:[[0,leftLifts],[leftLands,rightLifts]],
    captions:['第一次双支撑：右脚刚着地，左脚仍接触地面。','第二次双支撑：左脚刚着地，右脚仍接触地面。']},
  rightStance: {label:'右侧单支撑相', intervals:[[leftLifts,leftLands]],
    captions:['只有右脚着地支撑，左脚向前摆动。']},
  rightSwing: {label:'右侧摆动相', intervals:[[rightLifts,1]],
    captions:['右脚离地向前摆动，由左脚单独支撑。']}
};
const answers = {
  step:'从右脚着地，到左脚下一次着地。',
  cycle:'从右脚初次着地，到右脚下一次初次着地。',
  stance:'从右脚着地，到右脚离地。'
};

export function gaitPhasesComplete(book) {
  return book.get('cycleAnswer') === 'cycle' && Object.keys(clips).every(id => book.get('seen_'+id) === true);
}

// Excerpts end inside each interval, where contact and swing remain visible in the held pose.
export function gaitExcerpt(id, seconds) {
  const clip = clips[id], duration = 1.15;
  const segment = Math.min(Math.floor(seconds/duration), clip.intervals.length-1);
  const [start,end] = clip.intervals[segment];
  const progress = Math.min(1,seconds/duration-segment);
  return {segment, phase:start+(end-start)*(.08+.59*progress), finished:seconds>=duration*clip.intervals.length};
}

export function mountGaitQuestion({wrap,button,nodeEl,chooseAnswer,play}) {
  const title = nodeEl('h3','task-card-title','什么是步态周期？');
  const choices = nodeEl('div','cycle-choices');
  for (const [id,label] of Object.entries(answers)) {
    const option = button(label,()=>chooseAnswer(id));
    option.dataset.cycleAnswer=id;
    choices.append(option);
  }
  const feedback=nodeEl('p','cycle-feedback');
  feedback.id='cycleFeedback';feedback.setAttribute('role','status');
  const phases=nodeEl('section','cycle-phases');
  phases.id='cyclePhases';
  const heading=nodeEl('h3','task-card-title','点选时相，观察患者的双脚');heading.tabIndex=-1;
  const controls=nodeEl('div','cycle-controls');
  for (const [id,{label}] of Object.entries(clips)) {
    const b=button(label,()=>play(id));b.dataset.gaitPhase=id;
    controls.append(b);
  }
  const caption=nodeEl('p','cycle-caption');
  caption.id='cycleCaption';caption.setAttribute('role','status');
  phases.append(heading,controls,caption);wrap.append(title,choices,feedback,phases);
}

export function paintGaitQuestion({$,book,phase,playing,locked}) {
  const answer=book.get('cycleAnswer'), correct=answer==='cycle';
  for (const b of document.querySelectorAll('[data-cycle-answer]')) {
    b.hidden=correct;
    b.setAttribute('aria-pressed',String(b.dataset.cycleAnswer===answer));
  }
  const feedback=$('cycleFeedback');
  if(!feedback)return;
  feedback.hidden=!answer;
  feedback.textContent=correct?'对。从同一只脚初次着地，到这只脚下一次初次着地，就是一个步态周期。':
    answer==='step'?'这描述的是一步。再看看一个完整周期在哪里结束。':'这是右脚的支撑相。完整周期还包括右脚摆动。';
  $('cyclePhases').hidden=!correct;
  const selected=playing?.id || book.get('lastGaitPhase');
  for(const b of document.querySelectorAll('[data-gait-phase]')) {
    const id=b.dataset.gaitPhase,seen=book.get('seen_'+id)===true;
    b.setAttribute('aria-pressed',String(id===selected));
    b.textContent=(seen?'✓ ':'')+clips[id].label;
  }
  const caption=$('cycleCaption');
  caption.hidden=!clips[selected];
  if(clips[selected])caption.textContent=clips[selected].captions[selected==='double'&&phase>=leftLands?1:0];
  const next=$('options').querySelector('[data-option="events_done"]');
  if(next)next.disabled=locked || !gaitPhasesComplete(book);
}
