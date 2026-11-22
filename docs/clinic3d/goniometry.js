// Neutral-zero convention. Angles are authored values for this simulated patient.
export const ROM = [
  {key:'up',name:'背伸',sagittal:true,sign:-1,L:[18,22],R:[10,14]},
  {key:'down',name:'跖屈',sagittal:true,sign:1,L:[45,50],R:[40,45]},
  {key:'in',name:'内翻',sign:1,L:[30,35],R:[25,30]},
  {key:'out',name:'外翻',sign:-1,L:[15,18],R:[8,12]}
];
export const romTrials=['L','R'].flatMap(side=>ROM.flatMap(move=>['主动','被动'].map((mode,i)=>({
  side,move,mode,key:side+'_'+move.key+'_'+i,angle:move[side][i]
}))));
export const sideLabel=s=>s==='L'?'左':'右';
const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const rad=degrees=>degrees*Math.PI/180;
export function validReading(receipt,t){return receipt?.scope==='simulated-goniometry' && receipt.readings?.[t.key]===t.angle;}
export function romComplete(receipt){return romTrials.every(t=>validReading(receipt,t));}

export function romRows(receipt){
  return ROM.map(move=>{
    const cells=romTrials.filter(t=>t.move===move);
    return {move,cells,values:cells.map(t=>validReading(receipt,t)?t.angle+'°':'—')};
  });
}
export function romTable(receipt){
  const table=element('table'),header=table.createTHead().insertRow();
  table.setAttribute('aria-label','病例模拟量角结果，单位度');
  for(const label of ['动作','左主动','左被动','右主动','右被动'])header.append(element('th',label));
  const body=table.createTBody();
  for(const {move,values} of romRows(receipt)){
    const row=body.insertRow();row.append(element('th',move.name));for(const v of values)row.append(element('td',v));
  }
  return table;
}
export const romReport=["先说勾脚。您自己勾，左脚十八度，右脚十度。我帮您活动时，左脚二十二度，右脚十四度。","往下绷脚，您自己动是左脚四十五度、右脚四十度。我帮您动是左脚五十度、右脚四十五度。","脚底往里翻，您自己动是左脚三十度、右脚二十五度。我帮您动是左脚三十五度、右脚三十度。","脚底往外翻，您自己动是左脚十五度、右脚八度。我帮您动是左脚十八度、右脚十二度。","两边一比，您的右脚往上勾、往外翻，幅度都比左脚小。我帮您时还能再动一点。我们再看站着时，这个差别对您有没有影响。"];

