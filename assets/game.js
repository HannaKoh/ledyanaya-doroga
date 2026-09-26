const $=id=>document.getElementById(id),stage=$('prototype'),screen=$('screen'),game=$('playfield'),canvas=$('gameCanvas'),toast=$('toast');
let ctx=canvas.getContext('2d'),closingSkates=null;
const screens={compact:'assets/ui-compact.png',start:'assets/ui-start.png',playing:'assets/ui-playing.png',hit:'assets/ui-hit.png','round-end':'assets/ui-round-end.png',final:'assets/ui-booking-accepted.png',booking:'assets/ui-booking-accepted.png'};
const screenPreloads={};
const screenReady={};
for(const name of ['start','playing','round-end','final','booking']){const image=new Image();screenPreloads[name]=image;image.src=screens[name];screenReady[name]=image.decode().catch(()=>{})}
const TEASER_REVEAL_MS=1500;
const FIELD_MORPH_MS=800,FIELD_REVEAL_MS=240,FIELD_ELEMENTS_EXIT_MS=1050;
const PLAY_ENTRY_MS=1950,SKATES_ENTRY_DELAY_MS=1000,SKATES_ENTRY_MS=900;
const SKATES_GAME_WIDTH=.21,SKATES_GAME_HEIGHT_RATIO=.60,SKATES_START_X=.17,SKATES_START_Y=.508;
const ROUND_WORLD=8.86,ROUND_METERS=30,BASE_SPEED=.27,ICE_BOOST_SPEED=.33,ICE_BOOST_DECAY=1.15;
stage.dataset.teaserDismissed='false';stage.dataset.teaserReturning='true';
sessionStorage.removeItem('ice-teaser-dismissed');
let state='compact',W=0,H=0,dpr=1,running=false,demo=false,terminal=false,closing=false,closeTimer=0,fieldTransitioning=false,fieldTimer=0,exitTarget='compact',exitDemo=false,playEntryAt=0,playEntryDuration=0,round=0,score=0,count=0,world=0,roundElapsed=0,boost=0,last=0,raf=0;
let combo=0,lastFirstIceY=null;
let player={x:SKATES_START_X,y:SKATES_START_Y,target:SKATES_START_Y,lean:0},keys={up:false,down:false},puddles=[],particles=[];
const skatesSource=new Image();let skatesSprite=null;skatesSource.src='assets/iridescent-skates-top.png';skatesSource.onload=()=>{const c=document.createElement('canvas');c.width=skatesSource.naturalWidth;c.height=skatesSource.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(skatesSource,0,0);const im=x.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];if(r>165&&g>45&&g<195&&b<115&&r>g*1.28&&g>b*1.28)d[i+3]=0}x.putImageData(im,0,0);skatesSprite=c};
const iceSequence=[[.72,.68,.35,.28,30],[1.15,.38,.28,.25,10],[1.58,.57,.39,.30,30],[2.02,.75,.29,.25,10],[2.46,.31,.35,.28,30],[2.89,.55,.28,.25,10],[3.33,.72,.39,.30,30],[3.77,.40,.29,.25,10],[4.20,.61,.35,.28,30],[4.64,.28,.28,.25,10],[5.08,.48,.39,.30,30],[5.52,.73,.29,.25,10]];
const layout=Array.from({length:19},(_,i)=>{const cycle=Math.floor(i/iceSequence.length),p=iceSequence[i%iceSequence.length];return[p[0]+cycle*5.28,Math.max(.28,Math.min(.75,p[1]+(cycle===1?.035:cycle===2?-.025:0))),p[2],p[3],p[4]]});
function setState(next){screen.src=['compact','start','playing'].includes(next)?round>0?screens['round-end']:screens.compact:screens[next];state=next;stage.dataset.state=next;stage.dataset.round=String(round);document.querySelector('.static-game').setAttribute('aria-hidden',String(next!=='final'));if(next!=='start'){closing=false;stage.dataset.closing='false'}}
function resetPuddles(){
  combo=0;
  let previousY=SKATES_START_Y;
  puddles=layout.map((p,i)=>{
    let y;
    if(i===0){
      y=.31+Math.random()*.42;
      for(let attempt=0;lastFirstIceY!==null&&Math.abs(y-lastFirstIceY)<.14&&attempt<8;attempt++)y=.31+Math.random()*.42;
      if(lastFirstIceY!==null&&Math.abs(y-lastFirstIceY)<.14)y=lastFirstIceY<.52?.73:.31;
      lastFirstIceY=y;
    }else{
      const step=.13+Math.random()*.15,direction=Math.random()<.5?-1:1;
      const nextY=previousY+step*direction;
      y=Math.max(.31,Math.min(.73,nextY<.31||nextY>.73?previousY-step*direction:nextY));
    }
    previousY=y;
    return {base:p[0]+(Math.random()-.5)*.05,y,w:p[2],h:p[3]*.8,pts:p[4],hit:false,traversing:false,passed:false,rideTime:0,centeredTime:0,lastRideAt:null,id:i};
  });
}
function createSnow(){document.querySelectorAll('.snow').forEach(s=>{
  const f=document.createDocumentFragment(),teaser=s.classList.contains('teaser-snow');
  for(let i=0;i<(teaser?26:78);i++){
    const e=document.createElement('i'),z=Math.random(),dr=(Math.random()-.5)*(teaser?14+z*28:28+z*74),sw=(Math.random()-.5)*(20+z*60);
    for(const [k,v] of Object.entries({
      '--x':`${Math.random()*100}%`,
      '--size':`${(teaser ? .8+z*2.3 : .7+z*5.6).toFixed(1)}px`,
      '--opacity':(teaser ? .25+z*.5 : .18+z*.66).toFixed(2),
      '--blur':`${teaser?0:Math.max(0,(z-.72)*2.5).toFixed(1)}px`,
      '--duration':`${(teaser?4.5+Math.random()*4:9+Math.random()*15-z*3).toFixed(1)}s`,
      '--delay':`${(-Math.random()*(teaser?8:24)).toFixed(1)}s`,
      '--sway':`${sw|0}px`,
      '--mid':`${(dr*.55+sw*.35)|0}px`,
      '--drift':`${dr|0}px`
    }))e.style.setProperty(k,v);
    f.append(e);
  }
  s.replaceChildren(f);
})}
function measureModal(){const r=stage.getBoundingClientRect(),modalWidth=r.width*.6096,modalHeight=modalWidth*900/1585,modalLeft=(innerWidth-modalWidth)/2,modalTop=(innerHeight-modalHeight)/2,teaserWidth=r.width*.09385,teaserHeight=r.height*.04332;stage.style.setProperty('--stage-width',`${r.width}px`);stage.style.setProperty('--stage-left',`${r.left}px`);stage.style.setProperty('--stage-top',`${r.top}px`);stage.style.setProperty('--modal-width',`${modalWidth}px`);stage.style.setProperty('--collapse-x',`${r.left+r.width*.531-modalLeft}px`);stage.style.setProperty('--collapse-y',`${r.top+r.height*.3475-modalTop}px`);stage.style.setProperty('--collapse-scale-x',String(teaserWidth/modalWidth));stage.style.setProperty('--collapse-scale-y',String(teaserHeight/modalHeight))}
function resize(){measureModal();const r=game.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,W*dpr);canvas.height=Math.max(1,H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
function play(isDemo=false){setState('playing');running=true;demo=isDemo;score=0;count=0;world=0;roundElapsed=0;boost=0;player.y=SKATES_START_Y;player.target=SKATES_START_Y;last=performance.now();playEntryAt=last;playEntryDuration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:PLAY_ENTRY_MS;resetPuddles();particles=[];$('score').textContent=0;$('puddlesCount').textContent=0;$('clock').textContent='00:00';$('distance').textContent=`${ROUND_METERS} м`;requestAnimationFrame(()=>{resize();game.focus();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop)})}
async function start(isDemo=false){if(terminal||closing||fieldTransitioning)return;const requestedState=state;await screenReady.playing;if(terminal||closing||fieldTransitioning||state!==requestedState)return;if(state==='start'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){beginIntroExit('playing',isDemo);return}play(isDemo)}
function stop(){running=false;cancelAnimationFrame(raf)}
function finishRound(){stop();clearTimeout(awardIce.t);toast.classList.remove('show');ctx.clearRect(0,0,W,H);$('resultClock').textContent=$('clock').textContent;$('resultDistance').textContent=$('distance').textContent;$('resultPuddles').textContent=count;$('resultScore').textContent=score;$('roundResult').textContent=`${score} очков`;$('finalResult').textContent=`${score} очков`;round++;if(round===1)setState('round-end');else{terminal=true;setState('final')}}
function touchIce(p){p.hit=true;boost=1;count++;$('puddlesCount').textContent=count}
const iceMessages={10:['Лёд пойман','Есть скольжение','Держи середину'],30:['Крупная льдина','Хороший проезд','Следующую — точнее']};
function awardIce(p){
  const precise=p.rideTime>=.18&&p.centeredTime/p.rideTime>=.8;
  combo=precise?combo+1:0;
  const bonus=precise?p.pts+10*Math.min(combo-1,3):0;
  const points=p.pts+bonus;
  score+=points;
  $('score').textContent=score;
  for(let i=0;i<(precise?28:20);i++)particles.push({x:player.x*W+25,y:player.y*H,vx:40+Math.random()*110,vy:(Math.random()-.5)*90,a:1});
  toast.firstElementChild.textContent=`+${points}`;
  const messages=iceMessages[p.pts];
  toast.lastElementChild.textContent=precise?(combo>1?`Идеально · серия ×${combo}`:'Идеальная траектория'):messages[Math.floor(p.id/2)%messages.length];
  toast.classList.add('show');
  clearTimeout(awardIce.t);
  awardIce.t=setTimeout(()=>toast.classList.remove('show'),1100);
}
function updateProgress(){const seconds=Math.floor(roundElapsed),minutes=Math.floor(seconds/60);$('clock').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;$('distance').textContent=`${Math.max(0,Math.ceil(ROUND_METERS*(1-world/ROUND_WORLD)))} м`}
const px=p=>(p.base-world)*W;
function loop(now){
  if(!running)return;
  const dt=Math.min((now-last)/1000,.035);
  last=now;
  if(now-playEntryAt<playEntryDuration){
    const elapsed=now-playEntryAt;
    const t=Math.max(0,Math.min(1,(elapsed-SKATES_ENTRY_DELAY_MS)/SKATES_ENTRY_MS));
    const ease=1-Math.pow(1-t,3)+Math.sin(Math.PI*t)*.015;
    const w=W*SKATES_GAME_WIDTH,x=-w/2-12+(player.x*W+w/2+12)*ease;
    const iceOffset=.56*(1-elapsed/playEntryDuration);
    ctx.clearRect(0,0,W,H);
    drawPuddles(true,iceOffset);
    if(t>0){ctx.save();ctx.globalAlpha=t;drawTrail(x);ctx.restore()}
    drawPlayer(x);
    raf=requestAnimationFrame(loop);
    return;
  }
  roundElapsed+=dt;
  boost=Math.max(0,boost-dt*ICE_BOOST_DECAY);
  world+=dt*(BASE_SPEED+ICE_BOOST_SPEED*boost);
  if(demo){
    const current=puddles.find(p=>p.hit&&p.traversing&&!p.passed),next=puddles.filter(p=>!p.hit).map(p=>({...p,sx:px(p)})).filter(p=>p.sx>W*.15&&p.sx<W*.83).sort((a,b)=>a.sx-b.sx)[0];
    player.target=current?current.y:next?next.y:.56;
  }else{
    if(keys.up)player.target-=dt*.64;
    if(keys.down)player.target+=dt*.64;
  }
  player.target=Math.max(.24,Math.min(.80,player.target));
  const before=player.y;
  player.y+=(player.target-player.y)*Math.min(1,dt*5.8);
  player.lean=(player.y-before)/Math.max(dt,.001);
  ctx.clearRect(0,0,W,H);
  drawSpeed();drawPuddles();drawTrail();drawPlayer();drawParticles(dt);updateProgress();
  if(world>=ROUND_WORLD)finishRound();else raf=requestAnimationFrame(loop);
}
function puddlePath(ww,hh,id){
  ctx.beginPath();
  for(let i=0;i<=32;i++){
    const a=Math.PI*2*i/32;
    const ripple=1+.055*Math.sin(a*5+id*1.7)+.035*Math.sin(a*9-id*.8);
    const x=Math.cos(a)*ww*.5*ripple,y=Math.sin(a)*hh*.5*ripple;
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
  }
  ctx.closePath();
}
function iceRand(id,salt){const value=Math.sin((id+1)*127.1+salt*311.7)*43758.5453;return value-Math.floor(value)}
function drawPuddles(visualOnly=false,entryOffset=0){
  puddles.forEach(p=>{
    const x=px(p)+entryOffset*W,y=p.y*H;
    if(x<-W*.3||x>W*1.3)return;
    const ww=p.w*W,hh=p.h*H;
    ctx.save();
    ctx.translate(x,y);
    puddlePath(ww,hh,p.id);
    const ice=ctx.createLinearGradient(0,-hh*.65,0,hh*.65);
    ice.addColorStop(0,p.hit?'rgba(192,255,230,.62)':'rgba(243,252,255,.66)');
    ice.addColorStop(.22,p.hit?'rgba(96,244,172,.38)':'rgba(196,236,250,.34)');
    ice.addColorStop(.52,p.hit?'rgba(52,215,142,.22)':'rgba(117,200,234,.16)');
    ice.addColorStop(.78,p.hit?'rgba(100,240,190,.35)':'rgba(213,241,252,.34)');
    ice.addColorStop(1,p.hit?'rgba(204,255,237,.58)':'rgba(244,252,255,.58)');
    ctx.shadowColor=p.hit?'rgba(71,255,166,.78)':'rgba(227,250,255,.7)';
    ctx.shadowBlur=p.hit?24:13;
    ctx.fillStyle=ice;
    ctx.fill();
    ctx.shadowBlur=0;
    ctx.save();
    ctx.clip();
    const glint=iceRand(p.id,1)-.5;
    const sheen=ctx.createLinearGradient(-ww*.5,-hh*glint,ww*.5,hh*glint);
    sheen.addColorStop(0,'rgba(255,255,255,.13)');
    sheen.addColorStop(.4,'rgba(255,255,255,.04)');
    sheen.addColorStop(.72,'rgba(235,255,255,.28)');
    sheen.addColorStop(1,'rgba(255,255,255,.07)');
    ctx.fillStyle=sheen;
    ctx.fillRect(-ww*.55,-hh*.6,ww*1.1,hh*1.2);
    ctx.lineCap='round';
    const veinCount=4+Math.floor(iceRand(p.id,2)*5);
    for(let i=0;i<veinCount;i++){
      const yy=hh*(-.34+i*.68/Math.max(1,veinCount-1))+(iceRand(p.id,i+10)-.5)*hh*.07;
      const from=-ww*(.22+iceRand(p.id,i+30)*.22),to=ww*(.12+iceRand(p.id,i+50)*.31);
      const bend=(iceRand(p.id,i+70)-.5)*hh*.34;
      ctx.beginPath();
      ctx.moveTo(from,yy);
      ctx.bezierCurveTo(-ww*.18,yy+bend,ww*.11,yy-bend*.75,to,yy+bend*.28);
      ctx.strokeStyle=i%2?'rgba(217,247,255,.30)':'rgba(255,255,255,.44)';
      ctx.lineWidth=Math.max(1,hh*(.018+iceRand(p.id,i+90)*.04));
      ctx.stroke();
    }
    ctx.strokeStyle='rgba(226,252,255,.41)';
    ctx.lineWidth=Math.max(.8,hh*.018);
    const crackCount=2+Math.floor(iceRand(p.id,3)*3);
    for(let i=0;i<crackCount;i++){
      const side=i%2?-1:1,xx=ww*(iceRand(p.id,i+110)-.5)*.65;
      const yy=hh*(side*.22+(iceRand(p.id,i+130)-.5)*.12);
      const length=ww*(.07+iceRand(p.id,i+150)*.12);
      ctx.beginPath();
      ctx.moveTo(xx,yy);
      ctx.lineTo(xx+length*.38,yy-side*hh*.14);
      ctx.lineTo(xx+length,yy-side*hh*.09);
      ctx.moveTo(xx+length*.38,yy-side*hh*.14);
      ctx.lineTo(xx+length*.51,yy-side*hh*.24);
      ctx.stroke();
    }
    ctx.restore();
    puddlePath(ww,hh,p.id);
    ctx.strokeStyle=p.hit?'rgba(168,255,214,.9)':'rgba(246,254,255,.86)';
    ctx.lineWidth=Math.max(1,hh*.022);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(ww*(iceRand(p.id,4)-.5)*.13,-hh*(.16+iceRand(p.id,5)*.07),ww*(.33+iceRand(p.id,6)*.08),hh*.25,(iceRand(p.id,7)-.5)*.16,Math.PI*(1.06+iceRand(p.id,8)*.08),Math.PI*(1.79+iceRand(p.id,9)*.15));
    ctx.strokeStyle=p.hit?'rgba(226,255,238,.58)':'rgba(255,255,255,.56)';
    ctx.lineWidth=Math.max(.8,hh*.035);
    ctx.stroke();
    const n=p.pts===30?7:5,gap=Math.min(30,ww*.12);
    ctx.fillStyle='#fff';
    ctx.shadowBlur=0;
    ctx.font='700 '+Math.max(18,Math.min(34,W*.026))+'px Arial';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    for(let i=0;i<n;i++){
      const cx=(i-(n-1)/2)*gap;
      ctx.globalAlpha=.25+.75*i/(n-1);
      ctx.fillText('›',cx,0);
    }
    ctx.restore();
    if(visualOnly)return;
    const xx=player.x*W,yy=player.y*H;
    const skateHalf=W*SKATES_GAME_WIDTH*.785*.5,iceHalf=ww*.55;
    const aligned=Math.abs(y-yy)<hh*.48+13;
    const overlapping=x-iceHalf<=xx+skateHalf&&x+iceHalf>=xx-skateHalf;
    if(p.passed)return;
    if(overlapping){p.traversing=true;if(aligned&&!p.hit)touchIce(p)}
    const onIce=x-iceHalf<=xx&&x+iceHalf>=xx;
    if(p.hit&&onIce){
      const sample=p.lastRideAt===null?0:Math.max(0,Math.min(.05,roundElapsed-p.lastRideAt));
      p.rideTime+=sample;
      if(Math.abs(y-yy)<=hh*.18)p.centeredTime+=sample;
      p.lastRideAt=roundElapsed;
    }else p.lastRideAt=null;
    if(p.hit&&x+iceHalf<=xx){p.passed=true;awardIce(p)}
    else if(p.traversing&&x+iceHalf<xx-skateHalf){p.passed=true;combo=0}
  });
}
function drawSpeed(){if(!boost)return;ctx.save();ctx.lineCap='round';for(let i=0;i<10;i++){const y=H*(.22+((i*39)%62)/100),len=W*(.04+(i%3)*.018),o=(world*W*(5+i*.2)+i*137)%W;ctx.strokeStyle=`rgba(255,255,255,${boost*(.10+(i%3)*.035)})`;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(W-o,y);ctx.lineTo(W-o+len,y);ctx.stroke()}ctx.restore()}
function drawTrail(x=player.x*W){const y=player.y*H;ctx.save();ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=2.5;ctx.setLineDash([12,13]);ctx.beginPath();ctx.moveTo(x-W*.066,y);ctx.lineTo(-W*.05,y);ctx.stroke();ctx.restore()}
function drawPlayer(x=player.x*W){const y=player.y*H,w=W*SKATES_GAME_WIDTH,h=w*SKATES_GAME_HEIGHT_RATIO;ctx.save();ctx.translate(x,y);ctx.rotate(Math.max(-.1,Math.min(.1,player.lean*.01)));if(skatesSprite){ctx.shadowColor='rgba(23,65,132,.27)';ctx.shadowBlur=Math.max(4,W*.007);ctx.shadowOffsetY=Math.max(3,W*.004);ctx.drawImage(skatesSprite,-w/2,-h/2,w,h)}ctx.restore()}
function drawParticles(dt){particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx-=45*dt;p.a-=dt*1.5;ctx.fillStyle=`rgba(235,255,255,${Math.max(0,p.a)})`;ctx.beginPath();ctx.arc(p.x,p.y,1+Math.random()*2,0,Math.PI*2);ctx.fill()});particles=particles.filter(p=>p.a>0)}
function setKey(k,v){if(['ArrowUp','w','W'].includes(k))keys.up=v;if(['ArrowDown','s','S'].includes(k))keys.down=v}
function bindHold(id,key){const e=$(id);['pointerdown','touchstart'].forEach(ev=>e.addEventListener(ev,x=>{x.preventDefault();keys[key]=true}));['pointerup','pointerleave','touchend'].forEach(ev=>e.addEventListener(ev,()=>keys[key]=false))}
createSnow();resetPuddles();measureModal();window.addEventListener('resize',()=>{measureModal();if(running)resize()});window.addEventListener('scroll',measureModal,{passive:true});window.addEventListener('keydown',e=>{if(e.key==='Escape'&&['start','playing','round-end','final'].includes(state)){e.preventDefault();$('closeBtn').click();return}if(['ArrowUp','ArrowDown','w','W','s','S'].includes(e.key)){e.preventDefault();if(state==='start')start(false);if(running)setKey(e.key,true)}});window.addEventListener('keyup',e=>setKey(e.key,false));
async function openStart(){if(terminal||fieldTransitioning)return;fieldTransitioning=true;await screenReady.start;if(terminal||state!=='compact'){fieldTransitioning=false;return}if(matchMedia('(prefers-reduced-motion: reduce)').matches){setState('start');fieldTransitioning=false;return}stage.dataset.fieldTransition='opening';fieldTimer=setTimeout(()=>{setState('start');stage.dataset.fieldTransition='reveal';fieldTimer=setTimeout(()=>{stage.dataset.fieldTransition='';fieldTransitioning=false},FIELD_REVEAL_MS)},FIELD_MORPH_MS)}
function shrinkIntroField(){fieldTransitioning=true;stage.dataset.fieldTransition='closing';setState('compact');fieldTimer=setTimeout(()=>{stage.dataset.fieldTransition='';fieldTransitioning=false},FIELD_MORPH_MS)}
function shrinkActiveField(){
  if(fieldTransitioning)return;
  fieldTransitioning=true;
  stop();
  clearTimeout(awardIce.t);
  toast.classList.remove('show');
  const closingRound=state==='round-end';
  if(!closingRound){
    closingSkates=document.createElement('canvas');
    closingSkates.className='closing-skates';
    closingSkates.width=canvas.width;
    closingSkates.height=canvas.height;
    game.append(closingSkates);
    const liveCtx=ctx;
    ctx=closingSkates.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    drawTrail();
    drawPlayer();
    ctx=liveCtx;
    ctx.clearRect(0,0,W,H);
    drawPuddles(true);
  }
  stage.dataset.fieldTransition=closingRound?'round-elements-out':'playing-elements-out';
  fieldTimer=setTimeout(()=>{
    screen.src=round>0?screens['round-end']:screens.compact;
    stage.dataset.fieldTransition=closingRound?'round-close':'playing-close';
    fieldTimer=setTimeout(()=>{
      setState('compact');
      stage.dataset.fieldTransition='';
      fieldTransitioning=false;
      closingSkates?.remove();
      closingSkates=null;
    },FIELD_MORPH_MS);
  },FIELD_ELEMENTS_EXIT_MS);
}
function shrinkFinalField(){if(fieldTransitioning)return;fieldTransitioning=true;stage.dataset.fieldTransition='final-close';fieldTimer=setTimeout(()=>{setState('booking');stage.dataset.fieldTransition='';fieldTransitioning=false},650)}
function finishIntroExit(){if(!closing)return;clearTimeout(closeTimer);closing=false;stage.dataset.closing='false';if(exitTarget==='playing')play(exitDemo);else shrinkIntroField();stage.dataset.exitTarget=''}
function beginIntroExit(target,isDemo=false){if(closing)return;closing=true;exitTarget=target;exitDemo=isDemo;stage.dataset.exitTarget=target;stage.dataset.closing='true';const card=document.querySelector('.intro-card');card.addEventListener('animationend',e=>{if(e.animationName==='intro-card-out')finishIntroExit()},{once:true});closeTimer=setTimeout(finishIntroExit,2600)}
$('teaserBtn').addEventListener('click',openStart);$('startBtn').addEventListener('click',()=>start(false));$('restartBtn').addEventListener('click',()=>start(false));$('closeBtn').addEventListener('click',()=>{if(closing||fieldTransitioning)return;if(state==='final'){if(matchMedia('(prefers-reduced-motion: reduce)').matches)setState('booking');else shrinkFinalField();return}if(terminal)return;if(state==='start'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){beginIntroExit('compact');return}if((state==='playing'||state==='round-end')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){shrinkActiveField();return}stop();setState('compact')});document.querySelector('.game-modal-overlay').addEventListener('click',()=>$('closeBtn').click());document.querySelectorAll('.feedback-button').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.feedback-button').forEach(option=>option.setAttribute('aria-pressed',String(option===button)))}));bindHold('upBtn','up');bindHold('downBtn','down');
setTimeout(()=>{stage.dataset.teaserReturning='false'},TEASER_REVEAL_MS);
const webContext=document.modelContext;if(webContext?.registerTool){const a=new AbortController();Promise.resolve(webContext.registerTool({name:'start_ice_route',title:'Начать ледяную дорогу',description:'Открывает и запускает мини-игру.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['play','demo']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){start(input.mode==='demo');return{status:'started',mode:input.mode}}},{signal:a.signal})).catch(()=>{});Promise.resolve(webContext.registerTool({name:'read_ice_route_score',title:'Счёт ледяной дороги',description:'Возвращает состояние игры.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return{status:terminal?'finished':running?'running':state,score,puddles:count,round}}},{signal:a.signal})).catch(()=>{})}
