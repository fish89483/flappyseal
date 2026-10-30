(() => {
  const canvas = document.querySelector('#game'), ctx = canvas.getContext('2d');
  const H = canvas.height, ground = H - 54;
  let W = canvas.width = Math.round(H * innerWidth / innerHeight);
  ctx.imageSmoothingEnabled = false;
  const sealSize = {x:29, width:144, height:72};
  const sealMasks = {};
  const overlay = document.querySelector('#overlay'), hud = document.querySelector('#hud');
  const scoreEl = document.querySelector('#score'), bestEl = document.querySelector('#best');
  const pauseCover = document.querySelector('#pauseCover');
  const assets = {};
  const loadedAssets = new Set();
  let assetFailed = false;
  function assetLoaded(key) {
    loadedAssets.add(key);
    if (!assetFailed && loadedAssets.size === 4) {
      startButton.disabled = false;
      startButton.innerHTML = '開始遊戲 <span>→</span>';
    }
  }
  function assetError() {
    assetFailed = true;
    startButton.disabled = true;
    startButton.textContent = '素材載入失敗，請重新整理';
  }
  for (const [key, src] of Object.entries({lift:'assets/seal-lift.png', slap:'assets/seal-slap.png', hit:'assets/seal-collision.png'})) {
    assets[key] = new Image();
    assets[key].onload = () => {
      if(key==='hit'){assetLoaded(key);return;}
      const tile=document.createElement('canvas');tile.width=sealSize.width;tile.height=sealSize.height;
      const c=tile.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(assets[key],0,0,sealSize.width,sealSize.height);
      const rgba=c.getImageData(0,0,sealSize.width,sealSize.height).data, points=[];
      // Erode one pixel: transparent padding, thin whiskers and outline fringes do not hurt.
      for(let y=1;y<sealSize.height-1;y++)for(let x=1;x<sealSize.width-1;x++){
        if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>rgba[((y+dy)*sealSize.width+x+dx)*4+3]>200))points.push([x,y]);
      }
      sealMasks[key]=points;
      assetLoaded(key);
    };
    assets[key].onerror = assetError;
    assets[key].src = src;
  }
  const state = { mode:'ready', y:300, vy:0, score:0, best:0, pipes:[], time:0, flap:0, angle:0, pausedFrom:'play' };
  try { const best = Number(localStorage.getItem('seal-best') || 0); state.best = Number.isSafeInteger(best) && best >= 0 ? best : 0; } catch {} bestEl.textContent = state.best;
  const rand = (a,b) => a + Math.random()*(b-a);
  function start() { if(assetFailed||loadedAssets.size!==4)return;document.activeElement?.blur();state.mode='play';state.y=300;state.vy=0;state.score=0;state.pipes=[];state.time=0;state.flap=0;state.angle=0;spawn(Math.min(W+70,430));overlay.classList.add('hidden');hud.classList.add('visible');scoreEl.textContent='0'; }
  function spawn(x) { const gap=pipeGap(state.score), mid=rand(235,410);state.pipes.push({x,mid,gap,passed:false}); }
  // Increase density every three points, only when placing the next column.
  function pipeSpacing(score) { return Math.max(190,266-Math.floor(score/3)*12); }
  function pipeGap(score) { return Math.max(sealSize.height*2,190-Math.floor(score/3)*6); }
  function flap() { if(state.mode==='ready'){start();} if(state.mode==='play'){state.vy=-390;state.flap=.19;state.angle=-12*Math.PI/180;} }
  function finish() { if(state.mode!=='play')return;state.mode='over';hud.classList.remove('visible');if(state.score>state.best){state.best=state.score;bestEl.textContent=state.best;try{localStorage.setItem('seal-best',state.best)}catch{}}document.querySelector('#headline').textContent='哎呀，撞到冰了！';document.querySelector('#description').innerHTML=`這次穿過了 <b>${state.score}</b> 組冰柱`;document.querySelector('#start').innerHTML='再玩一次 <span>↻</span>';overlay.classList.remove('hidden'); }
  function pause() { if(state.mode==='play'){state.mode='paused';pauseCover.classList.add('visible')}else if(state.mode==='paused'){state.mode='play';pauseCover.classList.remove('visible')} }
  document.querySelector('#start').addEventListener('click',e=>{e.stopPropagation();start()});
  document.querySelector('#pause').addEventListener('click',e=>{e.stopPropagation();if(['play','paused'].includes(state.mode))pause()});
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
    block(scene,0,498,W,7,'#dff7ff');
    const sea=scene.createLinearGradient(0,503,0,H);sea.addColorStop(0,'#0877ce');sea.addColorStop(.4,'#0061ba');sea.addColorStop(1,'#004ca6');scene.fillStyle=sea;scene.fillRect(0,505,W,H-505);
    for(let i=0;i<215;i++){
      const x=noise(i+10)*W,y=506+noise(i+400)*(H-506),w=4+noise(i+900)*17;
      block(scene,x,y,w,2+noise(i+220)*2,['#0783de','#158feb','#42b9fa','#0057ac'][i%4]);
    }
    [[24,524,29],[164,516,24],[275,540,37],[82,568,47],[327,608,39],[-8,598,38]].forEach(([x,y,w])=>{
      block(scene,x-4,y+5,w+8,4,'#369cdd');block(scene,x,y,w,5,'#b9e8ff');block(scene,x+w*.16,y-5,w*.65,10,'#e9faff');block(scene,x+w*.34,y-10,w*.3,8,'#fff');block(scene,x+w*.22,y,w*.18,5,'#80caf1');
    });
    block(scene,0,ground,W,2,'#75cef2');
  }
  buildScenery();
  function background(){ctx.drawImage(scenery,0,0)}
  const iceTextures = new Map();
  const iceSheet = new Image();
  const startButton = document.querySelector('#start');
  startButton.disabled = true;
  iceSheet.onload = () => { iceTextures.clear();assetLoaded('ice'); };
  iceSheet.onerror = assetError;
  iceSheet.src = 'assets/ice/ice-pillars-reference-v1.png';
  // Source rectangles refer to the two complete columns in the approved PNG.
  // Stretch only the straight shaft; keep the snowy tips at their original aspect ratio.
  const iceRegions = {
    top: {x:290,y:83,w:289,bodyH:817,capY:900,capH:258},
    bottom: {x:700,y:163,w:325,bodyY:463,bodyH:600,capH:300}
  };
  function iceTexture(h,top){
    const height=Math.max(1,Math.round(h)),key=height+':'+top;
    if(!iceTextures.has(key)){
      const tile=document.createElement('canvas');tile.width=62;tile.height=height;
      const c=tile.getContext('2d');c.imageSmoothingEnabled=false;
      if(iceSheet.complete&&iceSheet.naturalWidth){
        const r=iceRegions[top?'top':'bottom'];
        const capHeight=Math.min(height,Math.round(r.capH*62/r.w));
        const bodyHeight=height-capHeight;
        if(top){
          if(bodyHeight>0)c.drawImage(iceSheet,r.x,r.y,r.w,r.bodyH,0,0,62,bodyHeight);
          c.drawImage(iceSheet,r.x,r.capY,r.w,r.capH,0,bodyHeight,62,capHeight);
        }else{
          c.drawImage(iceSheet,r.x,r.y,r.w,r.capH,0,0,62,capHeight);
          if(bodyHeight>0)c.drawImage(iceSheet,r.x,r.bodyY,r.w,r.bodyH,0,capHeight,62,bodyHeight);
        }
      }
      if(iceTextures.size >= 64) iceTextures.delete(iceTextures.keys().next().value);
      iceTextures.set(key,{tile,alpha:c.getImageData(0,0,62,height).data});
    }
    return iceTextures.get(key);
  }
  function ice(x,y,h,top){ctx.drawImage(iceTexture(h,top).tile,Math.round(x),Math.round(y))}
  function touchesIce(p,points){
    const radius=Math.hypot(sealSize.width,sealSize.height)/2,centerX=sealSize.x+sealSize.width/2;
    if(p.x>centerX+radius||p.x+62<centerX-radius)return false;
    const topHeight=p.mid-p.gap/2,bottomY=p.mid+p.gap/2;
    const upper=iceTexture(topHeight,true),lower=iceTexture(ground-bottomY,false);
    for(const [wx,y] of points){
      const x=wx-Math.round(p.x);
      if(x<0||x>=62)continue;
      if(y>=0&&y<upper.tile.height&&upper.alpha[(y*62+x)*4+3]>200)return true;
      const by=y-Math.round(bottomY);
      if(by>=0&&by<lower.tile.height&&lower.alpha[(by*62+x)*4+3]>200)return true;
    }
    return false;
  }
  // The same center and rotation drive drawing and the collision mask.
  function sealWorldPoints(){
    const points=sealMasks[state.flap>0?'slap':'lift']||[];
    const cos=Math.cos(state.angle),sin=Math.sin(state.angle);
    const cx=sealSize.x+sealSize.width/2,cy=Math.round(state.y);
    return points.map(([x,y])=>{
      const dx=x-sealSize.width/2,dy=y-sealSize.height/2;
      return [Math.round(cx+dx*cos-dy*sin),Math.round(cy+dx*sin+dy*cos)];
    });
  }
  function seal(){
    const asset=state.mode==='over'?assets.hit:(state.flap>0?assets.slap:assets.lift);
    ctx.save();
    ctx.translate(sealSize.x+sealSize.width/2,Math.round(state.y));
    ctx.rotate(state.angle);
    ctx.imageSmoothingEnabled=false;
    if(asset.complete&&asset.naturalWidth)ctx.drawImage(asset,-sealSize.width/2,-sealSize.height/2,sealSize.width,sealSize.height);
    else{ctx.fillStyle='#fff6e7';ctx.beginPath();ctx.ellipse(0,0,sealSize.width*.39,sealSize.height*.41,0,0,Math.PI*2);ctx.fill()}
    ctx.restore();
  }
  function render(){background(state.time);for(const p of state.pipes){ice(p.x,0,p.mid-p.gap/2,true);ice(p.x,p.mid+p.gap/2,ground-(p.mid+p.gap/2),false)}seal();if(state.mode==='ready'){ctx.fillStyle='#fff';ctx.font='bold 12px Nunito';ctx.textAlign='center';ctx.fillText('TAP TO SLAP',180,ground-26)}}
  window.addEventListener('resize',()=>{
    W=canvas.width=Math.round(H*innerWidth/innerHeight);ctx.imageSmoothingEnabled=false;
    scenery.width=W;buildScenery();
  });
  let last=performance.now();function loop(now){const dt=Math.min((now-last)/1000,.035);last=now;if(state.mode==='play'){state.time+=dt*60;state.vy+=1120*dt;state.y+=state.vy*dt;
      const targetAngle=(-12+30*Math.max(0,Math.min(1,(state.vy+200)/500)))*Math.PI/180;
      state.angle+=(targetAngle-state.angle)*(1-Math.exp(-9*dt));
      if(state.flap>0)state.flap-=dt;for(const p of state.pipes){p.x-=150*dt;if(!p.passed&&p.x+62<sealSize.x){p.passed=true;state.score++;scoreEl.textContent=state.score;}}if(!state.pipes.length)spawn(W+5);while(state.pipes[state.pipes.length-1].x<W+5)spawn(state.pipes[state.pipes.length-1].x+pipeSpacing(state.score));state.pipes=state.pipes.filter(p=>p.x>-70);
      const points=sealWorldPoints();
      for(const p of state.pipes){if(touchesIce(p,points)){finish();break}}
      if(state.mode==='play'&&points.some(([,y])=>y>=ground))finish();
      const minY=points.length?Math.min(...points.map(([,y])=>y)):0;
      if(minY<0){state.y-=minY;state.vy=Math.max(0,state.vy)}}render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
})();