function figure(canvas,trial,stage,angle){
  const g=canvas.getContext('2d'),{move,side,mode}=trial;
  const W=660,H=405,ratio=Math.min(devicePixelRatio||1,2)*Math.min(1.7,Math.max(1,canvas.clientWidth/W));
  if(canvas.width!==Math.round(W*ratio)||canvas.height!==Math.round(H*ratio)){canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio);}
  g.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  g.fillStyle='#f1f6f4';g.fillRect(0,0,W,H);
  const path=(d,fill,stroke='#846e62',width=1.5)=>{const p=new Path2D(d);g.fillStyle=fill;g.fill(p);if(stroke){g.lineWidth=width;g.strokeStyle=stroke;g.stroke(p);}};
  const line=(x,y,u,v,color,width,dash=[])=>{g.beginPath();g.setLineDash(dash);g.moveTo(x,y);g.lineTo(u,v);g.strokeStyle=color;g.lineWidth=width;g.lineCap='round';g.stroke();g.setLineDash([]);};
  const circle=(x,y,r,fill,stroke)=>{g.beginPath();g.arc(x,y,r,0,2*Math.PI);g.fillStyle=fill;g.fill();if(stroke){g.strokeStyle=stroke;g.lineWidth=2;g.stroke();}};
  const txt=(s,x,y,size=15,c='#27554d',weight=500)=>{g.fillStyle=c;g.font=weight+' '+size+'px "Microsoft YaHei",sans-serif';g.fillText(s,x,y);};
  const sagittal=move.sagittal,theta=rad(move.sign*angle*(sagittal?1:(side==='R'?-1:1)));
  // In anterior view the patient's right is on the viewer's left; inversion
  // raises the medial border and directs the second ray toward the midline.
  const X=sagittal?343:356,Y=sagittal?213:177;
  const skin=g.createLinearGradient(-40,0,70,35);skin.addColorStop(0,'#d9ad91');skin.addColorStop(.47,'#f2d4bc');skin.addColorStop(1,'#d7a78a');
  txt(sideLabel(side)+'踝 · '+(sagittal?'外侧观':'前方观'),18,29,17,'#24554b',700);
  txt('体位',20,68,14);
  line(31,112,92,112,'#46726b',12);line(92,112,92,163,'#46726b',10);line(92,163,116,163,'#46726b',7);
  line(27,124,72,124,'#a5bcb4',5);line(71,125,71,162,'#a5bcb4',4);
  line(78,115,78,128,'#a46b31',1.5);line(78,128,89,128,'#a46b31',1.5);
  txt('坐位 · 屈膝 90°',18,190,13);
  g.save();g.translate(X,Y);
  if(sagittal)path('M-44 -215 L40 -215 Q55 -164 30 -89 Q14 -45 17 -10 Q24 11 6 26 Q-9 36 -30 26 Q-48 19 -44 -6 Q-42 -48 -53 -104 Q-66 -161 -44 -215Z',skin);
  else path('M-43 -179 L47 -179 Q61 -142 38 -72 Q29 -26 36 -5 Q40 9 26 19 Q4 30 -25 19 Q-47 13 -39 -8 Q-34 -40 -47 -104 Q-56 -151 -43 -179Z',skin);
  g.save();g.rotate(theta);
  if(sagittal){
    path('M-32 -16 Q-12 -25 13 -14 Q28 2 55 10 Q87 20 123 21 Q145 21 159 30 Q174 44 155 50 Q133 58 85 48 Q45 39 17 47 Q-11 58 -36 45 Q-55 35 -45 10Z',skin);
    line(21,22,121,33,'#b18469',2);circle(0,0,9,'#e6bfa5','#b58c73');
  }else{
    g.save();g.scale(side==='R'?1:-1,1);
    path('M-24 -13 Q-36 -5 -36 32 Q-37 63 -43 92 Q-51 115 -44 124 Q-36 134 -29 118 Q-33 139 -21 138 Q-11 137 -13 122 Q-15 146 -2 146 Q8 144 7 126 Q6 151 19 147 Q30 143 25 122 Q31 150 47 139 Q59 132 47 104 Q36 74 31 41 Q31 18 26 0 Q16 -15 -24 -13Z',skin);
    line(4,15,17,108,'#bb9279',2);g.restore();
  }
  if(mode==='被动'&&stage==='moving'){
    // The supporting glove follows the contact surface throughout passive motion.
    if(sagittal){g.save();if(move.key==='down'){g.translate(5,-6);g.scale(1,-1);g.translate(0,-45);}
      path('M172 115 L199 91 Q171 73 143 62 L106 45 Q95 40 91 46 Q87 53 101 60 L128 77 L91 59 Q78 54 78 62 Q79 70 95 78 L120 93 Q137 105 151 108Z','#c0ded6','#67978b');g.restore();}
    else{g.save();g.scale((side==='R'?1:-1)*(move.key==='in'?-1:1),1);
      path('M130 119 L147 91 Q125 74 94 65 L56 52 Q43 48 42 56 Q41 62 53 68 L76 81 L49 73 Q38 70 38 78 Q40 87 60 94 L86 108Z','#c0ded6','#67978b');g.restore();}
  }
  g.restore();
  if(stage!=='position'){
    const length=sagittal?150:128,neutral=sagittal?0:Math.PI/2,phi=neutral+theta;
    line(0,0,Math.cos(neutral)*length,Math.sin(neutral)*length,'#70897e',2,[5,6]);
    line(0,0,0,-141,'#16736a',10);
    circle(0,0,58,'rgba(244,251,247,.74)','#598e82');
    for(let i=0;i<360;i+=5){let a=rad(i),r=i%15===0?48:53;line(Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*57,Math.sin(a)*57,'#5a7e72',1);}
    line(0,0,Math.cos(phi)*length,Math.sin(phi)*length,'#b86a23',8);
    circle(0,0,6,'#fffcf2','#25534b');
    txt(sagittal?'外踝':'踝前中点',-115,-12,14);
  }
  g.restore();txt('固定臂',19,H-23,14,'#16736a');txt('移动臂',91,H-23,14,'#9c5318');
  txt(stage==='position'?'中立位':move.name+'  '+Math.round(angle)+'°',W-168,H-23,22,'#154b40',700);
}

