import {soapSummary,spokenFindings} from './soap-summary.js';
import {expressionForPatientLine} from './patient-expression.js';
import {createGaitReview} from './gait-review.js';
import {plantarFigure} from './plantar-scan.js?v=68';
import {wallReference} from './posture-reference.js';
import {wallTapeStudy} from './wall-tape.js?v=67';
import {installTaskDesk} from './task-desk.js?v=68';
import {markLearningStep,recoverLearningSteps} from './encounter-progress.js';
import {createStrengthBed} from './strength-bed.js?v=68';
import {addPractice} from '../learning/case-items.js';
import {openArchObservation} from './arch-observation.js?v=68';
import {openArchBones} from './arch-bones.js';
import {voiceRole,replies,spokenCommunicationChoices,archHistory} from './clinic-dialogue.js?v=69';
import {openInversionStudy} from './inversion-study.js?v=67';
import {startBedside} from './bedside-player.js?v=70';
import {differentialPanel} from './differential.js';
import {reactionFor,repairLabel,repairSpoken} from './communication-v26.js';
import {installImmersion} from './immersion-v23.js?v=68';
import {installLearningBubbles} from './learning-bubbles-v25.js?v=68';
import {createUsageTracker} from '../assets/usage-v23.js';
import { SOAP_STAGES } from './soap-route-v20.js';
import { createDialogueAudio } from './dialogue-audio.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createClinicRoom } from './scene-room.js?v=68';
import { createActors,seatOnExamBed } from './actors.js?v=69';
import { samplePlantarScan, sampleStanding, sampleWalking, renderPressureDiagram } from './pressure-engine.js';
import { createPressureStage } from './pressure-stage.js';
import {gaitExcerpt,gaitPhasesComplete} from './gait-phase-task.js';
import { createLearningUI } from './learning-ui.js?v=68';
import { createDialoguePlayer } from './dialogue-player.js';
import { createFilmSequence } from './film-sequence.js?v=68';
import {planTurns,selectedPlan} from './plan-discussion.js';
import {mountGoniometer,romComplete,romReport,romTable} from './goniometry.js';
import { createLearningHub } from '../learning/learning-hub.js';
import {strengthComplete,motionComplete} from './clinical-exams.js?v=68';
import { migrateProgress, recoverSkippedBedside, legacyBedsideCheckpoint } from './progress-migration.js';
import { GAIT_CASE, sampleGait } from './gait-lesson.js';
import { CASE_DATA, FLOW, START_NODE, TEACHER_LIMITATIONS, EVIDENCE_CATALOG } from './case-flow.js?v=69';

const $=id=>document.getElementById(id), profile=window.DXXHub?.profile?.()||null;
const uid=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
const personKey=profile?profile.teacher+'|'+profile.studentId:'guest';
const roundParam=new URLSearchParams(location.search).get('round');
const navigationRound=roundParam&&/^[A-Za-z0-9-]{8,80}$/.test(roundParam)?roundParam:null;
const STORE='dxx_clinic3d_v21_'+personKey+(navigationRound?'_round_'+navigationRound:'');
const chapters=CASE_DATA.acts.map(a=>[a.id,a.title]);
const NAVIGATION_STAGES=SOAP_STAGES;
const reviewParam=new URLSearchParams(location.search).get('review');
const practiceId=new URLSearchParams(location.search).get('practice');
const practice=['injury_mechanism','arch_compare','ankle_stress','muscle_match','gait_events','pressure_compare','alignment','static_cop'].includes(practiceId)?practiceId:null;
if(practice)document.body.dataset.freePractice=practice;
const splitPractice=['gait_events','pressure_compare','muscle_match','alignment','static_cop'].includes(practice);
if(splitPractice)document.body.dataset.splitPractice='true';
const reviewExit=practice?'../index.html#home':'./index.html?demo=1';
const REVIEW_NODE=practice||(['muscle_match','arch_compare','ankle_stress','exam_reasoning','injury_mechanism','acute_differential'].includes(reviewParam)?reviewParam:null);
const flow=Array.isArray(FLOW)?Object.fromEntries(FLOW.map(n=>[n.id,n])):FLOW;
const state={routeVersion:60,sessionId:'clinic3d.'+uid(),caseId:'cai',startedAt:now(),student:profile,node:null,history:[],evidence:[],events:[],visited:[],taskReceipts:{},records:[],exitLock:false,reflection:'',completedAt:null,view:'third',paused:false};
let renderer,scene,camera,controls,room,actors,activeNode,selectedNext,last=performance.now(),cameraMove,movement,drawerFocus,elapsed=0,talkUntil=0,taskPhase=.08,taskRunning=false,pressureMode='static',toastTimer,flushRunning=false;
let queue=[],saved=null,hasStarted=false,lastDraw=0,immersion=null,usageTracker=null,learningBubbles=null;
try{
 saved=recoverSkippedBedside(JSON.parse(localStorage.getItem(STORE)||'null'));
 if(false)for(const version of []){
  const prior=JSON.parse(localStorage.getItem('dxx_clinic3d_'+version+'_'+personKey)||'null');
  if(prior?.caseId==='cai'&&flow[prior.node]){saved=migrateProgress(prior,version,flow,now());break;}
 }
}catch{}
const stepBook=new Map(), catalog=Array.isArray(EVIDENCE_CATALOG)?Object.fromEntries(EVIDENCE_CATALOG.map(e=>[e.id,e])):EVIDENCE_CATALOG||{};
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3300);}
function record(type,payload={}){if(type==='clinic3d_task_completed')window.dispatchEvent(new CustomEvent('dxx:clinic-task-completed',{detail:{nodeId:payload.nodeId}}));
 if(!hasStarted)return null;const e={id:'v14.'+uid(),sessionId:state.sessionId,type,at:now(),payload:{source:'clinic3d-v14',...payload}};state.events.push(e);queue.push(e);persist();flush();
  return e;}
