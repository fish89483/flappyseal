(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const H = canvas.height, ground = H - 54;
  let W = canvas.width = Math.round(H * Math.min(innerWidth,768) / innerHeight);
  ctx.imageSmoothingEnabled = false;
  const sealSize = {x:29, width:144, height:72};
  const sealMasks = {};
  const overlay = document.querySelector('#overlay'), hud = document.querySelector('#hud');
  const scoreEl = document.querySelector('#score'), bestEl = document.querySelector('#best');
  const pauseCover = document.querySelector('#pauseCover');
  const pauseButton = document.querySelector('#pause');
  const soundToggle = document.querySelector('#soundToggle');
  const bounceStrength = 390 * 0.72;
  let soundEnabled = true, audioContext;
  soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.setAttribute('aria-label', `拍肚音效：${soundEnabled?'開':'關'}`);
    soundToggle.title = `拍肚音效：${soundEnabled?'開':'關'}`;
    if(soundEnabled){
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(AudioContextClass){audioContext ||= new AudioContextClass();audioContext.resume();}
    }
    soundToggle.blur();
  });
  function playSlapSound(){
    if(!soundEnabled)return;
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass)return;
    audioContext ||= new AudioContextClass();
    if(audioContext.state==='suspended')audioContext.resume();
    const now=audioContext.currentTime;
    // Broadband attack and a tiny second impact give each slap a dry hand-clap texture.
    const buffer=audioContext.createBuffer(1,Math.ceil(audioContext.sampleRate*.075),audioContext.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    const slap=audioContext.createBufferSource(), filter=audioContext.createBiquadFilter(), gain=audioContext.createGain();
    slap.buffer=buffer;
    filter.type='bandpass';filter.frequency.value=2100;filter.Q.value=.65;
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.56,now+.001);
    gain.gain.exponentialRampToValueAtTime(.12,now+.009);
    gain.gain.exponentialRampToValueAtTime(.32,now+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.065);
    slap.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);
    slap.start(now);slap.stop(now+.075);
    const body=audioContext.createOscillator(), bodyGain=audioContext.createGain();
    body.type='sine';body.frequency.setValueAtTime(210,now);
    body.frequency.exponentialRampToValueAtTime(100,now+.035);
    bodyGain.gain.setValueAtTime(.0001,now);
    bodyGain.gain.exponentialRampToValueAtTime(.096,now+.002);
    bodyGain.gain.exponentialRampToValueAtTime(.0001,now+.045);
    body.connect(bodyGain);bodyGain.connect(audioContext.destination);
    body.start(now);body.stop(now+.05);
  }
  const assets = {};
  const loadedAssets = new Set();
  let assetFailed = false;
  function assetLoaded(key) {
    loadedAssets.add(key);
    if (!assetFailed && loadedAssets.size === 7) {
      startButton.disabled = false;
      startButton.innerHTML = '開始遊戲 <span>→</span>';
    }
  }
  function assetError() {
    assetFailed = true;
    startButton.disabled = true;
    startButton.textContent = '素材載入失敗，請重新整理';
  }
  // Head and torso only: tail and protruding flipper tips may brush the ice.
  function isSealBodyPoint(x,y){
    const nx=x/sealSize.width,ny=y/sealSize.height;
    return ((nx-.55)/.28)**2+((ny-.52)/.32)**2<=1
      || ((nx-.77)/.10)**2+((ny-.31)/.20)**2<=1;
  }
  for (const [key, src] of Object.entries({lift:'assets/seal-lift.png?v=thick-1', slap:'assets/seal-slap.png?v=thick-1', hit:'assets/seal-collision.png?v=thick-collision-2'})) {
    assets[key] = new Image();
    assets[key].onload = () => {
      if(key==='hit'){assetLoaded(key);return;}
      const tile=document.createElement('canvas');tile.width=sealSize.width;tile.height=sealSize.height;
      const c=tile.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(assets[key],0,0,sealSize.width,sealSize.height);
      const rgba=c.getImageData(0,0,sealSize.width,sealSize.height).data, points=[];
      // Intersect the body regions with the opaque sprite and inset the edge one pixel.
      for(let y=1;y<sealSize.height-1;y++)for(let x=1;x<sealSize.width-1;x++){
        if(isSealBodyPoint(x,y)&&[[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>rgba[((y+dy)*sealSize.width+x+dx)*4+3]>200))points.push([x,y]);
      }
      sealMasks[key]=points;
      assetLoaded(key);
    };
    assets[key].onerror = assetError;
    assets[key].src = src;
  }
  function sealPose() { return state.mode==='over'?'hit':(state.flap>0?'slap':'lift'); }
  const state = { mode:'ready', x:sealSize.x+sealSize.width/2, y:300, vy:0, score:0, best:0, pipes:[], time:0, flap:0, angle:0, pausedFrom:'play', hasFlapped:false, enteredSlide:false };
  try { const best = Number(localStorage.getItem('seal-best') || 0); state.best = Number.isSafeInteger(best) && best >= 0 ? best : 0; } catch {} bestEl.textContent = state.best;
  const rand = (a,b) => a + Math.random()*(b-a);
  function start() { if(assetFailed||loadedAssets.size!==7)return;document.activeElement?.blur();state.mode='play';state.x=sealSize.x+sealSize.width/2;state.hasFlapped=false;state.enteredSlide=false;state.y=300;state.vy=0;state.score=0;state.pipes=[];state.time=0;state.flap=0;state.angle=0;spawn(Math.min(W+70,430));overlay.classList.add('hidden');hud.classList.add('visible');pauseButton.hidden=false;scoreEl.textContent='0'; }
  function spawn(x) { const gap=pipeGap(state.score), mid=rand(235,410);state.pipes.push({x,mid,gap,passed:false}); }
  // Increase density every three points, only when placing the next column.
  function pipeSpacing(score) { return Math.max(190,320-Math.floor(score/3)*12); }
  function pipeGap(score) { return Math.max(sealSize.height*2,190-Math.floor(score/3)*6); }
  function flap() { if(state.mode==='ready'){start();} if(state.mode==='play'){state.hasFlapped=true;state.vy=-bounceStrength;state.flap=.19;state.angle=-12*Math.PI/180;playSlapSound();} }
  function finish(cause) {
    if(state.mode!=='play')return;
    if(SealSlideCore.hiddenEntry(state.hasFlapped,cause,state.enteredSlide)){
      state.enteredSlide=true;
      render(false);
      const snapshot=document.createElement('canvas');snapshot.width=W;snapshot.height=H;
      snapshot.getContext('2d').drawImage(canvas,0,0);
      state.mode='slide';hud.classList.remove('visible');pauseButton.hidden=true;document.querySelector('.game-wrap').classList.add('slide-active');
      slideGame.beginEntry({snapshot,side:assets.hit,x:state.x/W,y:state.y/H,w:sealSize.width/W,angle:state.angle,vy:state.vy/H,slope:groundSlope(),hops:SealSlideCore.entryHopCount(state.x/W)});
      return;
    }
    state.mode='over';hud.classList.remove('visible');pauseButton.hidden=true;if(state.score>state.best){state.best=state.score;bestEl.textContent=state.best;try{localStorage.setItem('seal-best',state.best)}catch{}}document.querySelector('#headline').textContent='哎呀，撞到冰了！';document.querySelector('#description').classList.add('result');document.querySelector('#description').innerHTML=`這次穿過了 <b>${state.score}</b> 組冰柱`;document.querySelector('#start').innerHTML='再玩一次 <span>↻</span>';overlay.classList.remove('hidden'); }
  function pause() { if(state.mode==='play'){state.mode='paused';pauseButton.hidden=true;pauseCover.classList.add('visible')}else if(state.mode==='paused'){state.mode='play';pauseButton.hidden=false;pauseCover.classList.remove('visible')} }
  document.querySelector('#start').addEventListener('click',e=>{e.stopPropagation();start()});
  pauseButton.addEventListener('click',e=>{e.stopPropagation();if(['play','paused'].includes(state.mode))pause()});
  pauseCover.addEventListener('pointerdown',e=>{e.preventDefault();if(state.mode==='paused')pause()});
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();if(state.mode==='paused'){pause();return}if(state.mode==='play'||state.mode==='ready')flap()});
  window.addEventListener('keydown',e=>{if(e.repeat)return;if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();if(state.mode==='paused')pause();else if(state.mode==='play'||state.mode==='ready')flap()}if(e.code==='Escape'&&['play','paused'].includes(state.mode))pause()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='play')pause()});
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h))}
  // Draw scenery on a shared two-pixel grid for crisp, consistent pixel art.
  const scenery = document.createElement('canvas');
  scenery.width=W;scenery.height=H;
  const scene = scenery.getContext('2d');
  const noise = (n) => { const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v); };
  function block(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.floor(x/2)*2,Math.floor(y/2)*2,Math.ceil(w/2)*2,Math.ceil(h/2)*2)}
  function cloud(x,y,s){
    const heights=[2,5,8,15,21,29,24,18,14,9,7,3];
    heights.forEach((h,i)=>{block(scene,x+i*5*s,y-h*s,5*s,h*s,'#a3d9ff');block(scene,x+i*5*s,y-h*s,5*s,Math.max(3,h*.35)*s,'#eefaff')});
    block(scene,x+9*s,y,43*s,4*s,'#92cff8');
  }
  function mountain(cx,peak,width,base){
    for(let x=cx-width;x<cx+width;x+=2){
      const d=(x-cx)/width;
      const top=peak+Math.abs(d)*(base-peak);
      block(scene,x,top,2,base-top,'#79bdf5');
      const ridge=cx+(top-peak)*.20;
      const snowy=x>=ridge-5 || Math.abs(d)>.84;
      if(snowy)block(scene,x,top,2,base-top,'#edfaff');
      else {
        const snowDepth=8+noise(Math.floor(x/8))*12;
        block(scene,x,top,2,snowDepth,'#c4e8ff');
        const stripeY=top+(base-top)*.58;
        block(scene,x,stripeY,2,Math.max(4,(base-top)*.12),'#abdfff');
      }
      if(x>cx+8 && x<cx+width*.70){
        const shade=top+12+(x-cx)*.25;
        if(shade<base-6)block(scene,x,shade,2,Math.min(20,base-shade),'#a5d8fc');
      }
    }
  }
  function buildScenery(){
    const sky=scene.createLinearGradient(0,0,W,470);sky.addColorStop(0,'#2797f5');sky.addColorStop(1,'#3ba9fa');scene.fillStyle=sky;scene.fillRect(0,0,W,H);
    for(let offset=0;offset<W;offset+=360){scene.save();scene.translate(offset,0);
    cloud(-10,126,1.3);cloud(131,205,.8);cloud(280,274,.85);cloud(-12,280,.75);cloud(5,389,.95);cloud(151,399,.55);cloud(292,389,.6);
    mountain(-15,444,80,501);mountain(67,427,75,501);mountain(158,416,88,501);mountain(268,433,83,501);mountain(365,426,92,501);
    mountain(25,436,71,503);mountain(113,412,84,503);mountain(219,438,76,503);mountain(309,430,72,503);
    scene.restore();}
    const sea=scene.createLinearGradient(0,498,0,H);sea.addColorStop(0,'#0877ce');sea.addColorStop(.4,'#0061ba');sea.addColorStop(1,'#004ca6');scene.fillStyle=sea;scene.fillRect(0,498,W,H-498);
    for(let i=0;i<215;i++){
      const x=noise(i+10)*W,y=506+noise(i+400)*(H-506),w=4+noise(i+900)*17;
      block(scene,x,y,w,2+noise(i+220)*2,['#0783de','#158feb','#42b9fa','#0057ac'][i%4]);
    }
    [[24,524,29],[164,516,24],[275,540,37],[82,568,47],[327,608,39],[-8,598,38]].forEach(([x,y,w])=>{
      block(scene,x-4,y+5,w+8,4,'#369cdd');block(scene,x,y,w,5,'#b9e8ff');block(scene,x+w*.16,y-5,w*.65,10,'#e9faff');block(scene,x+w*.34,y-10,w*.3,8,'#fff');block(scene,x+w*.22,y,w*.18,5,'#80caf1');
    });
  }
  buildScenery();
  function background(){ctx.drawImage(scenery,0,0)}
  const iceTextures = new Map();
  const icePeak = new Image(), icefield = new Image();
  let peakRegion, groundTile;
  // Ignore transparent export padding, including nearly transparent fringe pixels.
  function opaqueRegion(image){
    const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
    const g=c.getContext('2d');g.drawImage(image,0,0);
    const a=g.getImageData(0,0,c.width,c.height).data;
    let left=c.width,top=c.height,right=-1,bottom=-1;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(a[(y*c.width+x)*4+3]>200){
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error('Empty icefield asset');
    return {x:left,y:top,w:right-left+1,h:bottom-top+1};
  }
  icePeak.onload=()=>{try{peakRegion=opaqueRegion(icePeak);iceTextures.clear();assetLoaded('peak')}catch{assetError()}};
  icePeak.onerror=assetError;
  icePeak.src='assets/icefield/snowcap-pillar-white.png?v=1';
  icefield.onload=()=>{
    try{
      const r=opaqueRegion(icefield),tile=document.createElement('canvas');
      tile.height=H-ground;tile.width=Math.max(1,Math.round(r.w*tile.height/r.h));
      const c=tile.getContext('2d');c.imageSmoothingEnabled=false;
      c.drawImage(icefield,r.x,r.y,r.w,r.h,0,0,tile.width,tile.height);
      groundTile={tile,alpha:c.getImageData(0,0,tile.width,tile.height).data};
      assetLoaded('ground');
    }catch{assetError()}
  };
  icefield.onerror=assetError;
  icefield.src='assets/icefield/icefield-base.png?v=1';
  function groundOffset(){return groundTile?Math.floor(state.time*2.5)%groundTile.tile.width:0}
  // Keep the fixed downhill slope subtle even in a wide desktop window.
  function groundSlope(){return Math.min(.05,36/Math.max(1,W-sealSize.x-sealSize.width/2))}
  function groundShift(x){return groundSlope()*(x-sealSize.x-sealSize.width/2)}
  function drawIcefield(){
    if(!groundTile)return;
    ctx.save();ctx.transform(1,groundSlope(),0,1,0,groundShift(0));
    for(let x=-groundOffset();x<W;x+=groundTile.tile.width){
      ctx.drawImage(groundTile.tile,x,ground);
      ctx.drawImage(groundTile.tile,0,groundTile.tile.height-1,groundTile.tile.width,1,x,H-1,groundTile.tile.width,Math.ceil(-groundShift(0))+2);
    }
    ctx.restore();
  }
  function touchesGround(points){
    if(!groundTile)return false;
    const {tile,alpha}=groundTile,offset=groundOffset();
    return points.some(([x,y])=>{
      if(y>=H)return true;
      y=Math.floor(y-groundShift(x));
      if(y>=H)return true;
      if(y<ground)return false;
      const tx=((x+offset)%tile.width+tile.width)%tile.width;
      return alpha[((y-ground)*tile.width+tx)*4+3]>200;
    });
  }
  const iceSheet = new Image();
  const startButton = document.querySelector('#start');
  startButton.disabled = true;
  iceSheet.onload = () => { iceTextures.clear();assetLoaded('ice'); };
  iceSheet.onerror = assetError;
  iceSheet.src = 'assets/ice/ice-pillars-reference-v1.png';
  const slideGame=SealSlide.create({host:document.querySelector('.game-wrap'),onExit:()=>{
    document.querySelector('.game-wrap').classList.remove('slide-active');
    state.mode='ready';state.x=sealSize.x+sealSize.width/2;state.y=300;state.vy=0;state.angle=0;state.pipes=[];state.flap=0;
    overlay.classList.remove('hidden');hud.classList.remove('visible');pauseCover.classList.remove('visible');pauseButton.hidden=true;
    document.querySelector('#headline').textContent='FlappySeal';
    document.querySelector('#description').classList.remove('result');
    document.querySelector('#description').innerHTML='點一下，拍肚子往上彈！<br>穿過冰柱，看看能游多遠。';
    startButton.innerHTML='開始遊戲 <span>→</span>';startButton.focus();
  }});
  slideGame.ready.then(ok=>ok?assetLoaded('slide'):assetError());

  // Keep the original hanging icicle; lower obstacles use the separate peak sprite.
  // Stretch only the straight shaft; keep the snowy tips at their original aspect ratio.
  const iceRegions = {
    top: {x:290,y:83,w:289,bodyH:817,capY:900,capH:258}
  };
  function iceTexture(h,top){
    const height=Math.max(1,Math.round(h)),key=height+':'+top;
    if(!iceTextures.has(key)){
      const tile=document.createElement('canvas');tile.width=62;tile.height=height;
      const c=tile.getContext('2d');c.imageSmoothingEnabled=false;
      if(!top&&peakRegion){
        // Keep the snowcap and foot at a fixed scale; only the long shaft changes height.
        const r=peakRegion,capSource=Math.round(r.h*.25),footSource=Math.round(r.h*.09);
        const capHeight=Math.min(height,Math.round(capSource*tile.width/r.w));
        const footHeight=Math.min(height-capHeight,Math.round(footSource*tile.width/r.w));
        const shaftHeight=height-capHeight-footHeight;
        c.drawImage(icePeak,r.x,r.y,r.w,capSource,0,0,tile.width,capHeight);
        if(shaftHeight>0)c.drawImage(icePeak,r.x,r.y+capSource,r.w,r.h-capSource-footSource,0,capHeight,tile.width,shaftHeight);
        if(footHeight>0)c.drawImage(icePeak,r.x,r.y+r.h-footSource,r.w,footSource,0,height-footHeight,tile.width,footHeight);
      }else if(top&&iceSheet.complete&&iceSheet.naturalWidth){
        const r=iceRegions.top;
        const capHeight=Math.min(height,Math.round(r.capH*62/r.w));
        const bodyHeight=height-capHeight;
        if(bodyHeight>0)c.drawImage(iceSheet,r.x,r.y,r.w,r.bodyH,0,0,62,bodyHeight);
        c.drawImage(iceSheet,r.x,r.capY,r.w,r.capH,0,bodyHeight,62,capHeight);
      }
      if(iceTextures.size >= 64) iceTextures.delete(iceTextures.keys().next().value);
      iceTextures.set(key,{tile,alpha:c.getImageData(0,0,tile.width,height).data});
    }
    return iceTextures.get(key);
  }
  function ice(x,y,h,top){
    const {tile}=iceTexture(h,top);
    ctx.drawImage(tile,top?Math.round(x):Math.round(x)+31-Math.floor(tile.width/2),Math.round(y));
  }
  // Bury lower pillars below the canvas so sloped snow always covers their feet.
  function lowerIceHeight(p){return H+16-(p.mid+p.gap/2)}
  function obstacleRight(p){
    const lower=iceTexture(lowerIceHeight(p),false).tile;
    return Math.max(Math.round(p.x)+62,Math.round(p.x)+31-Math.floor(lower.width/2)+lower.width);
  }
  function touchesIce(p,points){
    const radius=Math.hypot(sealSize.width,sealSize.height)/2,centerX=state.x;
    const topHeight=p.mid-p.gap/2,bottomY=p.mid+p.gap/2;
    const upper=iceTexture(topHeight,true),lower=iceTexture(lowerIceHeight(p),false);
    const upperX=Math.round(p.x),lowerX=upperX+31-Math.floor(lower.tile.width/2);
    if(Math.min(upperX,lowerX)>centerX+radius||Math.max(upperX+62,lowerX+lower.tile.width)<centerX-radius)return false;
    for(const [wx,y] of points){
      const x=wx-upperX;
      if(x>=0&&x<62&&y>=0&&y<upper.tile.height&&upper.alpha[(y*62+x)*4+3]>200)return true;
      const lx=wx-lowerX;
      const by=y-Math.round(bottomY);
      if(lx>=0&&lx<lower.tile.width&&by>=0&&by<lower.tile.height&&lower.alpha[(by*lower.tile.width+lx)*4+3]>200)return true;
    }
    return false;
  }
  // The same center and rotation drive drawing and the collision mask.
  function sealWorldPoints(){
    const points=sealMasks[sealPose()]||[];
    const cos=Math.cos(state.angle),sin=Math.sin(state.angle);
    const cx=state.x,cy=Math.round(state.y);
    return points.map(([x,y])=>{
      const dx=x-sealSize.width/2,dy=y-sealSize.height/2;
      return [Math.round(cx+dx*cos-dy*sin),Math.round(cy+dx*sin+dy*cos)];
    });
  }
  function seal(){
    const asset=assets[sealPose()];
    ctx.save();
    ctx.translate(state.x,Math.round(state.y));
    ctx.rotate(state.angle);
    ctx.imageSmoothingEnabled=false;
    if(asset?.complete&&asset.naturalWidth)ctx.drawImage(asset,-sealSize.width/2,-sealSize.height/2,sealSize.width,sealSize.height);
    else{ctx.fillStyle='#fff6e7';ctx.beginPath();ctx.ellipse(0,0,sealSize.width*.39,sealSize.height*.41,0,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function render(showSeal=true){if(state.mode==='slide')return;background(state.time);for(const p of state.pipes){ice(p.x,0,p.mid-p.gap/2,true);ice(p.x,p.mid+p.gap/2,lowerIceHeight(p),false)}drawIcefield();if(showSeal)seal();}
  window.addEventListener('resize',()=>{
    W=canvas.width=Math.round(H*Math.min(innerWidth,768)/innerHeight);ctx.imageSmoothingEnabled=false;
    scenery.width=W;buildScenery();
  });
  // The first RAF timestamp can precede script initialization; never advance with negative time.
  let last=null;function loop(now){const dt=last===null?0:Math.max(0,Math.min((now-last)/1000,.035));last=now;if(state.mode==='play')state.flap=Math.max(0,state.flap-dt);if(state.mode==='play'){state.time+=dt*60;state.vy+=1120*dt;state.y+=state.vy*dt;
      const targetAngle=(-12+30*Math.max(0,Math.min(1,(state.vy+200)/500)))*Math.PI/180;
      state.angle+=(targetAngle-state.angle)*(1-Math.exp(-9*dt));
      for(const p of state.pipes){p.x-=150*dt;if(!p.passed&&obstacleRight(p)<state.x-sealSize.width/2){p.passed=true;state.score++;scoreEl.textContent=state.score;}}if(!state.pipes.length)spawn(W+5);while(state.pipes[state.pipes.length-1].x<W+5)spawn(state.pipes[state.pipes.length-1].x+pipeSpacing(state.score));state.pipes=state.pipes.filter(p=>obstacleRight(p)>0);
      const points=sealWorldPoints();
      for(const p of state.pipes){if(touchesIce(p,points)){finish('ice');break}}
      if(state.mode==='play'&&touchesGround(points))finish('ground');
      const minY=points.length?Math.min(...points.map(([,y])=>y)):0;
      if(minY<0){state.y-=minY;state.vy=Math.max(0,state.vy)}}render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
})();