export function mountGoniometer({host,receipt,onRead,onSave,voice,isPaused,onDone,skip}){
  const panel=element('section');panel.className='gonio-panel';host.replaceChildren(panel);
  let i=romTrials.findIndex(t=>!validReading(receipt,t));if(i<0)i=0;
  let stage='position',angle=0,disposed=false,frame=0;
  const heading=element('h3'),count=element('small'),canvas=element('canvas');
  canvas.setAttribute('role','img');
  const cue=element('p'),readout=element('strong'),controls=element('div'),tableSlot=element('div');
  controls.className='gonio-actions';
  const summary=element('details');summary.append(element('summary','查看双侧记录（°）'),tableSlot);
  function btn(label,fn){const b=element('button',label);b.type='button';b.addEventListener('click',fn);controls.append(b);return b;}
  function draw(){const t=romTrials[i];figure(canvas,t,stage,angle);canvas.setAttribute('aria-label',sideLabel(t.side)+'踝'+t.mode+t.move.name+'，从中立位起 '+Math.round(angle)+' 度');}
  function view(){
    const t=romTrials[i],s=t.move.sagittal;
    count.textContent='病例模拟 · 已记录 '+romTrials.filter(t=>validReading(receipt,t)).length+' / 16';
    heading.textContent=sideLabel(t.side)+'踝 · '+t.move.name+' · '+t.mode;
    controls.replaceChildren();tableSlot.replaceChildren(romTable(receipt));
    readout.textContent=stage==='read'?'终末读数　'+t.angle+'°':'';
    if(stage==='position'){
      cue.textContent='患者坐在床边，膝屈 90°，小腿自然下垂。将足踝摆到中立位。';
      btn('摆好体位，放置量角器',()=>{stage='aligned';view();});
    }else if(stage==='aligned'){
      cue.textContent=s?'外侧对线。轴心对准外踝，固定臂沿腓骨指向腓骨头，移动臂平行第五跖骨。小腿与足约成直角，中立位记 0°。':'前方对线。轴心置于两踝之间的踝前中点，固定臂沿小腿前中线指向胫骨结节，移动臂沿第二跖骨。保持背伸、跖屈中立。';
      btn(t.mode==='主动'?'观察患者主动'+t.move.name:'观察治疗师辅助'+t.move.name,run);
    }else if(stage==='moving'){
      cue.textContent=t.mode==='主动'?'患者自己活动，小腿保持稳定。移动臂随足转动。':'治疗师固定小腿远端，轻托足部带动，在第一个明确阻力点或疼痛前停下。';
    }else{
      cue.textContent='从中立位到终末位的角度变化，记为'+t.move.name+' '+t.angle+'°。';
      btn(i<15?'记录，测下一项':'记录并听治疗师报告',()=>{
        if(!validReading(receipt,t)){receipt.readings[t.key]=t.angle;onRead(t,receipt);}
        if(i===15 && romComplete(receipt)){onDone();return;}
        i=romTrials.findIndex(trial=>!validReading(receipt,trial));if(i<0)i=0;
        stage='aligned';if(i===8||romTrials[i].move.sagittal!==romTrials[Math.max(0,i-1)].move.sagittal)stage='position';
        angle=0;view();
      });
      btn('重看这次测量',()=>{stage='aligned';angle=0;view();});
    }
    draw();
  }
  function run(){
    if(stage!=='aligned')return;
    const t=romTrials[i];stage='moving';angle=0;view();
    voice(t.mode==='主动'?'请您自己活动脚踝，到舒服的尽头就停。':'现在放松，我托着您的脚慢慢带一下，疼了就告诉我。');
    let last=performance.now(),elapsed=0;
    function tick(now){
      if(disposed||!panel.isConnected)return;
      if(!isPaused()&&!document.hidden)elapsed+=Math.min(100,now-last);
      last=now;const a=Math.min(1,elapsed/1650);angle=t.angle*a*a*(3-2*a);draw();
      if(a===1){stage='read';view();}else frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
  }
  panel.append(count,heading,canvas,cue,readout,controls,summary);
  if(romComplete(receipt)){stage='read';i=15;angle=romTrials[15].angle;}
  view();return ()=>{disposed=true;cancelAnimationFrame(frame);};
}