function persist(){if(!hasStarted)return;refreshLearningProgress();if(activeNode?.task)state.taskState={nodeId:activeNode.id,values:Object.fromEntries(stepBook),phase:taskPhase,pressureMode};try{localStorage.setItem(STORE,JSON.stringify(state));$('saveStatus').textContent='进度已在本机保存';}catch{$('saveStatus').textContent='请及时导出学习记录';}}
async function flush(){if(flushRunning||!queue.length)return;flushRunning=true;const batch=queue.slice(0,50);let sent=false;try{const r=await fetch('/api/learning/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:{id:state.sessionId,caseId:'cai',startedAt:state.startedAt,student:profile},events:batch}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('offline');const receipt=await r.json();if(receipt.sessionId!==state.sessionId||receipt.accepted+receipt.duplicates!==batch.length)throw Error('receipt');queue=queue.filter(e=>!batch.includes(e));sent=true;$('saveStatus').textContent='本机保存 · 已同步课堂记录';}catch{$('saveStatus').textContent='本机保存 · 可导出记录';}finally{flushRunning=false;if(sent&&queue.length)setTimeout(flush,0);}}
function nodeEl(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
function button(label,action){const b=nodeEl('button','',label);b.type='button';b.addEventListener('click',action);return b;}
function showFacts(node,entries){node.replaceChildren();const dl=document.createElement('dl');for(const [term,value] of entries){dl.append(nodeEl('dt','',term),nodeEl('dd','',String(value)));}node.append(dl);}
function evidenceText(id){const x=catalog[id];return typeof x==='string'?x:x?.text||x?.label||x?.title||id;}
function addEvidence(ids=[]){for(const id of ids){if(!state.evidence.includes(id))state.evidence.push(id);} $('evidenceCount').textContent=state.evidence.length;}
function appendLine(speaker,text,kind='dialogue'){state.history.push({at:now(),speaker,text,kind,node:activeNode?.id||null});}
const dialogueAudio=createDialogueAudio({enabled:()=>$('voice').getAttribute('aria-pressed')==='true',onTalking:role=>{actors?.setTalking(role);talkUntil=role?Infinity:0;},onStatus:message=>{$('audioStatus').textContent=message;$('audioStatus').hidden=!message;}});
function speak(speaker,text){return dialogueAudio.speak(speaker,text);}

function currentAct(){let act=activeNode?.act||'act1';if(typeof act==='number')act='act'+act;return chapters.some(x=>x[0]===act)?act:'act1';}
function displayNodeText(node){
 const heard=state.filmProgress?.['01A:normal']?.completed;
 const bridge=heard?{history:'根据她刚才的描述，还需要确认什么？'}:{};
 return bridge[node.id]||node.text||'';
}
function cameras(){const a=room?.anchors||{},seat=a.patientSeat||[.8,0,-.82];const target=[seat[0],1.06,seat[2]];return{
 consult:{third:{position:activeNode?[-1.1,1.6,.7]:[-1.7,1.95,2.35],target:activeNode?[1,.95,-1.65]:[.35,.95,-1.5]},first:{position:[1.30,1.32,-2.57],target:[seat[0],1.24,seat[2]]},feet:{position:[seat[0]-.8,.5,seat[2]-.8],target:[seat[0],.18,seat[2]-.35]}},
 exam:{third:{position:[1.6,1.7,1.9],target:[-1.2,.85,-.15]},first:{position:[.10,1.42,-.1],target:[-1.3,.9,-.15]},feet:{position:[1.10,.65,.95],target:[-.78,.12,.05]}},
 posturography:{third:{position:[1.94,1.72,2.90],target:[-1.04,.97,1.78]},first:{position:[-1.94,1.65,2.83],target:[-1.00,.95,1.78]},feet:{position:[.34,.97,2.65],target:[-1.04,.24,2.00]}},
 wall:{third:{position:[1.78,1.43,-.92],target:[-.44,.87,-2.49]},first:{position:[-.85,1.4,-1.6],target:[-.2,1,-2.5]},feet:{position:[.5,.55,-1.8],target:[-.2,.22,-2.55]}},
 gait:{third:{position:[-1.85,1.65,2.7],target:[-.1,.85,.25]},first:{position:[2.05,1.35,1.0],target:[-.1,.85,1.0]},feet:{position:[1.85,.57,1.74],target:[-.1,.35,1.04]}},
 pressure:{third:{position:[-1.8,1.65,2.7],target:[-.1,.8,1.1]},first:{position:[2.05,1.65,-.65],target:[-.1,.85,.60]},feet:{position:[.7,.55,1.95],target:[-.1,.1,1.1]}},
 balance:{third:{position:[-1.8,1.7,2.3],target:[-.1,.9,-.15]},first:{position:[1.1,1.5,.2],target:[-.1,1,-.2]},feet:{position:[.7,.42,.6],target:[-.1,.15,-.15]}}
};}
let platformEntry=null;
let gaitDemo=null;
const gaitAnklePoint=new THREE.Vector3();
let visualZone='consult',pressureStage=null,removalReturn=null,lastPressurePaint=0;
let bedside=null, mechanism=null, footArches=null;
function leaveFootArches(){
 if(!footArches)return;
 footArches.close();footArches=null;paintTask();
 $('taskSurface').querySelector('[data-open-arch-bones]')?.focus();
}
let archObservation=null,wallTape=null,closeGoniometer=null;
function showArchObservation(){
 if(activeNode?.id!=='arch_view'||archObservation||state.exitLock||state.paused||dialoguePlayer.getState().pending)return;
 if(!ensurePreparation())return;
 if(!contactReady()){
  $('taskDock').hidden=false;$('taskSurface').hidden=false;$('dockTitle').textContent='坐站足弓观察';
  $('taskSurface').replaceChildren(nodeEl('p','','观察患者站立前，请先确认站立安全并取得同意。'),button('补做检查前问诊',returnToIntake));
  return;
 }
 const subject='case',actor=actors.patient,seat=room.anchors.examSeat;
 actorPose(actors.therapist,'examine',room.anchors.examTherapist,-Math.PI/2);
 actorPose(actor,'seated',seat,Math.PI/2);
 setView('third',true);
 $('taskDock').hidden=false;$('taskSurface').hidden=false;$('dockTitle').textContent='坐位与站位足弓比较';
 $('taskStatus').hidden=true;$('next').hidden=true;$('filmCue').hidden=true;$('filmHandoff').hidden=true;
 document.body.dataset.dockCollapsed='false';$('dockToggle').setAttribute('aria-expanded','true');$('dockToggle').textContent='收起操作';
 dialoguePlayer.showPrompt('观察陈女士的右足内侧，比较坐位和站位。','arch_view');
 $('speaker').textContent='观察提示';$('speakerAvatar').textContent='看';
 $('conversation').dataset.speaker='student';$('dialogueKind').textContent='坐站观察';
 const prior=state.archPosturesDraft;
 archObservation=openArchObservation({host:$('taskSurface'),subject,actor,seat,
  standingSeenNext:prior?.subject===subject&&prior.phase==='standing',paused:()=>state.paused||document.hidden||dialoguePlayer.getState().pending,
  onStanding(){state.archPosturesDraft={subject,phase:'standing'};record('clinic3d_arch_seated_observed',{subject});},
  onFinish(){
   if(activeNode?.id!=='arch_view'||state.archPosturesDraft?.phase!=='standing')return;
   if(state.taskReceipts.arch_view?.subject!=='case'){
    const receipt={at:now(),scope:'arch-posture-comparison',subject,positions:['seated','standing']};
    state.taskReceipts.arch_view=receipt;
    addEvidence(['arch_record']);
    record('clinic3d_task_completed',{nodeId:'arch_view',...receipt});
   }
   if(state.skippedSteps)delete state.skippedSteps.arch_view;
   goto('arch_compare');enterFootArches();
  }});
}
function enterFootArches(){
 if(footArches||activeNode?.id!=='arch_compare')return;
 state.autoDialogueNext=null;
 footArches=openArchBones({host:$('clinic'),review:!!REVIEW_NODE,showCase:!!REVIEW_NODE||state.evidence.includes('arch_record'),draft:state.archBoneDraft||state.taskReceipts?.arch_compare,
  onSave:draft=>{state.archBoneDraft=draft;if(!REVIEW_NODE)persist();},
  onComplete:draft=>{if(state.taskReceipts?.arch_compare?.scope==='foot-arch-bone-selection')return;
   const receipt={at:now(),scope:'foot-arch-bone-selection',...draft};state.taskReceipts.arch_compare=receipt;
   record('clinic3d_task_completed',{nodeId:'arch_compare',...receipt});
  },
  onSkip:skipCurrentStep,onClose:leaveFootArches,onContinue:()=>{leaveFootArches();if(REVIEW_NODE)location.assign(reviewExit);else continueEncounter();}});
}
function leaveMechanism(){
 if(!mechanism)return;
 mechanism.close();mechanism=null;
 $('taskSurface').querySelector('[data-open-mechanism]')?.focus();
}
function enterMechanism(){
 if(mechanism||activeNode?.id!=='injury_mechanism')return;
 state.autoDialogueNext=null;dialogueAudio.cancel();
 mechanism=openInversionStudy({host:$('clinic'),review:!!REVIEW_NODE,draft:state.mechanismDraft,
  onSave:draft=>{state.mechanismDraft=draft;if(!REVIEW_NODE)persist();},
  onDone:result=>{const receipt={at:now(),...result,scope:'anatomical-model-reasoning'};
   state.taskReceipts.injury_mechanism=receipt;record('clinic3d_task_completed',{nodeId:'injury_mechanism',...receipt});},
  onSkip:skipCurrentStep,onClose:leaveMechanism,onContinue:()=>{leaveMechanism();if(REVIEW_NODE)location.assign(reviewExit);else goto('safety');}});
}
function nextAfterBedside(){
 const target=state.afterBedside||'arch_intro';delete state.afterBedside;
 return target;
}
function finishBedside(){
 if(REVIEW_NODE){location.assign(reviewExit);return;}
 if(!state.taskReceipts?.ankle_stress){leaveBedside();return;}
 if(state.skippedSteps)delete state.skippedSteps.ankle_stress;
 goto(nextAfterBedside());
}
function contactReady(){return state.evidence.includes('screening')&&state.evidence.includes('consent');}
function returnToIntake(){
 state.preparationReturnNode=activeNode.id;
 goto(state.evidence.includes('screening')?'consent':'safety');
}
function bedsideActionLabel(){
 if(!REVIEW_NODE&&!contactReady())return '补做检查前问诊';
 return state.bedsideCheckpoint?'继续床旁查体':'开始床旁查体';
}
function returnFromBedside(){
 if(REVIEW_NODE){location.assign(reviewExit);return;}
 if(bedside?.getPracticeState()?.stage==='complete')finishBedside();
 else leaveBedside();
}
function enterBedside(){
 if(bedside||activeNode?.id!=='ankle_stress')return;
 if(!REVIEW_NODE){
  if(state.taskReceipts?.ankle_stress){finishBedside();return;}
  if(!contactReady()){returnToIntake();return;}
 }
 learningBubbles?.hide();
 controls.enabled=false;cameraMove=null;state.autoDialogueNext=null;
 dialoguePlayer.stop();dialogueAudio.cancel();
 bedside=startBedside({host:$('clinic'),actors,room,camera,renderer,backLabel:practice?'返回自由练习':REVIEW_NODE?'返回主线':'返回接诊',onClose:returnFromBedside,onSkip:skipCurrentStep,skipExamination:!REVIEW_NODE,onContinue:REVIEW_NODE?undefined:finishBedside,record,
  prepared:state.barefootPrepared,onPrepared:()=>{state.barefootPrepared=true;record('clinic3d_barefoot_prepared',{animationCompleted:true,location:'exam-bed'});persist();},
  agreed:state.evidence.includes('consent'),checkpoint:Object.hasOwn(state,'bedsideCheckpoint')?state.bedsideCheckpoint:legacyBedsideCheckpoint(state.events),
  saveCheckpoint:value=>{state.bedsideCheckpoint=value;persist();},
  voiceEnabled:()=>$('voice').getAttribute('aria-pressed')==='true',
  onComplete:result=>{if(state.taskReceipts?.ankle_stress)return;state.taskReceipts.ankle_stress={at:now(),...result};record('clinic3d_task_completed',{nodeId:'ankle_stress',...state.taskReceipts.ankle_stress});persist();}});
}
function leaveBedside(){
 if(!bedside)return;
 bedside.close();bedside=null;visualZone='';setVisual(activeNode);setView(state.view,true);
 const entry=$('next');entry.hidden=false;entry.textContent=bedsideActionLabel();entry.focus();
}
function updateComposition(){if(!camera||!$('clinic'))return;if(activeNode?.id==='muscle_match'||document.body.dataset.soapWriting){camera.clearViewOffset();camera.updateProjectionMatrix();return;}const w=$('clinic').clientWidth,h=$('clinic').clientHeight;if(state.view!=='equipment'&&activeNode?.kind==='task'&&w>=651)camera.setViewOffset(w,h,0,state.view==='feet'?h*.04:0,w,h);else camera.clearViewOffset();camera.updateProjectionMatrix();}
function setView(id,immediate=false){updateComposition();const set=cameras()[visualZone]||cameras().consult,preset=id==='equipment'?(room.anchors.equipmentView||{position:[-.9,1.35,1.1],target:[1.825,1.0,2.0]}):set[id]||set.third;state.view=id;camera.fov=['gait','pressure','posturography'].includes(visualZone)&&id==='first'?54:48;document.body.dataset.inspectEquipment=String(id==='equipment');if(room.objects.pressurePrompt)room.objects.pressurePrompt.visible=id!=='equipment';if(id==='equipment'){taskRunning=false;actors?.setTalking(null);dialogueAudio.cancel();}updateComposition();document.querySelectorAll('[data-view]').forEach(b=>{const selected=b.dataset.view===id;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});controls.enabled=false;controls.enableDamping=false;controls.update();cameraMove={at:performance.now(),from:camera.position.clone(),look:controls.target.clone(),to:new THREE.Vector3(...preset.position),target:new THREE.Vector3(...preset.target),duration:immediate?0:1000};$('cameraNote').textContent=id==='equipment'?'康复器材架':id==='first'?(visualZone==='consult'?'治疗师面对患者':'治疗师观察位'):id==='feet'?'观察右足与地面的关系':'第三视角 · 可拖动观察';record('clinic3d_camera',{view:id,zone:visualZone});}
// Point to the moving contact on the forefoot in world space.
let strengthBed=null;
function actorPose(actor,pose,pos,yaw,immediate=false){if(!actor)return;actor.setLocomotion?.(false);if(pos)actor.setPosition(pos);if(yaw!=null)actor.face(yaw);actor.setPose(pose,immediate);}
const interviewCrown=new THREE.Vector3();
let interviewFace=null;
function frameInterview(){
 if(!document.body.hasAttribute('data-interview')||!actors||!['first','third'].includes(state.view))return;
 interviewFace??=actors.patient.root.getObjectByName('Reference_face_patient');
 if(!interviewFace)return;
 const card=$('conversation').getBoundingClientRect(),canvas=$('scene').getBoundingClientRect();
 if(!card.height||!canvas.height||!canvas.width)return;
 camera.updateMatrixWorld();
 interviewFace.localToWorld(interviewCrown.set(0,1.767,.049)).project(camera);
 const shift=camera.view?.enabled?camera.view.offsetY:0;
 const crownY=canvas.top+(1-interviewCrown.y)*canvas.height/2+shift;
 const crownX=canvas.left+(1+interviewCrown.x)*canvas.width/2;
 const nearCard=crownX>=card.left-65&&crownX<=card.right+65;
 const offset=nearCard?Math.min(0,Math.round(crownY-card.bottom-16)):0;
 if(Math.abs(offset-shift)>=1)camera.setViewOffset(canvas.width,canvas.height,0,offset,canvas.width,canvas.height);
}
function setVisual(node){
 document.body.toggleAttribute('data-interview',node.act==='act1'&&node.kind==='dialogue');
 if(node.id==='muscle_match'&&(REVIEW_NODE||contactReady())&&state.barefootPrepared){
  if(!strengthBed){visualZone='strengthBed';movement=null;taskRunning=false;pressureStage?.update(null,false);actors.patient.setFootwear('barefoot');strengthBed=createStrengthBed(actors,room,scene);}
  actors.setTalking(null);actors.therapist.setDocumentation('desk');return;
 }
 if(strengthBed){strengthBed.close();strengthBed=null;visualZone='';}
 const act=node.act||currentAct(),vm=String(node.visualMode||'').toLowerCase();let zone=node.pressureStation?'pressure':act==='act2'?(vm.includes('wall')||node.task?.type==='trial'?'wall':'exam'):['act3','act4'].includes(act)?'exam':act==='act5'?'gait':act==='act6'?'pressure':act==='act7'?'balance':'consult';
 if(node.task?.type==='staticCOP'||node.id==='balance_intro')zone='posturography';
 const archStanding=node.id==='arch_intro'&&state.barefootPrepared;
 const writing=['exam_findings','plan_intro','synthesis','plan','plan_discussion'].includes(node.id);
 document.body.dataset.soapWriting=writing?(['plan','plan_discussion'].includes(node.id)?'P':'A'):'';
 if(writing)zone='consult';
 if(zone!==visualZone||archStanding||document.body.dataset.archStanding==='true'){visualZone=zone;
  document.body.dataset.archStanding=String(archStanding);movement=null;taskRunning=false;room.setActivity?.(zone==='balance'?{zone:'balance',supportRail:true}:zone==='consult'?'reception':zone==='exam'?'static':zone);const a=room.anchors;
  if(zone==='consult'){actorPose(actors.patient,'seated',a.patientSeat,Math.PI);actorPose(actors.therapist,'seated',a.therapistSeat,0);}
  if(zone==='exam'){const seat=a.examSeat||[-1.48,.15,-.1];
   actorPose(actors.patient,archStanding?'standing':'seated',archStanding?[seat[0]+.36,0,seat[2]+.23]:seat,Math.PI/2);actorPose(actors.therapist,'examine',a.examTherapist||[-.8,0,.0],-Math.PI/2);}
  platformEntry=null;
  if(zone==='posturography'){
   const approach=node.id==='balance_intro'&&!state.exitLock;
   actorPose(actors.patient,'standing',approach?[a.forcePlate[0],0,2.94]:a.forcePlate,Math.PI,true);
   actorPose(actors.therapist,'standing',a.balanceGuard,Math.PI*.68,true);
   if(approach){platformEntry={elapsed:0};actors.patient.setLocomotion(true,true);}
  }
  if(zone==='wall'){actorPose(actors.patient,'standing',a.wallLunge||[-.25,0,-2.25],Math.PI);actorPose(actors.therapist,'standing',[-.77,0,-2.32],Math.PI*.57);}
  if(zone==='gait'){actorPose(actors.patient,'standing',[-.1,0,.2],Math.PI);actorPose(actors.therapist,'standing',[.9,0,.0],-Math.PI/2);}
  if(zone==='pressure'){actorPose(actors.patient,'standing',a.pressure||[-.1,0,1.3],Math.PI);actorPose(actors.therapist,'standing',[.85,0,1.3],-Math.PI/2);}
  if(zone==='balance'){actorPose(actors.patient,'standing',a.balance||[-.1,0,-.2],0);actorPose(actors.therapist,'standing',a.therapistProtection||[.9,0,-.05],-Math.PI/2);}
  setView(state.view);
 }
 if(zone==='posturography'&&node.id==='static_cop'){
  platformEntry=null;actorPose(actors.patient,'standing',room.anchors.forcePlate,Math.PI,true);
 }
 const wallPose=({trial:'wall-ready',local_record:'wall-heel',wall_adjust:'wall-heel',wall_measure:'wall-retry',local_explain:'wall-retry'})[node.id];
 actors.patient.setClinicalPose(zone==='posturography'&&node.id==='balance_intro'&&!platformEntry?'rail-hold':zone==='posturography'?'plate-stand':zone==='wall'?wallPose:null);
 actors.therapist.setClinicalPose(zone==='posturography'||zone==='wall'?'guard':null);
 document.body.dataset.instrument=zone==='posturography'?'static-force-platform':zone==='pressure'?'plantar-scanner':'';
 if(zone==='posturography'&&node.id==='static_cop')room.objects.balanceStation.sample(0);
 actors.setTalking(null);
 actors.therapist.setFootwear?.('shoes');actors.therapist.setDocumentation?.(writing?'write':['consult','balance','posturography','exam','wall'].includes(zone)?'desk':'carry');
 if(writing){
  const patient=room.anchors.patientSeat,therapist=room.anchors.therapistSeat;
  actors.patient.face(Math.atan2(therapist[0]-patient[0],therapist[2]-patient[2]));
  actors.therapist.face(Math.atan2(patient[0]-therapist[0],patient[2]-therapist[2]));
  setView('third',true);
  const centre=new THREE.Vector3((patient[0]+therapist[0])*.5,.98,(patient[2]+therapist[2])*.5);
  cameraMove.to.copy(centre).add(new THREE.Vector3(-Math.max(2.5,2.9*Math.max(1,$('scene').clientHeight)/Math.max(1,$('scene').clientWidth)),.38,-.06));cameraMove.target.copy(centre);updateWriting();
 }
 if(!actors.patient.getState().footwearRemoval?.active){actors.patient.setFootwear?.((writing||['debrief','finish'].includes(node.id))&&state.examShoesOn?'shoes':state.barefootPrepared?'barefoot':'shoes');}
 if(node.task?.type==='plantarScan'&&!state.exitLock&&!state.barefootPrepared&&!actors.patient.getState().footwearRemoval.active){startPreparation(false);return;}
 if(['act2','act3','act4','act5','act6','act7'].includes(act)&&node.id!=='__preparation'&&node.id!=='ankle_stress'&&node.id!=='arch_intro'&&!state.barefootPrepared&&state.evidence.includes('screening')&&state.evidence.includes('consent')&&!actors.patient.getState().footwearRemoval?.active&&(typeof filmSequence==='undefined'||!filmSequence.needsBriefing(node)))startPreparation(false);
}
function updateWriting(){
 const phase=document.body.dataset.soapWriting;if(!phase)return;
 const summary=soapSummary(state);
 const lines=phase==='P'?summary.P:summary.A.length?summary.A:[...summary.S.slice(-1),...summary.O.slice(0,2)];
 room.objects.writeCaseNote(phase,lines);
}
function drawRail(){ $('chapterRail').replaceChildren();for(const [id,label] of chapters){const b=button(String(chapters.findIndex(x=>x[0]===id)+1),()=>{});b.append(nodeEl('span','',label));const current=id===currentAct();b.classList.toggle('active',current);b.setAttribute('aria-label',label+' · 进度指示');if(current)b.setAttribute('aria-current','step');b.disabled=true;$('chapterRail').append(b);}}
function navigationAccess(act){
 if(!NAVIGATION_STAGES.some(stage=>stage.act===act))return{ok:false,reason:'unknown_stage'};
 if(REVIEW_NODE)return{ok:false,reason:'teacher_preview'};
 if(!actors?.ready)return{ok:false,reason:'not_ready'};
 const working=hasStarted?state:(saved||state);
 if(working.exitLock)return{ok:false,reason:'safety_exit'};
 if(working.completedAt)return{ok:false,reason:'completed'};
 if(actors.patient.getState().footwearRemoval?.active)return{ok:false,reason:'preparing'};
 return{ok:true};
}
function rememberNavigationPosition(){
 if(!activeNode||!NAVIGATION_STAGES.some(stage=>stage.act===activeNode.act))return;
 state.navigationBookmarks=state.navigationBookmarks||{};
 state.navigationBookmarks[activeNode.act]={nodeId:activeNode.id,
  taskState:activeNode.task?{nodeId:activeNode.id,values:Object.fromEntries(stepBook),phase:taskPhase,pressureMode}:null,
  choiceLock:state.choiceLock?.nodeId===activeNode.id?{...state.choiceLock}:null};
}
function jumpToAct(act){
 if(act==='act6')act='act4';
 const access=navigationAccess(act);
 if(!access.ok){toast(({safety_exit:'本轮已因安全或意愿结束。可另开新接诊，原记录保留。',completed:'本轮已保存完成。可另开新接诊，原记录保留。',preparing:'请先看完脱鞋袜动作，再切换环节。',teacher_preview:'这是教师单项预览。请返回普通接诊后使用项目导引。',not_ready:'诊室还在准备，请稍候。'})[access.reason]||'当前无法进入该环节。');return access;}
 const wasStarted=hasStarted;
 if(!hasStarted){
  if(saved?.node){Object.assign(state,saved);queue=[...(state.events||[])];activeNode=flow[state.node]||null;stepBook.clear();if(state.taskState?.nodeId===activeNode?.id){for(const [key,value]of Object.entries(state.taskState.values||{}))stepBook.set(key,value);taskPhase=state.taskState.phase??.08;pressureMode=state.taskState.pressureMode||'static';}}
  hasStarted=true;state.taskReceipts=state.taskReceipts||{};state.records=state.records||[];
 }
 rememberNavigationPosition();
 state.preparationReturnNode=null;
 const stage=NAVIGATION_STAGES.find(item=>item.act===act),bookmark=state.navigationBookmarks?.[act];
 const restore=bookmark&&flow[bookmark.nodeId]?.act===act?bookmark:null;
 const targetId=restore?.nodeId||stage.entry,fromNode=activeNode?.id||null,fromAct=activeNode?.act||null;
 if(wasStarted&&targetId===fromNode){closeProjectGuide();return{ok:true,unchanged:true,fromNode,toNode:targetId,fromAct,toAct:act,missedStages:[]};}
 const visitedActs=new Set((state.visited||[]).map(id=>flow[id]?.act));
 const missedStages=NAVIGATION_STAGES.slice(0,NAVIGATION_STAGES.findIndex(item=>item.act===act)).filter(item=>!visitedActs.has(item.act)).map(item=>item.act);
 const payload={fromNode,toNode:targetId,fromAct,toAct:act,missedStages,restoredBookmark:!!restore,sessionPreserved:true,notClinicalSkillAssessment:true};
 state.navigationJumps=state.navigationJumps||[];state.navigationJumps.push({at:now(),...payload});
 if(['act2','act3','act4','act5','act6','act7'].includes(act)&&(!state.barefootPrepared||wasStarted&&actors.patient.getState().footwear==='shoes'))state.barefootPrepared=false;
 if(restore){state.taskState=restore.taskState;state.choiceLock=restore.choiceLock;}else state.choiceLock=null;
 closeProjectGuide();state.paused=false;movement=null;taskRunning=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');
 goto(targetId,{restoring:!!restore,navigation:true});
 record('student_navigation_jump',{...payload,source:'clinic3d-v16-navigation',scope:'navigation_only_no_assessment_credit'});
 toast(restore?'已回到这一步的原位置；已有证据与操作记录保留。':'已进入所选环节。跳过的检查不会补记为完成。');
 return{ok:true,...payload};
}
function goto(id,{restoring=false,navigation=false}={}) {
 if(id==='rom_report'&&!romComplete(state.taskReceipts?.rom_measure))id='trial';
 if(id==='plan_intro'&&!state.soapReviewPassed&&!navigation&&!REVIEW_NODE&&!state.exitLock&&!state.examFeedbackDone&&!state.skippedSteps?.exam_findings)id='exam_close';
 if(id==='teachback'||id==='plan_patient')id='debrief';
 gaitReview.clear();
 $('spokenPressureMap').hidden=true;
 if(id==='pressure_conditions')id='pressure_compare';
 if(id==='local_explain'&&!state.taskReceipts?.wall_measure&&!state.exitLock)id='wall_measure';
 if(!REVIEW_NODE&&!state.completedAt&&!state.exitLock){
  if(id==='exam_reasoning'||(id==='ankle_stress'&&(state.taskReceipts?.ankle_stress||state.skippedSteps?.ankle_stress)))id=nextAfterBedside();
  else if(id==='arch_intro'&&activeNode?.id==='ankle_stress'&&state.afterBedside)id=nextAfterBedside();
  if(state.taskReceipts?.arch_view?.subject==='therapist-demo')delete state.taskReceipts.arch_view;
  const finishedBones=state.taskReceipts?.arch_compare?.scope==='foot-arch-bone-selection';
  if(['arch_intro','arch_view','arch_compare'].includes(id)&&!finishedBones&&!state.taskReceipts?.ankle_stress&&!state.skippedSteps?.ankle_stress){
   id='ankle_stress';
  }else if(id==='arch_compare'&&!finishedBones&&!state.taskReceipts?.arch_view){
   id=state.skippedSteps?.arch_view?'arch_concern':'arch_view';
  }
 }
 if(!restoring&&!navigation&&state.clinicalResume&&((id==='local_intro'&&activeNode?.id==='cop_explain'&&flow[state.clinicalResume]?.act==='act2')||(id==='muscle_intro'&&activeNode?.id==='local_explain'&&flow[state.clinicalResume]?.act==='act3'))){
  id=state.clinicalResume;delete state.clinicalResume;
  const bookmark=state.clinicalResumeBookmark;delete state.clinicalResumeBookmark;
  if(bookmark){state.taskState=bookmark;restoring=true;}
 }
 if(restoring&&id==='injury_mechanism'&&!REVIEW_NODE&&!state.mechanismDraft&&!state.taskReceipts?.injury_mechanism&&!state.skippedSteps?.injury_mechanism&&!state.visited.includes('injury_question'))id='injury_question';
 const previewingLinkedStep=(practice==='alignment'&&['rom_measure','rom_report'].includes(id))||(REVIEW_NODE==='injury_mechanism'&&id==='injury_question')||(practice==='pressure_compare'&&id==='cop_explain')||(practice==='gait_events'&&id==='gait_interpret');
 if(practice&&id!==practice&&!previewingLinkedStep){location.assign(reviewExit);return;}
 if(REVIEW_NODE&&id!==REVIEW_NODE&&!previewingLinkedStep&&!(REVIEW_NODE==='ankle_stress'&&id==='exam_reasoning')){toast('本页只预览这一项。返回主线可继续原接诊，预览不保存学习结果。');return;}
 if(immersion?.beforeNode(id,()=>goto(id,{restoring,navigation})))return;
 actors?.patient.setEmotion('neutral');actors?.patient.endGesture();$('communicationState').hidden=true;delete $('conversation').dataset.communication;
 const node=flow[id];
 const restoredTask=restoring&&state.taskState?.nodeId===id?state.taskState:null;
 if(!node){toast('当前环节已结束，可查看本次 SOAP 病历。');return;}
 if(state.completedAt){const finalId=state.exitLock?'safe_finish':'finish';if(restoring&&id!==finalId)return goto(finalId,{restoring:true});if(!node.terminal){toast('本次学习已保存。');openDrawer('notes');return;}}
 const safetyNodes=['medical_stop','symptom_stop','decline_stop','safe_finish'];
 const retiredArchChoices=(id==='gait_interpret'&&['observe_only','power_from_picture','arch_to_sprain'].includes(state.choiceLock?.optionId))||['arch_compare','arch_concern','trial','local_explain','pressure_compare','cop_explain'].includes(id);
 const restoredChoice=restoring&&!retiredArchChoices&&state.choiceLock?.nodeId===id?state.choiceLock:null;
 if(restoring&&retiredArchChoices&&state.communicationRepairs?.[id]?.pending){
  state.communicationRepairs[id].pending=false;state.communicationRepairs[id].phase='superseded';
 }
 const restoringSafetyChoice=restoredChoice&&safetyNodes.includes(restoredChoice.nextId);
 if(state.exitLock&&!safetyNodes.includes(id)&&!restoringSafetyChoice){toast('本轮体能任务已结束，请保留停止原因并复盘。');return;}
 if(['medical_stop','symptom_stop','decline_stop','safe_finish'].includes(id)){state.exitLock=true;state.preparationReturnNode=null;if(!state.exitReason)state.exitReason=id;}
 learningBubbles?.hide();
 closeGoniometer?.();closeGoniometer=null;$('romReportTable')?.remove();$('wallReference')?.remove();$('finalPlanActions')?.remove();
 if(wallTape){wallTape.close();wallTape=null;visualZone='';}
 if(archObservation){archObservation.close();archObservation=null;visualZone='';}
 if(bedside)leaveBedside();
 if(activeNode?.id==='ankle_stress'&&state.skippedSteps?.ankle_stress)state.bedsideCheckpoint=null;
 if(mechanism)leaveMechanism();
 if(footArches)leaveFootArches();
 gaitDemo=null;scanStageFrame=null;actors?.patient.setStrengthTest(null);usageTracker?.flush();activeNode=node;state.node=id;state.autoDialogueNext=null;state.choiceLock=restoredChoice;selectedNext=null;taskRunning=false;stepBook.clear();if(!restoring)taskPhase=node.task?.type==='gait'?0:.08;if(restoredTask){for(const [k,v]of Object.entries(restoredTask.values||{}))stepBook.set(k,v);taskPhase=restoredTask.phase??.08;pressureMode=restoredTask.pressureMode||'static';}if(node.task?.type==='gait'&&restoring){
  const lastPhase=stepBook.get('lastGaitPhase');
  taskPhase=lastPhase&&stepBook.get('seen_'+lastPhase)===true&&['double','rightStance','rightSwing'].includes(lastPhase)?gaitExcerpt(lastPhase,3).phase:0;
 }
 actors?.patient.setGaitPhase?.(null);actors?.patient.setLocomotion?.(false);
 if(!state.visited.includes(id))state.visited.push(id);
 document.body.dataset.nodeKind=node.kind||'dialogue';document.body.dataset.node=id;document.body.dataset.act=currentAct();
 $('welcome').hidden=true;$('conversation').hidden=false;$('conversationBody').scrollTop=0;$('feedback').hidden=true;
 $('taskSurface').hidden=true;$('taskSurface').replaceChildren();$('options').replaceChildren();
 $('next').hidden=false;$('next').disabled=false;$('next').textContent='继续 →';
 const chapter=chapters.find(x=>x[0]===currentAct());
 $('chapterNumber').textContent=currentAct()==='debrief'?'教学复盘':(chapters.indexOf(chapter)+1)+' / '+NAVIGATION_STAGES.length+' · '+(chapter?.[1]||'接诊');
 $('chapterTitle').textContent=chapter?.[1]||'接诊';
 $('purpose').textContent=node.purpose||({'act1':'先了解患者的体验、安全与目标。','act2':'统一方法，再解释检查发现。','act3':'认识肌群，统一检查条件。','act4':'比较负重前后足弓外观。','act5':'同一时间轴，区分事件与推断。','act6':'先核对条件，再比较负荷记录。','act7':'先建立可保护的任务起点。','act8':'围绕目标，选择有依据的下一步。','debrief':'分清已知、未做与尚未证明。'}[currentAct()]);
 $('speaker').textContent=node.speaker||'林治疗师';
 $('taskLabel').textContent=node.kind==='task'?'观察与操作':node.kind==='summary'?'共同复盘':'';
 const conversationTurns=id==='arch_intro'&&!state.barefootPrepared?archHistory:node.turns;
 const presentedText=conversationTurns?conversationTurns[0].text:typeof displayNodeText==='undefined'?node.text||'':displayNodeText(node);
 $('line').textContent=presentedText;$('progressText').textContent='已走过 '+state.visited.length+' 个对话与操作';
 setVisual(node);updateComposition();lessonUI.presentNode(node);immersion?.enterNode(node);if(restoring){actors.patient.setPose(actors.patient.getState().pose,true);actors.therapist.setPose(actors.therapist.getState().pose,true);}drawRail();addEvidence([]);
 if(!restoring){
  if(conversationTurns){for(const turn of conversationTurns)appendLine(turn.speaker==='patient'?'陈女士':'林治疗师',turn.text,node.kind);}
  else appendLine(node.speaker||'林治疗师',presentedText,node.kind);
  if(node.evidence&&!navigation&&!node.terminal)state.pendingEntryEvidence=id;
  if(node.record&&!navigation)state.records.push({nodeId:id,...node.record});
  record('clinic3d_node',{nodeId:id,act:currentAct(),kind:node.kind,record:!navigation?node.record||null:null,navigationEntry:navigation});
 }
 if(id==='muscle_match'&&!REVIEW_NODE&&!contactReady()){
  $('taskSurface').hidden=false;
  $('taskSurface').append(nodeEl('p','','开始抗阻操作前，需要完成安全询问并取得患者同意。'),button('补做检查前问诊',returnToIntake));
 }else if(id==='arch_view'){$('taskDock').hidden=true;}else if(node.task){renderTask(node.task);if(!['muscle_match','pressure_compare','gait_events'].includes(id))addPractice($('taskSurface'),id,sampleGait,answer=>record('clinic3d_case_question',{nodeId:id,...answer}));}
 $('skipStep').hidden=!!state.completedAt;
 if(id==='arch_compare'&&REVIEW_NODE)queueMicrotask(enterFootArches);
 if(id==='injury_mechanism'){
   $('taskDock').hidden=false;$('taskSurface').hidden=false;
   const start=button('打开右踝模型练习',enterMechanism);start.dataset.openMechanism='true';$('taskSurface').append(start);
   queueMicrotask(enterMechanism);
 }
 if(id==='exam_reasoning'){
   $('taskSurface').hidden=false;$('taskDock').hidden=false;
   $('taskSurface').append(differentialPanel(payload=>record('clinic3d_differential_practice',payload),{includeCurrent:false}));
 }
 if(node.options?.length){$('next').hidden=true;if(id==='gait_interpret')$('options').append(nodeEl('p','consent-choice-prompt','刚刚治疗师表达的意思是什么？'));if(id==='consent_reply')$('options').append(nodeEl('p','consent-choice-prompt','她担心碰到旧伤会疼。你会怎样回应？'));for(const option of node.options){const b=button(option.shortLabel||option.label,()=>choose(option,b));b.dataset.option=option.id;b.dataset.number=String(node.options.indexOf(option)+1).padStart(2,'0');b.disabled=!!restoredChoice||!!state.completedAt;b.classList.toggle('selected',restoredChoice?.optionId===option.id);$('options').append(b);}if(restoredChoice){const option=node.options.find(x=>x.id===restoredChoice.optionId);selectedNext=restoredChoice.nextId;$('feedback').textContent=option?.feedback||'已恢复上次选择，请继续当前路线。';$('feedback').hidden=false;$('next').hidden=false;$('next').textContent=option?.retry?'重新核对 →':'继续 →';}}
 else selectedNext=node.next;
 if(['plantarScan','gait'].includes(node.task?.type))paintTask();
 if(node.terminal||(!node.next&&!node.options?.length)){$('next').hidden=false;$('next').textContent='保存本次学习 →';selectedNext='__complete';}
 if(state.communicationRepairs?.[id]?.pending){state.choiceLock=null;selectedNext=null;playPatientReaction(state.communicationRepairs[id],true);persist();return;}
 if(id==='ankle_stress'){
  $('taskSurface').hidden=true;$('taskDock').hidden=true;$('coach').hidden=true;
  $('next').hidden=false;$('next').textContent=bedsideActionLabel();
  const ready=REVIEW_NODE||contactReady();
  dialoguePlayer.showPrompt(ready?'准备床旁查体。':'床旁查体前，请先完成问诊并取得同意。',id);
  if(ready)queueMicrotask(enterBedside);
  persist();return;
 }
 if(conversationTurns){filmSequence.clear();dialoguePlayer.loadSequence(conversationTurns,id);persist();return;}
 if(id==='exam_findings'){
  state.examShoesOn=true;actors.patient.setFootwear('shoes');filmSequence.clear();
  const turns=spokenFindings(state);dialoguePlayer.loadSequence(turns,id);persist();return;
 }
 if(id==='plan_discussion'){
  filmSequence.clear();dialoguePlayer.loadSequence(planTurns(state),id,{wholeTurns:true});persist();return;
 }
 if(id==='finish'){
  const actions=nodeEl('div','clinical-nav');actions.id='finalPlanActions';
  if(!state.completedAt && !selectedPlan(state)){
   actions.append(button('回到治疗计划',()=>goto('plan',{navigation:true})));
  }
  actions.append(button('回听医患计划对话',()=>{filmSequence.clear();dialoguePlayer.loadSequence(planTurns(state),'finish:review',{wholeTurns:true});}));
  $('line').after(actions);
 }
 if(id==='rom_measure'){
  filmSequence.clear();dialoguePlayer.showPrompt(node.text,id);$('next').hidden=true;
  $('taskDock').hidden=false;$('taskSurface').hidden=false;
  $('dockTitle').textContent='通用量角器 · 双侧活动度';$('coach').hidden=true;
  const receipt=state.taskReceipts.rom_measure?.scope==='simulated-goniometry'?state.taskReceipts.rom_measure:{scope:'simulated-goniometry',readings:{}};
  speak('林治疗师',node.text);
  closeGoniometer=mountGoniometer({host:$('taskSurface'),receipt,voice:text=>speak('林治疗师',text),isPaused:()=>state.paused,
    onRead(t){state.taskReceipts.rom_measure=receipt;record('clinic3d_rom_reading',{nodeId:id,side:t.side,mode:t.mode,motion:t.move.key,degrees:t.angle});persist();},
    onDone(){if(romComplete(receipt)){record('clinic3d_task_completed',{nodeId:id,scope:receipt.scope});goto('rom_report');}}});
  persist();return;
 }
 if(id==='rom_report'){
  const panel=romTable(state.taskReceipts.rom_measure);panel.id='romReportTable';$('line').after(panel);
  filmSequence.clear();dialoguePlayer.loadSequence(romReport.map(text=>({speaker:'therapist',text})),id,{wholeTurns:true});persist();return;
 }
 if(id==='wall_adjust')$('line').after(wallReference());
 if(id==='wall_measure'){
  filmSequence.clear();dialoguePlayer.showPrompt(node.text,id);$('next').hidden=true;
  beginWallMeasurement();persist();return;
 }
 if(id==='arch_view'){
  $('next').hidden=true;
  if(!filmSequence.present(node,{restoring})){dialoguePlayer.showPrompt(node.text,id);showArchObservation();}
  persist();return;
 }
 const filmTrigger=restoredChoice&&!node.options?.find(option=>option.id===restoredChoice.optionId)?.retry?'choice':'entry';
 if(typeof filmSequence==='undefined'||!filmSequence.present(node,{restoring,trigger:filmTrigger})){if(voiceRole(node.speaker))dialoguePlayer.load(presentedText,node.speaker,node.id);else dialoguePlayer.showPrompt(presentedText,node.id);}if(actors?.patient.getState().footwearRemoval?.active)$('next').disabled=true;persist();
}
function choose(option,b) {
 if(typeof filmSequence!=='undefined'&&dialoguePlayer.getState().pending){toast('先听完这段交流，再选择如何回应。');return;}
 if(actors?.patient.getState().footwearRemoval?.active){toast('请等患者坐稳、脱好鞋袜，再继续。');return;}
 if(state.completedAt){toast('本次学习已保存。');return;}
 if(selectedNext)return;
 if(state.exitLock&&!['medical_stop','symptom_stop','decline_stop','safe_finish'].includes(activeNode.id))return;
 if(!REVIEW_NODE&&['act2','act3','act4','act5','act6','act7'].includes(activeNode.act)&&!state.barefootPrepared&&!ensurePreparation())return;
 if(option.requiresTask&&!taskComplete()){toast('请先完成上方观察与核对，再选择下一步。');record('clinic3d_task_needed',{nodeId:activeNode.id,optionId:option.id});return;}
 if(option.requiresEvidence?.some(id=>!state.evidence.includes(id))){toast('当前没有取得这项依据，可先补齐评估或选择其他合理方向。');return;}
 const previous=state.communicationRepairs?.[activeNode.id];
 const priorCount=previous?.attempts||0;
 const reaction=(option.retry||option.good===false)?reactionFor(option.id,priorCount+1):null;
 document.querySelectorAll('#options button').forEach(x=>{x.classList.toggle('selected',x===b);x.disabled=true;});
 appendLine('我的选择',option.label,'choice');
 record('clinic3d_choice',{nodeId:activeNode.id,optionId:option.id,label:option.label,good:option.good??null,safe:option.safe??null,record:option.record||null});
 if(reaction){
  state.communicationRepairs||={};
  const repair={nodeId:activeNode.id,optionId:option.id,attempts:priorCount+1,pending:true,phase:'reaction',reaction,selectedText:option.shortLabel||option.label};
  state.communicationRepairs[activeNode.id]=repair;state.choiceLock=null;selectedNext=null;
  record('clinic3d_communication_reaction',{nodeId:activeNode.id,optionId:option.id,attempt:repair.attempts,kind:reaction.kind,emotion:reaction.emotion,reply:reaction.text,scope:'authored_communication_practice',notClinicalSkillScore:true});
  playPatientReaction(repair);persist();return;
 }
 selectedNext=option.next||activeNode.next;if(option.retry&&!selectedNext)selectedNext=activeNode.id;
 state.choiceLock={nodeId:activeNode.id,optionId:option.id,nextId:selectedNext,chosenAt:now()};
 if(['medical_stop','symptom_stop','decline_stop','safe_finish'].includes(selectedNext)){state.exitLock=true;if(!state.exitReason)state.exitReason=selectedNext;}
 if(option.evidence)addEvidence(Array.isArray(option.evidence)?option.evidence:[option.evidence]);
 if(option.record)state.records.push({nodeId:activeNode.id,optionId:option.id,...option.record});
 if(option.planDomain)state.records.push({planDomain:option.planDomain,supports:option.supports?.filter(id=>state.evidence.includes(id))||[]});
 if(document.body.dataset.soapWriting)updateWriting();
 $('feedback').textContent=option.feedback||'已记录您的选择。';$('feedback').hidden=false;
 $('next').hidden=false;$('next').textContent=option.retry?'重新核对 →':'继续 →';
 if((activeNode.id==='plan'&&option.planDomain)||['scan_reading','events_done'].includes(option.id)){continueEncounter();return;}
 if(previous?.pending&&!option.retry&&option.good!==false){
  previous.pending=false;previous.phase='repaired';previous.repairedAt=now();previous.correctedOption=option.id;
  record('clinic3d_communication_repaired',{nodeId:activeNode.id,optionId:option.id,attempts:previous.attempts,notClinicalSkillScore:true});
  $('communicationState').hidden=false;$('communicationState').dataset.tone='calm';$('communicationState').textContent='已回应患者顾虑 · 继续共同商量';
  actors?.patient.setEmotion?.('neutral');
  const reply=option.id==='explain_consent'?replies.explain_consent:repairSpoken(option,previous.optionId);if(reply){appendLine('林治疗师',reply,'communication-repair');dialoguePlayer.loadSequence([{speaker:'therapist',text:reply}],activeNode.id+':repair-accepted',{wholeTurns:option.id==='explain_consent'});}else{dialoguePlayer.showPrompt(option.shortLabel||option.label,activeNode.id+':repair-accepted');}
 }else if(!option.retry&&typeof filmSequence!=='undefined'&&filmSequence.present(activeNode,{trigger:'choice'})){
  // The dialogue for this scene already answers the patient.
 }else if(option.id==='shared_stop'){
  const text='我先扶好，停下来，不会硬撑着练。';appendLine('林治疗师',replies.shared_stop);appendLine('陈女士',text);dialoguePlayer.loadSequence([{speaker:'therapist',text:replies.shared_stop},{speaker:'patient',text}],activeNode.id+':teachback');
 }else if(replies[option.id]){
  const line=replies[option.id];appendLine('林治疗师',line,'dialogue');
  dialoguePlayer.loadSequence([{speaker:'therapist',text:line}],activeNode.id+':'+option.id,{wholeTurns:option.id==='explain_consent'});
 }else{
  $('speaker').textContent='学习操作';$('speakerAvatar').textContent='你';$('conversation').dataset.speaker='student';$('dialogueKind').textContent='你的选择';
  dialoguePlayer.showPrompt(option.shortLabel||option.label,activeNode.id+':'+option.id);
 }
 persist();
}
function playPatientReaction(repair,restoring=false){
 if(!activeNode||repair.nodeId!==activeNode.id)return;
 repair.reaction=reactionFor(repair.optionId,repair.attempts)||repair.reaction;repair.phase='reaction';taskRunning=false;selectedNext=null;
 $('next').hidden=true;$('feedback').hidden=true;$('filmCue').hidden=true;$('filmHandoff').hidden=true;
 $('communicationState').hidden=false;$('communicationState').dataset.tone=repair.reaction.emotion;
 $('communicationState').textContent=repair.reaction.emotion==='upset'?'患者表达不满 · 先倾听，再回应':'患者有顾虑 · 请听完后重新回应';
 $('conversation').dataset.communication='repair';actors?.patient.setEmotion?.(repair.reaction.emotion);
 document.querySelectorAll('#options button').forEach(x=>x.disabled=true);
 const turns=[];
 if(!restoring&&spokenCommunicationChoices.has(repair.optionId)){
  turns.push({speaker:'therapist',text:repair.selectedText});
  appendLine('林治疗师',repair.selectedText,'dialogue');
 }
 if(!restoring)appendLine('陈女士',repair.reaction.text,'patient-reaction');
 turns.push({speaker:'patient',text:repair.reaction.text});
 dialoguePlayer.loadSequence(turns,activeNode.id+':patient-reaction');
}
function offerRepair(){
 const repair=state.communicationRepairs?.[activeNode?.id];if(!repair?.pending)return false;
 repair.phase='respond';selectedNext=null;state.choiceLock=null;
 $('next').hidden=true;$('options').replaceChildren();
 for(const option of activeNode.options||[]){const b=button(repairLabel(option,repair.optionId),()=>choose(option,b));b.dataset.option=option.id;$('options').append(b);}
 $('taskLabel').textContent='请重新回应';
 $('communicationState').textContent='先回应顾虑，再说明理由。您可以重新选择。';
 persist();return true;
}

function taskComplete() {
 const task=activeNode.task;if(!task)return true;let valid=true;
 if(task.type==='goniometer')valid=motionComplete(stepBook);
 if(task.type==='muscle')valid=strengthComplete(stepBook);
 if(task.type==='archPostures')return state.taskReceipts?.arch_view?.scope==='arch-posture-comparison';
 if(task.type==='arch')return state.taskReceipts?.arch_compare?.scope==='foot-arch-bone-selection';
 if(task.type==='gait')valid=gaitPhasesComplete(stepBook);
 if(task.type==='pressure')valid=task.stage==='conditions'?stepBook.has('mode'):stepBook.has('region')&&Number(stepBook.get('dynamicMax')||0)-Number(stepBook.get('dynamicMin')||0)>=.15;
 if(task.type==='plantarScan')valid=scanReady()&&stepBook.get('plantarScan')===true;
 if(task.type==='staticCOP')valid=stepBook.get('cop54_interpreted')===true&&stepBook.get('cop54_full')===true;
 if(task.type==='balance')valid=(task.checklist||[]).every((_,i)=>stepBook.get('check'+i));
 if(valid){state.taskReceipts[activeNode.id]={at:now(),values:Object.fromEntries(stepBook),scope:({gait:'gait-cycle-phases',plantarScan:'case-plantar-scan',muscle:'simulated-ankle-strength',goniometer:'ankle-motion-knowledge',staticCOP:'static-balance-interpretation'})[task.type]||'teaching-operation-only'};record('clinic3d_task_completed',{nodeId:activeNode.id,...state.taskReceipts[activeNode.id]});}
 return valid;
}
function complete(){if(!activeNode?.terminal){toast('请先完成本轮复盘。');return;}if(state.completedAt){toast('本次学习已保存。');return;}state.completedAt=now();const skipped=Object.keys(state.skippedSteps||{});record(skipped.length?'clinic3d_partial_review_saved':'clinic3d_learning_complete',{skipped,caseId:'cai',completedAt:state.completedAt,visited:state.visited,evidence:state.evidence,reflection:state.reflection,notClinicalSkillAssessment:true});try{const list=JSON.parse(localStorage.getItem('dxx_encounter_completed_v1')||'[]');if(!skipped.length)list.push({id:state.sessionId,caseId:'cai',student:profile,source:'clinic3d-v14',completedAt:state.completedAt,summary:{visited:state.visited,evidence:state.evidence,reflection:state.reflection,notClinicalSkillAssessment:true}});localStorage.setItem('dxx_encounter_completed_v1',JSON.stringify(list.filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i)));}catch{}toast('本次学习已保存。');}
function intro(){
 hasStarted=true;
 record('clinic3d_reception_started');
 goto(START_NODE);
 const a=room.anchors,seat=a.patientSeat||[.8,0,-.85];
 const patientStart=a.entrance||[-1.65,0,-2.55],therapistStart=a.welcome||[.4,0,-1.0];
 actorPose(actors.patient,'standing',patientStart,0,true);
 actorPose(actors.therapist,'standing',therapistStart,-Math.PI/2,true);
 const route=points=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
 movement={time:0,duration:7,done:false,
   patientPath:route([patientStart,[-1,0,-1.7],[seat[0],0,seat[2]+.5],seat]),
   doctorPath:route([therapistStart,[.20,0,-1.3],[.20,0,-2.55],a.therapistSeat])};
 actors.patient.setLocomotion(true,true);
 actors.therapist.setLocomotion(true,true);
}
function finishIntro(){if(!movement)return;const a=room.anchors;actorPose(actors.patient,'seated',a.patientSeat,Math.PI);actorPose(actors.therapist,'seated',a.therapistSeat,0);movement=null;visualZone='consult';setView('first');}
function walkRoute(actor,curve,travel){
 const point=curve.getPointAt(travel),direction=curve.getTangentAt(travel);
 actor.setPosition(point).face(Math.atan2(direction.x,direction.z));
}
function approachPlatform(dt){
 if(!platformEntry||visualZone!=='posturography')return;
 const plate=room.anchors.forcePlate;
 platformEntry.elapsed+=dt;
 const progress=Math.min(1,platformEntry.elapsed/2.5);
 const z=THREE.MathUtils.lerp(2.94,plate[2],progress);
 const stepUp=THREE.MathUtils.smoothstep(progress,.15,.45);
 actors.patient.setPosition([plate[0],plate[1]*stepUp,z]);
 if(progress>.40)actors.patient.setClinicalPose('rail-hold');
 if(progress>=1){
  actors.patient.setLocomotion(false);platformEntry=null;
 }
}
function animate(t){requestAnimationFrame(animate);if(mechanism||footArches){lastDraw=t;return;}if(t-lastDraw<32)return;lastDraw=t;if(!$('spokenGait').hidden)gaitReview.sync();const realDelta=(t-last)/1000,dt=Math.min(realDelta,.05);last=t;if(strengthBed){
 const info=strengthBed.update(state.paused?0:Math.min(realDelta,.12));
 const a=strengthBed.aim(state.view);cameraMove=null;camera.position.lerp(a.eye,1-Math.exp(-8*Math.min(realDelta,.25)));controls.target.copy(a.target);camera.lookAt(a.target);controls.enabled=false;
 document.body.dataset.strengthPosture=info.posture;document.body.dataset.strengthHands=info.fixedHand+','+info.resistHand;document.body.dataset.strengthContact=[info.fixedGap,info.contactGap].map(n=>n.toFixed(3)).join(',');document.body.dataset.strengthMuscles=info.projection.join(',');
 if(!lessonUI.anatomyIsOpen()&&!learningHub.isOpen())renderer.render(scene,camera);return;
 }if(bedside){bedside.tick(Math.min(realDelta,.5));renderer.render(scene,camera);return;}if(!state.paused){elapsed+=dt;if(actors&&elapsed>talkUntil)actors.setTalking(null);if(movement){movement.time+=dt;const travel=Math.min(movement.time/5.2,1);if(!movement.done){walkRoute(actors.patient,movement.patientPath,travel);walkRoute(actors.therapist,movement.doctorPath,travel);}if(travel>=1&&!movement.done){movement.done=true;actorPose(actors.patient,'seated',room.anchors.patientSeat,Math.PI);actorPose(actors.therapist,'seated',room.anchors.therapistSeat,0);}if(movement.time>=movement.duration)finishIntro();}approachPlatform(Math.min(realDelta,.12));actors?.update(dt,Math.min(realDelta,.5));archObservation?.tick();
 if(wallTape){wallTape.tick(Math.min(realDelta,.15));}
 if(gaitDemo){advanceGaitPhase(Math.min(realDelta,.18));}
 if(taskRunning){const rate=pressureMode==='static'?1/8:.25/(2*GAIT_CASE.cycleSeconds);taskPhase=Math.min(1,taskPhase+dt*rate);if(taskPhase>=1)taskRunning=false;stepBook.set('observed',true);const slider=$('taskPhase');if(slider)slider.value=String(taskPhase);if(t-lastPressurePaint>100||!taskRunning){paintTask();lastPressurePaint=t;}}syncGaitVisual();updatePreparation();
 }
 if(cameraMove&&!wallTape){const v=cameraMove.duration?Math.min((t-cameraMove.at)/cameraMove.duration,1):1,k=v*v*(3-2*v);camera.position.lerpVectors(cameraMove.from,cameraMove.to,k);controls.target.lerpVectors(cameraMove.look,cameraMove.target,k);camera.lookAt(controls.target);if(v>=1){cameraMove=null;controls.enabled=state.view==='third';controls.enableDamping=state.view==='third';}}
 if(actors)actors.therapist.root.visible=(!!document.body.dataset.soapWriting||state.view==='third'||!!archObservation||!!wallTape)&&!actors.patient.getState().footwearRemoval?.active;if(!wallTape)controls?.update();frameInterview();if(activeNode?.task?.type==='gait')positionGaitLabel();if(!lessonUI.anatomyIsOpen()&&!learningHub.isOpen())renderer?.render(scene,camera);}

function startPreparation(replay=false){
 if(!actors||actors.patient.getState().footwearRemoval?.active)return;
 taskRunning=false;const returnView=state.view;
 removalReturn=replay?{view:returnView,preview:true}:{view:returnView,preview:false};
 document.body.dataset.inspectEquipment='false';state.view='third';
 document.body.dataset.footwearPreparation='true';
 if(visualZone!=='exam')setVisual({act:'act2',visualMode:'exam',id:'__preparation'});
 seatOnExamBed(actors.patient,room.objects.examBed);
 actors.patient.setFootwear('shoes');actors.patient.startFootwearRemoval();
 state.paused=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');
 $('next').disabled=true;focusPreparation();record('clinic3d_footwear_preparation',{replay,source:'authored-continuous-action'});
 lessonUI.refreshCoach();
}
function focusPreparation(){
 if(!camera)return;state.paused=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');controls.enabled=false;controls.enableDamping=false;
 cameraMove={at:performance.now(),from:camera.position.clone(),look:controls.target.clone(),to:new THREE.Vector3(1.05,1.18,1.15),target:new THREE.Vector3(-1.42,.85,.18),duration:700};
 $('cameraNote').textContent='赤足准备 · 坐位观察';
}
function updatePreparation(){
 const removal=actors?.patient.getState().footwearRemoval;
 if(activeNode?.id==='exam_close'&&removal?.phase==='shod'){state.examShoesOn=true;goto('exam_findings');return;}
 if(removal?.active){$('next').disabled=true;lessonUI.refreshCoach();return;}
 if(removalReturn&&removal?.completed){
  const previous=removalReturn;removalReturn=null;state.barefootPrepared=true;document.body.dataset.footwearPreparation='false';$('next').disabled=false;
  setVisual(activeNode||{act:'act1',visualMode:'consult'});
  if(activeNode?.task?.type==='plantarScan')renderTask(activeNode.task);
  setView(previous.preview?previous.view:'third');
  if(activeNode?.id==='wall_measure')beginWallMeasurement();
  if(activeNode?.id==='arch_view'&&!dialoguePlayer.getState().pending)showArchObservation();
  record('clinic3d_barefoot_prepared',{animationCompleted:true,clinicalSkillAssessed:false});lessonUI.refreshCoach();if(state.autoDialogueNext===activeNode?.id&&!dialoguePlayer.getState().pending){state.autoDialogueNext=null;continueEncounter();}
 }
}
function staticFootCentres(){
 const result={};for(const [side,name]of [['left','foot.L'],['right','foot.R']]){const p=actors.patient.bones.get(name).getWorldPosition(new THREE.Vector3());result[side]={x:p.x,z:p.z};}return result;
}
let scanStageFrame=null;
function currentPressureFrame(){
 const isGait=activeNode?.task?.type==='gait';
 if(isGait||pressureMode==='dynamic')return sampleWalking(taskPhase*(isGait?1:2),{protectiveGait:isGait,archBySide:{left:'typical',right:'low'}});
 return sampleStanding(taskPhase,{centres:staticFootCentres()});
}
function positionGaitLabel(){
 const label=$('gaitFootLabel');
 const bone=actors?.patient.bones.get('foot.R');
 if(!bone||(!gaitDemo&&!stepBook.get('lastGaitPhase'))){label.hidden=true;return;}
 camera.updateMatrixWorld();
 bone.getWorldPosition(gaitAnklePoint).project(camera);
 const point=gaitAnklePoint, rect=renderer.domElement.getBoundingClientRect();
 label.hidden=point.z<0||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
 label.style.transform='translate('+Math.round(rect.left+(point.x+1)*rect.width/2)+'px,'+Math.round(rect.top+(1-point.y)*rect.height/2)+'px)';
}
function playGaitPhase(id){
 if(activeNode?.task?.type!=='gait'||stepBook.get('cycleAnswer')!=='cycle')return;
 if(state.paused){state.paused=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');$('pause').setAttribute('aria-label','暂停场景');}
 gaitDemo={id,seconds:0,segment:-1};
 setView('feet',true);
 actors.patient.setLocomotion(false);
 advanceGaitPhase(0);
 syncGaitVisual();
}
function advanceGaitPhase(delta){
 const demo=gaitDemo;
 demo.seconds+=delta;
 const frame=gaitExcerpt(demo.id,demo.seconds);
 taskPhase=frame.phase;
 if(frame.finished){
  stepBook.set('seen_'+demo.id,true);
  stepBook.set('lastGaitPhase',demo.id);
  gaitDemo=null;
  record('clinic3d_gait_phase_viewed',{phaseId:demo.id});
  paintTask();
 }else if(demo.segment!==frame.segment){
  demo.segment=frame.segment;
  paintTask();
 }
}
function scanReady(){
 const patient=actors?.patient.getState();
 return activeNode?.task?.type==='plantarScan'&&!state.exitLock&&state.barefootPrepared&&patient?.footwear==='barefoot'&&!patient.footwearRemoval.active;
}
function beginWallMeasurement(){
 if(wallTape||activeNode?.id!=='wall_measure'||state.exitLock||actors.patient.getState().footwearRemoval.active)return;
 if(!state.barefootPrepared){startPreparation(false);return;}
 cameraMove=null;setView('third',true);cameraMove=null;camera.clearViewOffset();
 wallTape=wallTapeStudy({scene,room,actors,camera,controls,onPhase:(side,n,reading)=>{
  $('line').textContent=(side==='R'?'右脚':'左脚')+' · 第 '+n+' 次测量。'+(reading===undefined?'软尺从墙边沿地面展开。':'零刻度贴墙，大脚趾尖对齐 '+reading.toFixed(1)+' 厘米。');
 },onDone:results=>{
  state.taskReceipts.wall_measure={at:now(),scope:'wblt-tape',...results};
  record('clinic3d_wall_distances_measured',state.taskReceipts.wall_measure);
  goto('local_explain');
 }});
}
function syncGaitVisual(){
 if(!actors||actors.patient.getState().footwearRemoval?.active){pressureStage?.update(null,false);return;}
 if(activeNode?.task?.type==='plantarScan'||activeNode?.id==='cop_explain'){
  if(activeNode.task?.type==='plantarScan'&&!scanReady()){pressureStage?.update(null,false);return;}
  actors.patient.setLocomotion(false);
  actors.patient.setPosition(room.anchors.pressureStand);
  const acquired=activeNode.id==='cop_explain'?state.taskReceipts.pressure_compare?.scope==='case-plantar-scan':stepBook.get('plantarScan')===true;
  if(acquired&&!scanStageFrame)scanStageFrame=samplePlantarScan(staticFootCentres());
  pressureStage?.update(acquired?scanStageFrame:null,acquired);
  return;
 }
 const isGait=activeNode?.task?.type==='gait',isPressure=activeNode?.task?.type==='pressure',walking=isGait||(isPressure&&pressureMode==='dynamic');
 if(walking){const cycle=taskPhase*(isGait?1:2),start=room.anchors.pressureWalkStart||[-.1,0,1.45];actors.patient.setGaitPhase(cycle%1);actors.patient.setPosition([start[0],0,start[2]-GAIT_CASE.strideLength*cycle]);if(actors.patient.getState().footwear!=='barefoot')actors.patient.setFootwear('barefoot');}
 else if(isPressure){actors.patient.setGaitPhase(null);actors.patient.setLocomotion(false);actors.patient.setPosition(room.anchors.pressureStand||[-.1,0,1.1]);}
 const showPressure=(isPressure&&pressureMode!=='maximum');pressureStage?.update(showPressure?currentPressureFrame():null,showPressure);
}
document.addEventListener('clinic-balance-frame',event=>{
 if(visualZone==='posturography'&&activeNode?.id==='static_cop')room.objects.balanceStation.sample(event.detail.fraction);
});
function renderTask(task){lessonUI.presentTask(task);}
function paintTask(){lessonUI.paintTask();}
function drawPressure(svg){
 const isGait=activeNode?.task?.type==='gait',mode=isGait?'dynamic':pressureMode;
 if(mode==='dynamic'&&!isGait){stepBook.set('dynamicMin',Math.min(Number(stepBook.get('dynamicMin')??1),taskPhase));stepBook.set('dynamicMax',Math.max(Number(stepBook.get('dynamicMax')??0),taskPhase));}
 renderPressureDiagram(svg,{mode,phase:taskPhase*(mode==='dynamic'&&!isGait?2:1),centres:mode==='static'?staticFootCentres():undefined});
}
const gaitReview=createGaitReview($('spokenGait'),()=>state.paused||!$('filmOverlay').hidden||!$('projectGuide').hidden||!$('teacher').hidden||lessonUI.anatomyIsOpen()||learningHub.isOpen());
const dialoguePlayer=createDialoguePlayer({$,speak,cancelSpeech:()=>dialogueAudio.cancel(),record,
 isPaused:()=>state.paused||!$('projectGuide').hidden||!$('teacher').hidden||lessonUI.anatomyIsOpen()||learningHub.isOpen(),
 onChange:()=>lessonUI.refreshCoach(),onUtterance:info=>{
  if(actors&&!bedside){
    const patient=info.speaker==='陈女士';
    const repair=info.nodeId?.endsWith(':patient-reaction')?state.communicationRepairs?.[activeNode?.id]?.reaction?.emotion:null;
    actors.patient.setEmotion(patient?(repair||expressionForPatientLine(info.text,info.nodeId)):'neutral');
    if(patient&&info.nodeId==='injury_question'&&info.index===0&&!state.mechanismGestureSeen){
      actors.patient.scratchTemple();state.mechanismGestureSeen=true;
    }
  }
  if(visualZone==='posturography'&&info.text==='站稳后松开手，双眼看前方。'&&!platformEntry)actors.patient.setClinicalPose('plate-stand');
  if(visualZone==='wall'&&activeNode?.id==='trial'&&info.index===1)actors.patient.setClinicalPose('wall-forward');
  if(visualZone==='wall'&&activeNode?.id==='local_explain'&&info.index>=1)actors.patient.setClinicalPose('wall-retry');
  const holder=$('spokenPressureMap');
  const film=filmSequence.getActive();
  const showMap=info.nodeId?.endsWith(':film:06A')&&(film?.branch.normal||film?.branch.condition==='pressure_data_missing'&&info.speaker==='林治疗师');
  holder.hidden=!showMap;
  if(showMap&&!holder.firstChild)holder.append(plantarFigure({highlightRight:true}));
  gaitReview.turn(info,film?.branch);
  document.body.dataset.gaitPrint=String(info.nodeId?.endsWith(':film:05B')&&info.text.includes('脚印图'));
  filmSequence.onUtterance(info);if(!bedside&&activeNode?.id!=='ankle_stress')learningBubbles?.utterance(info);},
 onComplete:()=>{if(activeNode?.id==='exam_findings'){state.examFeedbackDone=true;persist();}
 if(activeNode?.id==='exam_close'){
  if(actors.patient.getState().footwear==='shoes'){state.examShoesOn=true;goto('exam_findings');return;}
  actors.patient.startFootwearDressing();$('next').disabled=true;$('line').textContent='陈女士坐稳，穿上鞋。';return;
 }
 if(activeNode?.id==='arch_view'){showArchObservation();return;}if(activeNode?.id==='ankle_stress')return;if(offerRepair())return;if(activeNode&&(activeNode.kind==='dialogue'||state.choiceLock?.nodeId===activeNode.id)&&selectedNext&&!activeNode?.terminal&&!state.paused){state.autoDialogueNext=activeNode.id;if(!actors?.patient.getState().footwearRemoval?.active)continueEncounter();}else if(!activeNode&&selectedNext===START_NODE&&!state.paused){const wait=()=>{if(state.paused)return;if(movement){setTimeout(wait,200);return;}continueEncounter();};wait();}}
});
let filmPauseRevision=0;
function pauseSceneForFilm(){
 const previous={paused:state.paused,running:taskRunning,nodeId:activeNode?.id,revision:filmPauseRevision};
 state.paused=true;taskRunning=false;actors?.setTalking(null);dialogueAudio.cancel();
 $('pause').textContent='▶';$('pause').setAttribute('aria-pressed','true');return previous;
}
function resumeSceneFromFilm(previous){
 if(previous&&previous.nodeId===activeNode?.id&&previous.revision===filmPauseRevision&&!state.exitLock){state.paused=!!previous.paused;taskRunning=previous.running;}
 $('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-pressed',String(state.paused));
}
const filmSequence=createFilmSequence({$,state,player:dialoguePlayer,record,persist,appendLine,
 refreshCoach:()=>lessonUI.refreshCoach(),
 pauseScene:pauseSceneForFilm,resumeScene:resumeSceneFromFilm
});
const lessonUI=createLearningUI({scanReady,$ ,state,catalog,stepBook,nodeEl,button,record,enterFootArches,
 getCurrent:()=>({node:activeNode,phase:taskPhase,running:taskRunning,pressureMode,gaitDemo}),playGaitPhase,
 saveTask:persist,strengthVoice(text){if(strengthBed)return speak('林治疗师',text);},
 projectMuscle(value){strengthBed?.project(value);},
 strengthPose(side,mode,motion,flex,projection){
  if(strengthBed){
   return strengthBed.set(side,mode,motion,flex,projection);
  }
  return Promise.resolve(false);
 },
 getRemovalState:()=>actors?.patient.getState().footwearRemoval,focusPreparation,replayPreparation:()=>startPreparation(true),
 setPhase(value){taskRunning=false;taskPhase=value;actors.patient.setLocomotion(false);syncGaitVisual();paintTask();},
 toggleRun(){if(state.paused){state.paused=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');$('pause').setAttribute('aria-label','暂停场景');}if(taskPhase>=1)taskPhase=0;taskRunning=!taskRunning;record('clinic3d_task_play',{nodeId:activeNode.id,playing:taskRunning});},
 setPressureMode(value){pressureMode=value;taskPhase=0;taskRunning=false;actors?.patient.setGaitPhase(null);syncGaitVisual();},pauseTask(){taskRunning=false;},setView,openDrawer,drawPressure,
 focusTask(){if(activeNode?.task?.type==='gait')setView('first');$('taskSurface')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
});
let learningPauseBefore=false;
const learningHub=createLearningHub({
 inertTarget:$('clinic'),
 getSession(){const selected=hasStarted?state:(saved||state);return {id:selected.sessionId,caseId:'cai',startedAt:selected.startedAt,student:selected.student||profile};},
 getObjective(){const n=Number(String(currentAct()).replace('act',''));return 'O'+(n>=1&&n<=8?n:8);},
 onOpen(){learningPauseBefore=state.paused;state.paused=true;taskRunning=false;actors?.setTalking(null);dialogueAudio.cancel();$('pause').textContent='▶';$('pause').setAttribute('aria-pressed','true');record('clinic3d_learning_space_open',{act:currentAct(),notClinicalMeasurement:true});},
 onClose(){state.paused=learningPauseBefore;$('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-pressed',String(state.paused));record('clinic3d_learning_space_close',{act:currentAct()});}
});
$('learningOpen').addEventListener('click',()=>learningHub.open());
immersion=installImmersion({state,flow,catalog,getNode:()=>activeNode,record,persist,
 pause(){const previous=state.paused;state.paused=true;taskRunning=false;dialogueAudio.cancel();actors?.setTalking(null);return()=>{state.paused=previous;};}});
usageTracker=createUsageTracker({enabled:()=>hasStarted,getModule:()=>currentAct(),record});
learningBubbles=installLearningBubbles({record,persist,openConcept:act=>immersion.openConcept(act),pause(){const previous={paused:state.paused,running:taskRunning};state.paused=true;taskRunning=false;actors?.setTalking(null);dialogueAudio.cancel();filmSequence.pauseVideo('optional_learning');return()=>{state.paused=previous.paused;taskRunning=previous.running;$('pause').textContent=state.paused?'▶':'Ⅱ';};}});

let projectGuideFocus=null,projectGuidePausedBefore=false;
function renderProjectGuide(){
 const working=hasStarted?state:(saved||state),currentNode=flow[working.node],currentStage=NAVIGATION_STAGES.find(stage=>stage.act===currentNode?.act),visitedActs=new Set((working.visited||[]).map(id=>flow[id]?.act));
 $('guidePosition').textContent=currentStage?'你目前在：'+currentStage.title+'。点这一环节可回到原位置。':'可从问诊开始，也可选择本次想学习的环节。';
 $('guideProgress').textContent=`到访 ${NAVIGATION_STAGES.filter(stage=>visitedActs.has(stage.act)).length} / ${NAVIGATION_STAGES.length} 个环节 · 实际证据 ${(working.evidence||[]).length} 条。到访不等于达标。`;
 const reason=navigationAccess('act1').reason;
 $('guideAccessNote').textContent=({safety_exit:'本轮已因安全或患者意愿结束，原停止原因会保留。若想重新练习，请另开新接诊。',completed:'本轮已提交保存，可查阅接诊记录。继续练习请另开新接诊，保留这次结果。',preparing:'患者正在脱鞋袜。请先返回看完准备动作，再切换环节。',teacher_preview:'当前是教师单项预览。学生跳步请使用普通接诊入口。',not_ready:'诊室仍在准备，准备好后即可选择。'})[reason]||'自由切换环节，按实际完成情况留记录。';
 $('guideStageCards').replaceChildren();
 for(const [index,stage]of NAVIGATION_STAGES.entries()){
  const card=nodeEl('article','guide-stage-card'),isCurrent=currentNode?.act===stage.act;
  card.dataset.stage=stage.act;card.classList.toggle('is-current',isCurrent);
  const heading=nodeEl('div','guide-stage-heading');heading.append(nodeEl('span','guide-stage-number',String(index+1).padStart(2,'0')),nodeEl('span','guide-stage-state',isCurrent?'当前位置':visitedActs.has(stage.act)?'到访过':'尚未到访'));
  const control=button(isCurrent?'回到当前环节 →':working.navigationBookmarks?.[stage.act]?'回到上次位置 →':'进入这一环节 →',()=>jumpToAct(stage.act));
  control.dataset.jumpAct=stage.act;control.disabled=!navigationAccess(stage.act).ok;
  card.append(heading,nodeEl('h3','',stage.title),nodeEl('p','guide-stage-goal',stage.goal),nodeEl('small','',stage.task),control);$('guideStageCards').append(card);
 }
 const fresh=new URL('index.html',location.href);fresh.searchParams.set('demo','1');fresh.searchParams.set('round',uid());$('guideNewSession').href=fresh.href;
}
function openProjectGuide(){
 if(!$('projectGuide').hidden)return;
 projectGuideFocus=document.activeElement;projectGuidePausedBefore=state.paused;state.paused=true;taskRunning=false;actors?.setTalking(null);dialogueAudio.cancel();
 $('settings').hidden=true;renderProjectGuide();$('projectGuide').hidden=false;$('clinic').inert=true;$('projectGuideClose').focus();
}
function closeProjectGuide(){
 if($('projectGuide').hidden)return;
 $('projectGuide').hidden=true;$('clinic').inert=false;state.paused=projectGuidePausedBefore;$('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-pressed',String(state.paused));
 if(projectGuideFocus?.getClientRects().length)projectGuideFocus.focus();else $('projectGuideOpen').focus();
}
$('projectGuideOpen').addEventListener('click',openProjectGuide);$('projectGuideWelcome').addEventListener('click',openProjectGuide);$('projectGuideClose').addEventListener('click',closeProjectGuide);
window.DXXClinicNavigation=Object.freeze({getStages:()=>NAVIGATION_STAGES.map(stage=>({...stage})),access:navigationAccess,jumpToAct,openGuide:openProjectGuide});
function openDrawer(id){if(id==='notes'){immersion.paper();return;}drawerFocus=document.activeElement;$(id).hidden=false;$('clinic').inert=true;$(id).querySelector('button').focus();}
function closeDrawer(id){$(id).hidden=true;$('clinic').inert=false;drawerFocus?.focus();}
function exportData(technical=false){const data=technical?{format:'clinic3d-v14-technical-review',exportedAt:now(),node:state.node,view:state.view,room:room?.details||null,actors:actors?.details||null,limitations:TEACHER_LIMITATIONS,events:state.events,clinicalApproved:false,filmIntegration:'v18-node-bound',filmMediaPolicy:'accepted-only',heygenStatus:'see_teacher_production_record',productionRecord:'docs/heygen-v18-production.json'}:{format:'dongxiaoxue-clinic3d-learning-v14',...state,scope:'虚构教学病例的选择与解释记录，不是临床技能成绩或真实患者测量。'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=technical?'三维诊室_技术核对_v14.json':'足踝接诊_学习记录_v14.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('dockToggle').addEventListener('click',()=>{const collapsed=document.body.dataset.dockCollapsed!=='true';document.body.dataset.dockCollapsed=String(collapsed);$('dockToggle').setAttribute('aria-expanded',String(!collapsed));$('dockToggle').textContent=collapsed?'展开操作':'收起操作';updateComposition();});
$('prepReplay').addEventListener('click',()=>{$('settings').hidden=true;startPreparation(true);});
$('begin').addEventListener('click',intro);$('resume').addEventListener('click',()=>{if(!saved)return;Object.assign(state,saved);hasStarted=true;queue=[...(state.events||[])];state.paused=false;movement=null;visualZone='';state.taskReceipts=state.taskReceipts||{};state.records=state.records||[];goto(state.node||START_NODE,{restoring:true});toast(state.appearanceMigration?'已保留接诊进度；新增肌力与足弓学习项不会自动记为完成。':'已恢复本机保存的接诊进度。');});
function ensurePreparation(){
 if(state.barefootPrepared)return true;
 if(state.exitLock)return false;
 // Observation, anatomy and data review can continue after a skipped intake.
 // Patient-contact controls offer an explicit return to intake at their own entry.
 if(!contactReady())return true;
 if(!actors.patient.getState().footwearRemoval?.active)startPreparation(false);
 return false;
}
function continueEncounter(){
 if(activeNode?.id==='exam_close'&&actors.patient.getState().footwearRemoval?.dressing)return;
 if(activeNode?.id==='rom_measure'&&!romComplete(state.taskReceipts?.rom_measure))return;
 if(activeNode?.id==='wall_measure'&&!state.taskReceipts?.wall_measure)return;
 if(activeNode?.id==='arch_view'){showArchObservation();return;}
 if(activeNode?.id==='arch_compare'&&!taskComplete()){enterFootArches();return;}
 if(activeNode?.id==='injury_mechanism'&&!state.taskReceipts?.injury_mechanism){enterMechanism();return;}
 if(activeNode?.id==='ankle_stress'&&!state.taskReceipts?.ankle_stress){enterBedside();return;}
 if(dialoguePlayer.getState().pending||state.communicationRepairs?.[activeNode?.id]?.pending)return;
 if(movement)finishIntro();
 if(activeNode&&activeNode.id!=='arch_intro'&&['act2','act3','act4','act5','act6','act7'].includes(activeNode.act)&&!ensurePreparation())return;
 if(activeNode?.id==='consent_reply'&&selectedNext==='ankle_stress'&&state.preparationReturnNode&&state.evidence.includes('screening')&&state.evidence.includes('consent')&&!state.exitLock){const returnNode=state.preparationReturnNode;state.preparationReturnNode=null;markLearningStep(state,activeNode.id);goto(returnNode);return;}
 if(selectedNext==='__complete')return complete();
 if(activeNode && selectedNext && selectedNext!==activeNode.id)markLearningStep(state,activeNode.id);
 if(selectedNext&&selectedNext!==activeNode.id){
  if(state.pendingEntryEvidence===activeNode.id){addEvidence(activeNode.evidence);state.pendingEntryEvidence=null;}
  if(state.skippedSteps)delete state.skippedSteps[activeNode.id];
 }
 if(selectedNext)goto(selectedNext);
}
// Choice nodes may have several branches. Skipping a question does not choose an answer.
const skipBranches={
 gait_events:'plan_intro',history:'injury_question',safety:'goal',goal:'fear_check',fear_check:'consent',
 consent:'ankle_stress',consent_reply:'ankle_stress',acute_differential:'medical_stop',
 alignment:'rom_measure',rom_measure:'trial',trial:'wall_adjust',wall_adjust:'wall_measure',wall_measure:'muscle_intro',local_explain:'muscle_intro',exam_reasoning:'arch_intro',
 plan:'debrief',synthesis:'plan',medical_stop:'safe_finish'
};
function skipCurrentStep(){
 const node=activeNode;if(!node||state.completedAt)return;
 if(REVIEW_NODE==='injury_mechanism'&&node.id==='injury_question'){dialoguePlayer.stop();goto(node.next);return;}
 if(REVIEW_NODE){location.assign(reviewExit);return;}
 // Preserve a safety exit or an already chosen route, without submitting a choice or a result.
 let next=state.exitLock?(selectedNext&&['medical_stop','symptom_stop','decline_stop','safe_finish'].includes(selectedNext)?selectedNext:'safe_finish')
   :selectedNext&&selectedNext!==node.id&&selectedNext!=='__complete'?selectedNext
   :skipBranches[node.id]||node.next||node.options?.find(o=>!o.retry&&o.next!==node.id)?.next;
 if(!state.exitLock&&node.act==='act1'&&next==='ankle_stress'&&state.preparationReturnNode){
  next=state.preparationReturnNode;state.preparationReturnNode=null;
 }
 if(!state.exitLock&&['trial','local_record'].includes(node.id))next='muscle_intro';
 if(node.id==='arch_view'&&!state.exitLock){
  next='arch_concern';
  if(!state.taskReceipts?.arch_compare&&!state.skippedSteps?.arch_compare){
   state.skippedSteps||={};state.skippedSteps.arch_compare=now();
   record('clinic3d_step_skipped',{nodeId:'arch_compare',act:node.act,toNode:next,reason:'arch_observation_skipped',assessmentCredit:false});
  }
 }
 if(!node.terminal&&!flow[next])return;
 const detail={nodeId:node.id,act:node.act,toNode:node.terminal?null:next,assessmentCredit:false};
 state.skippedSteps||={};state.skippedSteps[node.id]=now();
 appendLine('学习导航','跳过此步骤 · '+(node.text||node.id),'skipped');
 state.pendingEntryEvidence=null;if(node.act!=='act1')state.preparationReturnNode=null;state.autoDialogueNext=null;
 if(state.communicationRepairs?.[node.id]?.pending){
  state.communicationRepairs[node.id].pending=false;state.communicationRepairs[node.id].phase='skipped';
 }
 filmSequence.clear();dialoguePlayer.stop();dialogueAudio.cancel();taskRunning=false;
 if(movement)finishIntro();
 if(actors.patient.getState().footwearRemoval?.active){
  actors.patient.setFootwear('barefoot');state.barefootPrepared=true;removalReturn=null;document.body.dataset.footwearPreparation='false';
 }
 state.paused=false;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-pressed','false');
 record('clinic3d_step_skipped',detail);
 if(node.terminal){location.assign('../index.html#finish');return;}
 goto(next,{navigation:true});
}
$('skipStep').addEventListener('click',skipCurrentStep);
$('skipFilm').addEventListener('click',skipCurrentStep);
$('next').addEventListener('click',continueEncounter);
$('pause').addEventListener('click',()=>{filmPauseRevision++;state.paused=!state.paused;filmSequence.pauseVideo('scene_pause');$('pause').textContent=state.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-pressed',String(state.paused));$('pause').setAttribute('aria-label',state.paused?'继续场景':'暂停场景');if(state.paused)dialogueAudio.cancel();record('clinic3d_pause',{paused:state.paused});});
$('stop').addEventListener('click',()=>{filmPauseRevision++;filmSequence.pauseVideo('safety_pause');state.paused=true;actors.setTalking(null);taskRunning=false;actors.patient.setLocomotion(false);$('pause').textContent='▶';$('pause').setAttribute('aria-pressed','true');$('pause').setAttribute('aria-label','继续场景');dialogueAudio.cancel();record('clinic3d_safety_pause',{node:state.node});toast('已暂停。先询问患者感受，再决定继续、调整或结束。');});
$('menuOpen').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden;$('menuOpen').setAttribute('aria-expanded',String(!$('settings').hidden));});
$('settings').addEventListener('click',e=>{if(e.target.closest('button,a')){$('settings').hidden=true;$('menuOpen').setAttribute('aria-expanded','false');}});
document.addEventListener('pointerdown',e=>{if(!$('settings').hidden&&!$('settings').contains(e.target)&&!$('menuOpen').contains(e.target)){$('settings').hidden=true;$('menuOpen').setAttribute('aria-expanded','false');}});
$('notesOpen').addEventListener('click',()=>openDrawer('notes'));$('teacherOpen').addEventListener('click',()=>{$('settings').hidden=true;openDrawer('teacher');});document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDrawer(b.dataset.close)));
$('save').addEventListener('click',()=>{persist();flush();toast('已保存当前接诊进度。');});$('export').addEventListener('click',()=>exportData());$('exportReview').addEventListener('click',()=>exportData(true));
$('voice').addEventListener('click',()=>{const on=$('voice').getAttribute('aria-pressed')!=='true';$('voice').setAttribute('aria-pressed',String(on));$('voice').textContent=on?'朗读开启':'朗读关闭';if(!on){dialogueAudio.cancel();if(dialoguePlayer.getState().needsReplay)dialoguePlayer.replay();}else dialoguePlayer.replay();});
document.addEventListener('keydown',e=>{const drawer=['projectGuide','teacher'].find(id=>!$(id).hidden);if(drawer){if(e.key==='Escape'){e.preventDefault();if(drawer==='projectGuide')closeProjectGuide();else closeDrawer(drawer);}if(e.key==='Tab'){const nodes=[...$(drawer).querySelectorAll('button,a,textarea')].filter(x=>x.getClientRects().length),first=nodes[0],lastNode=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();lastNode.focus();}else if(!e.shiftKey&&document.activeElement===lastNode){e.preventDefault();first.focus();}}}else if(e.key==='Escape'&&actors)$('stop').click();});
async function init(){renderer=new THREE.WebGLRenderer({canvas:$('scene'),stencil:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.3));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;scene=new THREE.Scene();scene.background=new THREE.Color('#e2e9de');camera=new THREE.PerspectiveCamera(48,1,.04,40);camera.position.set(-1.8,2.0,2.8);controls=new OrbitControls(camera,$('scene'));controls.target.set(.2,1,-1);controls.enablePan=false;controls.minDistance=1;controls.maxDistance=9;controls.maxPolarAngle=Math.PI*.48;controls.enableDamping=true;controls.addEventListener('start',()=>{if(state.view==='third')cameraMove=null;});room=createClinicRoom(scene);pressureStage=createPressureStage(scene,room);scene.add(new THREE.HemisphereLight('#ffffee','#9eac96',2.3));const key=new THREE.DirectionalLight('#fff9e8',2.9);key.position.set(-3,6,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:20});key.shadow.bias=-.00003;key.shadow.normalBias=.0015;scene.add(key);const fill=new THREE.DirectionalLight('#e5f2f1',1.0);fill.position.set(3,4,-3);scene.add(fill);const resize=()=>{const w=$('scene').clientWidth,h=$('scene').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;updateComposition();};resize();new ResizeObserver(resize).observe($('scene'));window.addEventListener('resize',resize);requestAnimationFrame(animate);actors=await createActors(scene,{modelUrl:'assets/patient-motion.glb'});actors.therapist.bindDocumentation({notes:room.objects.clinicalNotes,pen:room.objects.clinicalPen,deskParent:room.objects.documentationDeskParent});actors.therapist.setDocumentation('desk');const a=room.anchors;actorPose(actors.patient,'standing',a.entrance||[-1.65,0,-2.55],0);actorPose(actors.therapist,'standing',a.welcome||[.5,0,-1.2],-Math.PI/2);$('loading').hidden=true;$('welcome').hidden=false;$('resume').hidden=!saved?.node;document.body.dataset.ready='true';showFacts($('teacherFacts'),[['人物','2个独立骨架的蒙皮角色'],['病例','1个主线病例 · 六个评估环节、计划与复盘'],['节点',Object.keys(flow).length],['运动学审核','尚未签审'],['双人短片','5段用户情境视频已剪辑接入；不作临床动作认证'],['足压来源','课程合成示意'],['学习记录','本机保存；同源教学服务可接收事件']]);setView('third',true);drawRail();lessonUI.refreshCoach();}
function startReview(){
 if(!REVIEW_NODE)return;
 state.barefootPrepared=REVIEW_NODE!=='ankle_stress';hasStarted=false;visualZone='';goto(REVIEW_NODE==='injury_mechanism'?'injury_question':REVIEW_NODE);setView(practice==='gait_events'?'first':'third',true);
 const badge=nodeEl('div','teacher-preview-badge',practice?(new URLSearchParams(location.search).get('assessment')==='clinic'?'模块测试　':'自由练习　'):'教师预览 · 不保存学习结果　');
 const back=nodeEl('a','',practice?'返回选项':'返回主线');back.href=reviewExit;badge.append(back);if(splitPractice)badge.append(button('跳过此步骤',skipCurrentStep));$('clinic').append(badge);
 for(const id of ['save','export','prepReplay','notesOpen','learningOpen'])$(id).hidden=true;
 $('saveStatus').textContent='教师预览 · 原接诊记录保持不变';
}
recoverLearningSteps(saved,flow);
const refreshLearningProgress=installTaskDesk(()=>hasStarted?state:saved);
init().then(startReview).catch(error=>{$('loading').querySelector('h2').textContent='诊室未能载入';$('loadMessage').textContent='请刷新重试，或在教师制作记录中核对资源。';$('loader')?.remove();console.error(error);});
