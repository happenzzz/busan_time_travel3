
'use strict';
const $=id=>document.getElementById(id);


function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const fail=()=>{if(done)return;done=true;clearTimeout(timer);s.remove();reject(new Error('엔진 다운로드 실패'))};const timer=setTimeout(fail,20000);s.src=url;s.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};s.onerror=fail;document.head.append(s)})}
(async()=>{try{await main()}catch(e){console.error(e);$('loadText').textContent='장면을 열지 못했습니다. Chrome 또는 Edge에서 다시 열어 주세요. '+e.message}})();
async function main(){
const canvas=$('view');const device=await pc.createGraphicsDevice(canvas,{deviceTypes:[pc.DEVICETYPE_WEBGPU,pc.DEVICETYPE_WEBGL2],antialias:true,powerPreference:'high-performance'});
const app=new pc.Application(canvas,{graphicsDevice:device});device.maxPixelRatio=Math.min(window.devicePixelRatio,1.6);app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);window.addEventListener('resize',()=>app.resizeCanvas());
$('gpu').textContent=device.deviceType==='webgpu'?'WebGPU':'WebGL2';const ANISO=Math.max(1,Math.min(4,device.maxAnisotropy||1));
app.scene.ambientLight=new pc.Color(.54,.59,.63);app.scene.exposure=1.03;app.scene.fog.type='linear';app.scene.fog.color=new pc.Color(.84,.89,.9);app.scene.fog.start=600;app.scene.fog.end=4200;
const camera=new pc.Entity('camera');camera.addComponent('camera',{clearColor:new pc.Color(.69,.78,.81),fov:46,nearClip:.5,farClip:6500,toneMapping:pc.TONEMAP_ACES});app.root.addChild(camera);
const sun=new pc.Entity('sun');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.96,.87),intensity:1.5,castShadows:true,shadowDistance:900,shadowResolution:2048,shadowBias:.045,normalOffsetBias:.12,numCascades:3});sun.setEulerAngles(52,-35,0);app.root.addChild(sun);
// Procedural sky: one equirect painting drives the visible sky, image-based ambient light and glass/water reflections.
function paintSky(night){const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,512);
 const stops=night?[[0,'#03060f'],[.3,'#0a1226'],[.47,'#1c2a45'],[.5,'#27354d'],[.53,'#101712'],[1,'#070a08']]:[[0,'#3f73ad'],[.22,'#6b9ccb'],[.4,'#a9c8de'],[.485,'#dce7e8'],[.5,'#e4ebe6'],[.515,'#a7ad97'],[.62,'#7b8566'],[1,'#56604a']];
 for(const [t,col]of stops)gr.addColorStop(t,col);g.fillStyle=gr;g.fillRect(0,0,1024,512);
 let cs=1234;const cr=()=>{cs=(1664525*cs+1013904223)>>>0;return cs/4294967296};
 if(!night){for(let i=0;i<70;i++){const x=cr()*1024,y=70+cr()*165,w=40+cr()*140,h=5+cr()*14;const cg=g.createRadialGradient(x,y,1,x,y,w);cg.addColorStop(0,'rgba(255,255,255,.55)');cg.addColorStop(1,'rgba(255,255,255,0)');g.save();g.translate(x,y);g.scale(1,h/w);g.translate(-x,-y);g.fillStyle=cg;g.beginPath();g.arc(x,y,w,0,6.283);g.fill();g.restore()}
  // Distant blue-grey ridge silhouettes add depth at the horizon without modelling mountains.
  for(const [base,amp,colr]of [[246,18,'rgba(128,150,160,.55)'],[252,10,'rgba(104,124,120,.6)']]){g.fillStyle=colr;g.beginPath();g.moveTo(0,262);for(let x=0;x<=1024;x+=8){const y=base-amp*(.55+.45*Math.sin(x*.013+base)*Math.sin(x*.0047+1.3))-(x>560&&x<780?amp*.9*Math.sin((x-560)/220*Math.PI):0);g.lineTo(x,y)}g.lineTo(1024,262);g.fill()}}
 else{for(let i=0;i<500;i++){const y=cr()*240,a=.3+cr()*.7;g.fillStyle=`rgba(230,238,255,${a*(1-y/260)})`;g.fillRect(cr()*1024,y,1.3,1.3)}}
 const t=new pc.Texture(device,{anisotropy:ANISO,width:1024,height:512,format:pc.PIXELFORMAT_RGBA8,projection:pc.TEXTUREPROJECTION_EQUIRECT,mipmaps:false,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_CLAMP_TO_EDGE});t.setSource(c);return t}
const skyStates={};for(const k of ['day','night']){try{const src=paintSky(k==='night');const lighting=pc.EnvLighting.generateLightingSource(src,{size:128});skyStates[k]={atlas:pc.EnvLighting.generateAtlas(lighting,{size:512}),sky:pc.EnvLighting.generateSkyboxCubemap(src,256)};lighting.destroy()}catch(e){console.warn('sky',e)}}
function useSky(k){const st=skyStates[k];if(!st)return;app.scene.envAtlas=st.atlas;app.scene.skybox=st.sky;app.scene.skyboxMip=0}
useSky('day');app.scene.skyboxIntensity=1;
const now=new pc.Entity('today'),old=new pc.Entity('past'),shared=new pc.Entity('landscape');app.root.addChild(now);app.root.addChild(old);app.root.addChild(shared);old.enabled=false;
let seed=819;function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}const rand=(a,b)=>a+rnd()*(b-a);function col(hex){return new pc.Color().fromString(hex)}
const lampPositions=[];const mats={};function mat(name,color,gloss=5){let m=new pc.StandardMaterial();m.name=name;m.diffuse=col(color);m.gloss=gloss/100;m.specular=new pc.Color(.16,.16,.16);m.update();mats[name]=m;return m}
const grass=mat('grass','#6c7d47'),soil=mat('soil','#998565'),asphalt=mat('asphalt','#596063'),walk=mat('concrete','#b1aea2'),white=mat('white','#e2dfcc'),wall=mat('wall','#d4cfbd'),roof=mat('roof','#67928b'),glass=mat('glass','#577b88',75),dark=mat('dark','#343f3e'),wood=mat('wood','#67513a'),leaf=mat('leaf','#466440'),leaf2=mat('leaf2','#607844'),reed=mat('reed','#8b944f'),water=mat('water','#6c9995',90),thatch=mat('thatch','#9d895a'),mud=mat('mud','#c1ad85'),black=mat('black','#272c29'),red=mat('red','#ad4c36'),lines=mat('lines','#e8e5d6'),paddy=mat('paddy','#768c49');water.metalness=.25;water.useMetalness=true;water.update();
// Material atlases supply fine surface detail without local image loading restrictions.
function texture(material,kind){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=material.diffuse.toString(false);x.fillRect(0,0,256,256);for(let i=0;i<6500;i++){let v=Math.floor(rand(75,205));x.fillStyle=`rgba(${v},${v},${v},${rand(.04,.20)})`;x.fillRect(rand(0,256),rand(0,256),rand(1,4),rand(1,4))}if(kind==='grass'){for(let i=0;i<1200;i++){x.strokeStyle=rnd()<.5?'#83945570':'#42533380';x.beginPath();let a=rand(0,256),b=rand(0,256);x.moveTo(a,b);x.lineTo(a+rand(-3,3),b-rand(2,8));x.stroke()}}if(kind==='roof'){x.strokeStyle='#32453c66';for(let i=0;i<256;i+=12){x.fillStyle='#c7d6bc28';x.fillRect(i,0,3,256);x.fillStyle='#203b3745';x.fillRect(i+4,0,1,256)}}if(kind==='thatch'){for(let i=0;i<900;i++){x.strokeStyle=rnd()<.5?'#d1ba7a90':'#604d2c70';x.beginPath();let a=rand(0,256),b=rand(0,256);x.moveTo(a,b);x.lineTo(a+rand(-7,7),b+rand(8,45));x.stroke()}}const t=new pc.Texture(device,{anisotropy:ANISO,width:256,height:256,mipmaps:true});t.setSource(c);material.diffuseMap=t;material.diffuse.set(1,1,1);material.update()}
texture(grass,'grass');texture(soil,'soil');texture(asphalt,'soil');texture(roof,'roof');texture(thatch,'thatch');texture(mud,'soil');texture(paddy,'grass');
// Aggregate static geometry per material and era to keep draw calls modest.
const solidBoxes=[];let collectSolids=true;
const buckets=new Map();const CELL=400;function geom(parent,material,pos,norm,uv,idx){const cell=parent===now||parent===old?Math.floor(pos[0]/CELL)+','+Math.floor(pos[2]/CELL):'';const k=parent.name+material.name+'|'+cell;let b=buckets.get(k);if(!b){b={parent,material,p:[],n:[],u:[],i:[]};buckets.set(k,b)}const off=b.p.length/3;b.p.push(...pos);b.n.push(...norm);b.u.push(...uv);for(const n of idx)b.i.push(n+off)}
function box(parent,m,x,y,z,w,h,d,angle=0){if(collectSolids && h>2.5 && w>2.5 && d>2.5 && y-h/2<4 && ![grass,soil,water,paddy,thatch,leaf,leaf2].includes(m))solidBoxes.push({era:parent===now?'now':parent===old?'old':'both',x,z,y,w,h,d,angle});let p=[],n=[],u=[],i=[];let a=angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);const faces=[[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],[[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]]];for(const [normal,verts]of faces){let off=p.length/3;for(let j=0;j<4;j++){let v=verts[j],vx=v[0]*w/2,vz=v[2]*d/2;p.push(x+vx*ca+vz*sa,y+v[1]*h/2,z-vx*sa+vz*ca);n.push(normal[0]*ca+normal[2]*sa,normal[1],-normal[0]*sa+normal[2]*ca);{const faceU=normal[0]?d:w,faceV=normal[1]?d:h,sc=m._meterScale||0,uv=[[0,0],[1,0],[1,1],[0,1]][j];u.push(uv[0]*(sc?faceU/sc:1),uv[1]*(sc?faceV/sc:1))}}i.push(off,off+1,off+2,off,off+2,off+3)}geom(parent,m,p,n,u,i)}
function ellipsoid(parent,m,x,y,z,rx,ry,rz,segments=10,rings=6){let p=[],n=[],u=[],idx=[];for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,b=j/rings*Math.PI;let nx=Math.sin(b)*Math.cos(a),ny=Math.cos(b),nz=Math.sin(b)*Math.sin(a);p.push(x+rx*nx,y+ry*ny,z+rz*nz);const len=Math.hypot(nx/rx,ny/ry,nz/rz);n.push(nx/rx/len,ny/ry/len,nz/rz/len);u.push(i/segments,j/rings)}for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){let a=j*(segments+1)+i,b=a+segments+1;idx.push(a,a+1,b,b,a+1,b+1)}geom(parent,m,p,n,u,idx)}
function segment(parent,m,a,b,width,height=.16){let dx=b[0]-a[0],dz=b[1]-a[1];box(parent,m,(a[0]+b[0])/2,height/2+.08,(a[1]+b[1])/2,width,height,Math.hypot(dx,dz),Math.atan2(dx,dz)*180/Math.PI)}
function poly(parent,m,pts,y=.05){let p=[],n=[],u=[],idx=[];for(const [x,z]of pts){p.push(x,y,z);n.push(0,1,0);u.push(x/32,z/32)}for(let j=1;j<pts.length-1;j++)idx.push(0,j+1,j);geom(parent,m,p,n,u,idx)}
// Original procedural materials. No SimCity meshes, textures or code are included.
function surface(name,base,kind,scale=4){
 const m=mat(name,base,kind==='glass'?82:16),c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,512,512);
 for(let i=0;i<18000;i++){const v=rnd()<.5?255:0;g.fillStyle=`rgba(${v},${v},${v},${rand(.015,.095)})`;g.fillRect(rand(0,512),rand(0,512),rand(.5,2.8),rand(.5,2.8))}
 if(kind==='brick'){for(let row=0;row<24;row++)for(let j=-1;j<13;j++){g.fillStyle=['#995940','#a4674d','#ae7156','#985c49','#b0785b'][(row+j+30)%5];g.fillRect(j*44+(row%2)*22+1,row*22+1,41,19);g.fillStyle='#e2baa330';g.fillRect(j*44+(row%2)*22+2,row*22+1,40,1)}}
 if(kind==='stone'||kind==='paver'){const n=kind==='stone'?128:64;g.strokeStyle='#4e51482c';g.lineWidth=2;for(let y=0;y<512;y+=n){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();for(let x=0;x<512;x+=n){g.beginPath();g.moveTo(x+(y/n%2)*n/2,y);g.lineTo(x+(y/n%2)*n/2,y+n);g.stroke()}}}
 if(kind==='roof'){for(let i=0;i<512;i+=32){g.fillStyle='#122a292d';g.fillRect(i,0,3,512);g.fillStyle='#ffffff22';g.fillRect(i+3,0,2,512)}g.fillStyle='#273d3822';g.fillRect(0,0,512,13);g.fillRect(0,499,512,13)}
 if(kind==='glass'){let gr=g.createLinearGradient(0,0,90,512);gr.addColorStop(0,'#abc7d2');gr.addColorStop(.46,'#638c9c');gr.addColorStop(.48,'#3c646d');gr.addColorStop(1,'#263e44');g.fillStyle=gr;g.fillRect(0,0,512,512);for(let i=0;i<16;i++){g.fillStyle=i%3?'#162e3b18':'#ebeee81c';g.fillRect(i*34,0,rand(12,28),512)}g.fillStyle='#ebf5f422';g.beginPath();g.moveTo(0,0);g.lineTo(155,0);g.lineTo(512,390);g.lineTo(512,480);g.fill();}
 const t=new pc.Texture(device,{anisotropy:ANISO,width:512,height:512,mipmaps:true});t.setSource(c);m.diffuseMap=t;m.diffuse.set(1,1,1);m._meterScale=scale;m.update();return m;
}
const urbanPlaster=surface('urbanPlaster','#d6d2c5','stone',5),urbanBrick=surface('urbanBrick','#a9674e','brick',5),urbanSand=surface('urbanSand','#c7b999','stone',5),urbanGray=surface('urbanGray','#a5b4b2','stone',5),roofMembrane=surface('roofMembrane','#719d90','roof',7),roofDark=surface('roofDark','#4c6670','roof',6),pavers=surface('pavers','#b7b4a6','paver',6),paversRed=surface('paversRed','#a16e5c','paver',5),windowReflect=surface('windowReflect','#527d8e','glass',0),curb=surface('curb','#d8d9ce','stone',4),rooftopMetal=surface('rooftopMetal','#bec4c3','roof',3);
const urbanWalls=[urbanPlaster,urbanBrick,urbanSand,urbanGray];
// Radial contact shade is a low-cost baked-style ambient occlusion decal.
const aoCanvas=document.createElement('canvas');aoCanvas.width=aoCanvas.height=128;const ag=aoCanvas.getContext('2d'),ar=ag.createRadialGradient(64,64,6,64,64,64);ar.addColorStop(0,'rgba(21,35,31,.40)');ar.addColorStop(.57,'rgba(21,35,31,.20)');ar.addColorStop(1,'rgba(21,35,31,0)');ag.fillStyle=ar;ag.fillRect(0,0,128,128);const aoTex=new pc.Texture(device,{anisotropy:ANISO,width:128,height:128,mipmaps:true});aoTex.setSource(aoCanvas);const contactAO=mat('contactAO','#26372c');contactAO.opacityMap=aoTex;contactAO.opacityMapChannel='a';contactAO.blendType=pc.BLEND_NORMAL;contactAO.depthWrite=false;contactAO.update();
function contact(x,z,w,d,angle=0,y=.15){const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let p=[];for(const [xx,zz]of [[-w/2,-d/2],[-w/2,d/2],[w/2,d/2],[w/2,-d/2]])p.push(x+xx*c+zz*s,y,z-xx*s+zz*c);geom(now,contactAO,p,[0,1,0,0,1,0,0,1,0,0,1,0],[0,0,0,1,1,1,1,0],[0,1,2,0,2,3])}

grass._meterScale=14;soil._meterScale=18;asphalt._meterScale=8;roof._meterScale=9;
// Dappled, directional leaf clusters instead of a single flat foliage colour.
for(const [m,base]of [[leaf,'#466745'],[leaf2,'#698050']]){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,256,256);for(let i=0;i<1800;i++){g.save();g.translate(rand(0,256),rand(0,256));g.rotate(rand(0,6.28));g.fillStyle=['#b8c17b55','#253e3470','#76975866','#8ca95c80'][i%4];g.beginPath();g.ellipse(0,0,rand(1.2,4),rand(2,7),0,0,6.283);g.fill();g.restore()}const t=new pc.Texture(device,{anisotropy:ANISO,width:256,height:256,mipmaps:true});t.setSource(c);m.diffuseMap=t;m.diffuse.set(1,1,1);m.update()}
function tree(parent,x,z,s=1){if(parent===now&&pathDistance(x,z,bambooRouteWorld)<7)return;
 box(parent,wood,x,2.5*s,z,.38*s,5*s,.38*s);
 const variants=[leaf,leaf2],main=variants[rnd()<.5?0:1];
 // Irregular clumped crowns with smaller edge foliage retain tree silhouettes at aerial scale.
 for(let i=0;i<9;i++){const a=i*2.399,rr=(i?1.7:0)*s,cx=x+Math.cos(a)*rr,cz=z+Math.sin(a)*rr,cy=(5.4+Math.sin(i*1.9)*1.1)*s;ellipsoid(parent,i%3?main:variants[1],cx,cy,cz,(1.65+rnd()*.35)*s,(1.9+rnd()*.65)*s,(1.6+rnd()*.35)*s,9,6)}
 if(parent===now)contact(x,z,8*s,8*s,0,.18);
}
// Map-image coordinates are kept common to both eras (illustrative metre scale).
const X=u=>(u-619)*.85,Z=v=>(v-460)*.85;
function mapPoint(u,v){return [32+(u-565)*.46,0,130+(v-485)*.46]}
const mapAnchors={school:[375,833],hall:[354,756],field:[566,491],island:[765,789],museum:[1001,759],sculpture:[962,539],gate:[1193,625],well:[1413.5,479.8]};
const bambooRouteWorld=(()=>{const o=mapPoint(375,833),a=43*Math.PI/180,pt=(x,z)=>[o[0]+x*Math.cos(a)+z*Math.sin(a),o[2]-x*Math.sin(a)+z*Math.cos(a)],r=mapPoint(765,789);const A=pt(50,66),B=pt(54,43),C=[r[0]-47,r[2]+32],D=[r[0]-10,r[2]+5];return Array.from({length:25},(_,i)=>{const t=i/24,u=1-t;return[0,1].map(k=>u*u*u*A[k]+3*u*u*t*B[k]+3*u*t*t*C[k]+t*t*t*D[k])})})();
const NM=(u,v)=>[0.8058380810948473*u-0.036269889198592864*v-511.7565112710509,0.036269889198592864*u+0.8058380810948473*v-342.3895557341741];
const riverRoute=[[1540, -300], [1680, -40], [1780, 110], [1880, 230], [1990, 330], [2150, 450], [2350, 560]].map(([u,v])=>NM(u,v));

{// Ground plane with low-frequency tint variation removes the tiled look at aerial scale.
 const groundTint=grass.clone();groundTint.name='groundTint';groundTint.diffuseVertexColor=true;groundTint.update();const G=72,gp=[],gn=[],gu=[],gc=[],gi=[];
 const noise=(x,z)=>.5+.22*Math.sin(x*.0061+1.7)*Math.cos(z*.0053)+.16*Math.sin(x*.017+z*.011)+.12*Math.cos(x*.041-z*.037);
 for(let j=0;j<=G;j++)for(let i=0;i<=G;i++){const x=-1900+i*3800/G,z=-1550+j*3300/G,n=noise(x,z);gp.push(x,0,z);gn.push(0,1,0);gu.push(x/14,z/14);gc.push(.83+n*.26,.86+n*.2,.78+n*.2*(1-n),1)}
 for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*(G+1)+i,b=a+G+1;gi.push(a,b,a+1,a+1,b,b+1)}
 const gm=new pc.Mesh(device);gm.setPositions(gp);gm.setNormals(gn);gm.setUvs(0,gu);gm.setColors(gc);gm.setIndices(gi);gm.update();const ge=new pc.Entity('ground');ge.addComponent('render',{meshInstances:[new pc.MeshInstance(gm,groundTint)],castShadows:false,receiveShadows:true});shared.addChild(ge);box(shared,soil,0,-2.2,100,3800,4,3300)}
// One common base mesh for the lowland in both periods. No invented ring of mountains.
// Heights are not a surveyed DEM; modern paved terraces are emitted under the modern era only.
const labels=[];function label(text,u,v,h,era){if(era==='now')return;let el=document.createElement('div');el.className='label';el.textContent=text;$('labels').append(el);labels.push({el,pos:new pc.Vec3(X(u),h,Z(v)),era})}
function building(u,v,w,d,h,angle=0,special=false){
 const x=X(u),z=Z(v),a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),facade=special?urbanPlaster:urbanWalls[Math.floor(rnd()*urbanWalls.length)],rm=rnd()<.76?roofMembrane:roofDark;
 function b(m,lx,y,lz,ww,hh,dd){box(now,m,x+lx*c+lz*s,y,z-lx*s+lz*c,ww,hh,dd,angle)}
 contact(x,z,w+7,d+7,angle,.16);b(pavers,0,.15,0,w+2,.3,d+2);b(facade,0,h/2+.3,0,w,h,d);b(curb,0,.65,0,w+.14,.55,d+.14);
 b(rm,0,h+.33,0,w-.45,.15,d-.45);
 for(let q of [-1,1]){b(curb,0,h+.64,q*(d/2-.14),w,.7,.28);b(curb,q*(w/2-.14),h+.64,0,.28,.7,d);b(curb,0,h+.95,q*(d/2-.14),w+.2,.1,.4)}
 const floors=Math.max(2,Math.round(h/3.5)),fh=h/floors,step=special?3.55:3.3;
 for(let f=0;f<floors;f++){
  const y=.3+fh*(f+.52),wh=fh*.56;
  for(let xx=-w/2+2;xx<w/2-1.2;xx+=step)for(let q of [-1,1]){
   b(dark,xx,y,q*(d/2+.035),2.35,wh+.24,.09);b(windowReflect,xx,y,q*(d/2+.095),2.12,wh,.07);b(white,xx,y,q*(d/2+.145),.08,wh,.09);b(curb,xx,y-wh/2-.1,q*(d/2+.23),2.55,.15,.43);
   if(special)b(white,xx,y+.1,q*(d/2+.15),2.15,.065,.08);
  }
  for(let zz=-d/2+2.3;zz<d/2-1;zz+=3.6)for(let q of [-1,1]){b(dark,q*(w/2+.035),y,zz,.09,wh+.22,1.9);b(windowReflect,q*(w/2+.095),y,zz,.07,wh,1.7);b(white,q*(w/2+.15),y,zz,.09,wh,.07)}
  if(special||f===0)for(let q of [-1,1])b(curb,0,.4+(f+1)*fh,q*(d/2+.09),w,.15,.25);
 }
 const sx=w*.25,sz=-d*.2;b(facade,sx,h+1.4,sz,Math.min(w*.28,5.2),2.4,Math.min(d*.35,4.2));b(curb,sx,h+2.65,sz,Math.min(w*.28,5.2)+.3,.15,Math.min(d*.35,4.2)+.3);
 for(let i=0;i<(special?5:2);i++){let ax=-w*.33+i*2.3; b(rooftopMetal,ax,h+.85,d*.2,1.7,1,1.15);b(dark,ax,h+1.37,d*.2,1.05,.04,.8);for(let j=-2;j<=2;j++)b(rooftopMetal,ax+j*.19,h+1.4,d*.2,.055,.04,.82)}
 if(special){for(let i=0;i<Math.floor(w/4.5);i++){const xx=-w*.42+i*4.5;b(dark,xx,h+.55,-d*.26,3.8,.14,d*.25);for(let k=0;k<4;k++)b(windowReflect,xx-1.4+k*.92,h+.66,-d*.26,.83,.09,d*.24)}}
 for(let q of [-1,1])b(rooftopMetal,q*(w/2-.6),h*.48,d/2+.19,.12,h*.96,.12);
 b(dark,0,1.65,d/2+.16,3.2,2.9,.19);b(windowReflect,0,1.65,d/2+.27,2.9,2.65,.06);b(curb,0,1.65,d/2+.33,.08,2.7,.08);b(curb,0,3.35,d/2+1.2,4.7,.22,2.7);
 if(!special&&w>14){b([roofDark,paversRed,urbanGray][Math.floor(rnd()*3)],-w*.26,3.2,d/2+.3,w*.38,.7,.22)}
}
// University precinct, traced from the supplied aerial reference.
const campus=[[610,334],[835,548],[951,670],[717,900],[371,682],[463,561],[398,443]];
poly(now,grass,campus.map(([u,v])=>[X(u),Z(v)]),.11);
function contextRoad(m,a,b,width,height=.16){const dx=b[0]-a[0],dz=b[1]-a[1],n=Math.ceil(Math.hypot(dx,dz)/4);for(let k=0;k<n;k++){const t=(k+.5)/n;if(reservedCampus(a[0]+dx*t,a[1]+dz*t))continue;segment(now,m,[a[0]+dx*k/n,a[1]+dz*k/n],[a[0]+dx*(k+1)/n,a[1]+dz*(k+1)/n],width,height)}}
function road(points,width=11){for(let j=1;j<points.length;j++)contextRoad(asphalt,[X(points[j-1][0]),Z(points[j-1][1])],[X(points[j][0]),Z(points[j][1])],width)}
// Arterial streets traced from the supplied Naver satellite captures (pixel coordinates of the 2035x1247 capture).
// NM() is a least-squares similarity fit through six campus landmarks, so streets line up with the modelled campus.
const realRoadsRaw=[["중앙대로", 30, [[1230, -320], [1270, 0], [1335, 150], [1405, 330], [1455, 470], [1472, 620], [1458, 800], [1452, 950], [1468, 1100], [1480, 1247], [1495, 1500]]], ["교대로", 11, [[1066, 628], [1200, 630], [1390, 647], [1458, 652]]], ["캠퍼스동쪽길", 10, [[720, -180], [745, 20], [762, 80], [850, 250], [937, 400], [958, 465], [995, 540], [1030, 590], [1066, 628]]], ["학교옆길", 11, [[1066, 628], [1000, 700], [925, 787], [869, 844], [800, 940], [744, 1000], [690, 1060]]], ["미남로", 14, [[345, 430], [420, 352], [500, 240], [535, 170], [562, 122], [687, 87], [812, 37], [900, 0], [1010, -60]]], ["여고로", 12, [[-320, 500], [0, 470], [130, 455], [345, 430]]], ["서쪽길", 10, [[160, -300], [180, 0], [205, 300], [225, 620], [250, 870]]], ["황새알로", 10, [[250, 865], [400, 832], [520, 815], [600, 792], [637, 787], [700, 869], [800, 940]]], ["법원북로", 14, [[-320, 1000], [60, 925], [250, 890], [350, 905], [450, 960], [560, 1030], [700, 1110], [780, 1160], [900, 1260]]], ["법원남로", 12, [[700, 869], [705, 1000], [740, 1150], [760, 1247], [790, 1500]]], ["중앙대로1235번길", 10, [[950, 420], [1150, 325], [1300, 285], [1405, 255]]], ["중앙대로1251번길", 9, [[850, 156], [1000, 110], [1150, 62], [1280, 20]]], ["세병로", 12, [[1930, 420], [1960, 700], [1975, 950], [1990, 1247], [2010, 1500]]], ["명륜로", 14, [[1472, 480], [1600, 520], [1760, 470], [1900, 360], [2050, 250], [2250, 120]]]].map(([name,w,pts])=>({name,w,pts:pts.map(([u,v])=>NM(u,v))}));
// The modelled school compound keeps its own perimeter road, so traced streets stop at its boundary.
const realRoads=[];for(const r of realRoadsRaw){let cur=[],startCut=false;const flush=()=>{if(cur.length>1)realRoads.push({name:r.name,w:r.w,pts:cur,startCut,endCut:true});cur=[];startCut=true};for(let i=1;i<r.pts.length;i++){const a=r.pts[i-1],b=r.pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));for(let k=(i===1?0:1);k<=n;k++){const q=[a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n];if(inSchoolArea(q[0],q[1],r.w/2+6)){if(cur.length)flush();else startCut=true}else{if(!cur.length||k===0||k===n||cur.length===1||!(k%8))cur.push(q);else cur.push(q)}}}if(cur.length>1)realRoads.push({name:r.name,w:r.w,pts:cur,startCut,endCut:false})}
realRoads.forEach(r=>{const o=[r.pts[0]];for(let i=1;i<r.pts.length-1;i++){const a=o[o.length-1],b=r.pts[i],c=r.pts[i+1];const cr=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(cr>2||Math.hypot(b[0]-a[0],b[1]-a[1])>120)o.push(b)}o.push(r.pts[r.pts.length-1]);r.pts=o});
const roadByName=n=>realRoads.find(r=>r.name===n);
const railRoute=[[860, 1480], [1060, 1277], [1200, 1140], [1400, 995], [1600, 845], [1880, 590], [2035, 495], [2300, 320]].map(([u,v])=>NM(u,v));
const laneWhite=mat('laneWhite','#f2f0e6'),laneYellow=mat('laneYellow','#e8b834');
function polyDistance(x,z,pts){let best=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t))}return best}
function laneArrow(f,x,z,dir){f.box(laneWhite,x,.262,z,.2,.02,2.4);flatQuad(f,laneWhite,[[x-.7,z+1.1*dir],[x,z+2.4*dir],[x+.7,z+1.1*dir],[x,z+1.1*dir]],.27)}
function crosswalk(f,z,w){for(let x=-w/2+.6;x<w/2-.3;x+=1.1)f.box(laneWhite,x,.262,z,.55,.02,3.6)}
for(const r of realRoads){const pts=r.pts,w=r.w;
 for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),f=frame((a[0]+b[0])/2,(a[1]+b[1])/2,Math.atan2(dx,dz)*180/Math.PI);
  f.box(curb,0,.13,0,w+5,.1,len+.5);f.box(asphalt,0,.16,0,w,.16,len+.4);
  // Right-hand traffic: travel toward +z keeps to local -x, the opposite lanes to +x.
  for(const q of [-1,1])f.box(laneWhite,q*(w/2-.45),.255,0,.15,.02,len);
  if(w>=10){for(const q of [-1,1])f.box(laneYellow,q*.17,.256,0,.13,.02,len-1)}
  if(w>=14){for(let z=-len/2+2;z<len/2-3;z+=8)for(const q of [-1,1])for(let k=1;k<Math.floor(w/7);k++)f.box(laneWhite,q*k*w/2/Math.floor(w/7),.255,z,.13,.02,3)}
  for(let z=-len/2+18;z<len/2-14;z+=46){const lane=w>=14?w/2*(Math.floor(w/7)-.5)/Math.floor(w/7):w/4;laneArrow(f,-lane,z,1);laneArrow(f,lane,z+6,-1)}
 }
 for(let i=1;i<pts.length-1;i++){const c=[];for(let k=0;k<14;k++){const an=k/14*Math.PI*2;c.push([pts[i][0]+Math.cos(an)*w/2,pts[i][1]+Math.sin(an)*w/2])}poly(now,asphalt,c,.241)}
 // Zebra crossings where this street meets another traced street.
 for(const end of [0,pts.length-1]){const P=pts[end],Q=pts[end?end-1:1];let other=null;for(const o of realRoads){if(o===r)continue;const d=polyDistance(P[0],P[1],o.pts);if(d<6&&(!other||o.w>other.w))other=o}if(!other)continue;const dx=Q[0]-P[0],dz=Q[1]-P[1],len=Math.hypot(dx,dz),back=other.w/2+4;if(len<back+6)continue;const c=[P[0]+dx/len*back,P[1]+dz/len*back];crosswalk(frame(c[0],c[1],Math.atan2(dx,dz)*180/Math.PI),0,w)}
}
// Streets that stop at the school join its perimeter road with a short connector.
{const so=mapPoint(375,833),sa=43*Math.PI/180,loop=[[-51,-50],[-60,139],[90,139],[90,-50],[-51,-50]].map(([x,z])=>[so[0]+x*Math.cos(sa)+z*Math.sin(sa),so[2]-x*Math.sin(sa)+z*Math.cos(sa)]);
 for(const r of realRoads)for(const [flag,P] of [[r.startCut,r.pts[0]],[r.endCut,r.pts[r.pts.length-1]]]){if(!flag)continue;let best=null,bd=Infinity;for(let i=1;i<loop.length;i++){const a=loop[i-1],b=loop[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((P[0]-a[0])*dx+(P[1]-a[1])*dz)/(dx*dx+dz*dz))),q=[a[0]+dx*t,a[1]+dz*t],d=Math.hypot(q[0]-P[0],q[1]-P[1]);if(d<bd){bd=d;best=q}}if(!best||bd>90||bd<1)continue;const dx=best[0]-P[0],dz=best[1]-P[1],len=Math.hypot(dx,dz),f=frame((P[0]+best[0])/2,(P[1]+best[1])/2,Math.atan2(dx,dz)*180/Math.PI),w=Math.min(r.w,8);f.box(curb,0,.13,0,w+4,.1,len+1);f.box(asphalt,0,.16,0,w,.16,len+1);for(const q of [-1,1])f.box(laneWhite,q*(w/2-.4),.255,0,.14,.02,len);const c=[];for(let k=0;k<14;k++){const an=k/14*Math.PI*2;c.push([P[0]+Math.cos(an)*r.w/2,P[1]+Math.sin(an)*r.w/2])}poly(now,asphalt,c,.241)}}
function nearRoad(u,v,r){const x=X(u),z=Z(v);return realRoads.some(o=>polyDistance(x,z,o.pts)<o.w/2+r)||polyDistance(x,z,railRoute)<9+r||polyDistance(x,z,riverRoute)<36+r}
// Neighbourhood blocks follow the street density of the reference, outside the campus.
function reservedRoute(x,z){const pts=[[321,194],[380,202],NM(1200,630),NM(1390,647),NM(1452,652)];return pts.slice(1).some((b,i)=>{const a=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<35})}
function reservedCampus(x,z){return inside(x,z,[[0,310],[427,-100],[1105,453],[1193,625],[760,1120],[270,1020],[-100,590]].map(([u,v])=>{const a=mapPoint(u,v);return[a[0],a[2]]}))}
function reservedContext(x,z){const a=43*Math.PI/180,dx=x+195,dz=z-665,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);if(lx>-216&&lx<78&&lz>-36&&lz<112)return true;return reservedCampus(x,z)||reservedRoute(x,z)||hillEdge(x,z)>0||estateArea(x,z)||eastTowerArea(x,z)||(x>-387&&x<-222&&z>-228&&z<-58)||(Math.hypot(x-585,z-210)<55||Math.hypot(x-566,z-150)<42)||Math.hypot(x-422,z-128)<20||Math.hypot(x-railStationPos[0],z-railStationPos[1])<70}
function inSchoolArea(x,z,m=0){const o=mapPoint(375,833),dx=x-o[0],dz=z-o[2],a=43*Math.PI/180,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);return lx>-80-m&&lx<96+m&&lz>-65-m&&lz<145+m}

function inside(x,y,vs){let c=false;for(let i=0,j=vs.length-1;i<vs.length;j=i++){let a=vs[i],b=vs[j];if(((a[1]>y)!=(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))c=!c}return c}
// Replaced by the non-overlapping district parcels below.
// Main buildings and fields.
// University blocks are authored in campus revision 3 below.

// Detailed sand field emitted below.
// School perimeter buildings form the recognisable south-eastern school cluster.
// School replaced by photograph-guided custom buildings below.

poly(now,soil,[[365,749],[410,736],[442,806],[394,830]].map(([u,v])=>[X(u),Z(v)]),.2);
// Campus roads are traced from the annotated map below.



// Road markings and cars.

const carM=[mat('carBlue','#436575',55),mat('carSilver','#b9bebb',60),mat('carWhite','#eeeae0',65),mat('carRed','#81524b',55)];
label('부산교육대학교',605,468,23,'now');
// Older landscape: wet lowland, winding channels, cultivated plots and a small village.
poly(old,water,[[-260,-220],[-110,-240],[25,-184],[110,-75],[76,58],[161,140],[142,215],[46,247],[-83,215],[-110,92],[-177,4],[-227,-90]],.15);

for(let j=0;j<8;j++)for(let i=0;i<5;i++){let x=-445+i*55,z=-350+j*69;if(x>-235&&z<240||i===2&&j===4)continue;box(old,soil,x,.26,z,51,.5,64);box(old,rnd()<.5?paddy:water,x,.53,z,47,.12,59);for(let r=0;r<11;r++)box(old,paddy,x-21+r*4.1,.66,z,1,.3,57)}
for(let j=0;j<6;j++)for(let i=0;i<4;i++){let x=275+i*47,z=-250+j*61;const wp=mapPoint(...mapAnchors.well);if(Math.hypot(x-wp[0],z-wp[2])<55)continue;box(old,soil,x,.25,z,44,.5,57);box(old,paddy,x,.55,z,41,.16,54);for(let r=0;r<9;r++)box(old,reed,x-18+r*4.4,.8,z,.5,.4,53)}
for(let i=0;i<35;i++){let z=-390+i*23,x=-270+Math.sin(i*.14)*42;segment(old,soil,[x,z],[ -270+Math.sin((i+1)*.14)*42,z+23],4.5,.17)}
function hut(x,z,w,d){box(old,mud,x,2,z,w,4,d);box(old,wood,x,1.5,z+d/2+.03,1.5,3,.1);box(old,dark,x-w*.3,2.1,z+d/2+.06,1.1,1.2,.1); // Sloped thatch, rounded eaves and ridge.
const a=Math.atan2(2.3,d/2)*180/Math.PI;const length=Math.hypot(d/2+1,2.3);function roofside(side){let p=[],n=[],uv=[],ix=[0,1,2,0,2,3];let pts=side>0?[[x-w/2-1,4,z+d/2+1],[x+w/2+1,4,z+d/2+1],[x+w/2+.4,6.3,z],[x-w/2-.4,6.3,z]]:[[x-w/2-.4,6.3,z],[x+w/2+.4,6.3,z],[x+w/2+1,4,z-d/2-1],[x-w/2-1,4,z-d/2-1]];for(let k=0;k<4;k++){p.push(...pts[k]);n.push(0,.8,side*.5);uv.push(...[[0,0],[2,0],[2,1],[0,1]][k])}geom(old,thatch,p,n,uv,ix)}roofside(1);roofside(-1);ellipsoid(old,thatch,x,6.1,z,w*.57,.65,.8,10,4);for(let s of [-1,1])box(old,wood,x+s*(w/2-.25),2,z+d/2,.22,4,.22);box(old,soil,x,.1,z+d, w+6,.2,8)}
for(let i=0;i<19;i++){let x=-350+rand(-70,50),z=170+i%7*25+rand(-8,8);hut(x,z,rand(9,13),rand(6,9));if(i%3===0)tree(old,x+12,z+4,.9)}
for(let i=0;i<65;i++){let x=rand(-520,520),z=rand(-450,430);if(Math.abs(x)<210)continue;const wp=mapPoint(...mapAnchors.well);if(Math.hypot(x-wp[0],z-wp[2])<40)continue;tree(old,x,z,rand(.6,1.4))}
// Reed beds and fine stems along the marsh margin.
for(let i=0;i<1400;i++){let a=rand(0,Math.PI*2),r=rand(1,1.15);let x=-60+Math.cos(a)*155*r,z=15+Math.sin(a)*211*r;let h=rand(.6,2.2);box(old,reed,x,h/2+.2,z,.1,h,.1);if(i%3===0)box(old,thatch,x,h+.13,z,.22,.35,.22)}
// Water ripples: thin, softly coloured geometry on the surface.
const ripple=mat('ripple','#91aaa0',60);for(let i=0;i<220;i++){let x=rand(-170,80),z=rand(-150,160);if(inside(x,z,[[-260,-220],[-110,-240],[25,-184],[110,-75],[76,58],[161,140],[142,215],[46,247],[-83,215],[-110,92],[-177,4],[-227,-90]]))box(old,ripple,x,.265,z,rand(1,5),.018,.12)}
// Oriental storks: pale body, black flight feathers, long dark bills, red legs.
function stork(x,z,s){for(let side of [-1,1])box(old,red,x+side*.19*s,.8*s,z,.065*s,1.5*s,.065*s);ellipsoid(old,white,x,1.8*s,z,.48*s,.66*s,.74*s);ellipsoid(old,black,x+.33*s,1.8*s,z+.08*s,.18*s,.51*s,.65*s);ellipsoid(old,white,x,2.5*s,z-.42*s,.15*s,.66*s,.18*s);ellipsoid(old,white,x,3.05*s,z-.5*s,.23*s,.23*s,.28*s);box(old,black,x,3.02*s,z-.93*s,.075*s,.07*s,.65*s)}
for(let i=0;i<17;i++)stork(rand(-80,45),rand(-105,95),rand(.8,1.2));
label('황새가 찾아오는 습지',570,460,4,'old');label('논과 들',180,170,3,'old');label('초가가 모인 마을',190,787,10,'old');
// Photograph-guided school compound. The topology and common coordinate system are retained.
const brick=mat('schoolBrick','#a26b55'),stone=mat('schoolStone','#c6c9c5'),navy=mat('navyUniform','#101e32'),skyShirt=mat('skyUniform','#a8c9e3'),skin=mat('skin','#d9aa84'),hair=mat('hair','#292520'),bluePanel=mat('bluePanel','#076298',42),orangePanel=mat('orangePanel','#ed5c2d'),greenPanel=mat('greenPanel','#258f66'),creamCloth=mat('creamCloth','#ddd4bb'),brownCloth=mat('brownCloth','#817057'),indigoCloth=mat('indigoCloth','#556877'),metal=mat('metal','#aeb6b4',66),stoneDark=mat('stoneDark','#8b918e');
function patternMaterial(m,type){const c=document.createElement('canvas');c.width=c.height=512;let g=c.getContext('2d');g.fillStyle=m.diffuse.toString(false);g.fillRect(0,0,512,512);if(type==='brick'){for(let row=0;row<32;row++)for(let k=-1;k<17;k++){g.fillStyle=['#98614e','#ac735a','#8f5b4c','#a96c53'][(row+k+17)%4];g.fillRect(k*32+(row%2)*16+1,row*16+1,30,14)}m.diffuseMapTiling=new pc.Vec2(8,2)}else{g.strokeStyle='#78837f70';g.lineWidth=1;for(let n=0;n<=512;n+=64){g.beginPath();g.moveTo(n,0);g.lineTo(n,512);g.moveTo(0,n);g.lineTo(512,n);g.stroke()}}const tex=new pc.Texture(device,{anisotropy:ANISO,width:512,height:512,mipmaps:true});tex.setSource(c);m.diffuseMap=tex;m.diffuse.set(1,1,1);m.update()}
patternMaterial(brick,'brick');patternMaterial(stone,'stone');glass.diffuseMap=windowReflect.diffuseMap;glass.diffuse.set(1,1,1);glass.gloss=.72;glass.update();grass._meterScale=14;soil._meterScale=18;asphalt._meterScale=8;roof._meterScale=9;walk.diffuseMap=pavers.diffuseMap;walk.diffuse.set(1,1,1);walk._meterScale=8;walk.update();
function frame(x,z,angle){const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);const point=(xx,yy,zz)=>[x+xx*c+zz*s,yy,z-xx*s+zz*c];return{point,box:(m,xx,yy,zz,w,h,d)=>{let p=point(xx,yy,zz);box(now,m,...p,w,h,d,angle)},sphere:(m,xx,yy,zz,rx,ry,rz)=>{let p=point(xx,yy,zz);ellipsoid(now,m,...p,rx,ry,rz)},quad:(m,corners,uv)=>{let p=[],n=[];for(let q of corners){p.push(...point(...q));n.push(s,0,c)}geom(now,m,p,n,uv,[0,1,2,0,2,3])}}}
async function photoMaterial(name,index){const im=new Image();im.src=referencePhotos[index].src;await im.decode();const bitmap=await createImageBitmap(im,{imageOrientation:'flipY',premultiplyAlpha:'none'});const tex=new pc.Texture(device,{anisotropy:ANISO,width:bitmap.width,height:bitmap.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false});tex.setSource(bitmap);const m=mat(name,'#ffffff',8);m.diffuseMap=tex;m.emissiveMap=tex;m.emissive=new pc.Color(.12,.12,.12);m.cull=pc.CULLFACE_BACK;m.update();return m}
function facadeUV(x0,y0,x1,y1,w,h){return[x0/w,1-y1/h,x1/w,1-y1/h,x1/w,1-y0/h,x0/w,1-y0/h]}
function sign(){return;}
const schoolMapPoint=mapPoint(...mapAnchors.school),schoolOrigin={x:schoolMapPoint[0],z:schoolMapPoint[2]},schoolAngle=43;
const school=frame(schoolOrigin.x,schoolOrigin.z,schoolAngle);
const muralFace=await photoMaterial('whaleMuralPhoto',3);
// Four-storey red brick main building, silver horizontal bands, central glazed stairwell.
school.box(walk,3,.13,43,145,.26,134);school.box(brick,0,9.3,0,87,18.6,12);school.box(stone,0,18.72,0,88,.35,12.8);school.box(roof,0,18.78,0,85,.12,10.8);
for(let y of [4.2,8.65,13.1,18.25]){school.box(stone,0,y,6.15,87,.48,.28);school.box(stone,0,y,-6.15,87,.48,.28)}
// Original facade pixels are UV-mapped onto geometry; the photograph itself is unchanged.
// The front is fully modelled so missing photographic textures cannot turn it black.
for(let floor=0;floor<4;floor++)for(let x=-40;x<41;x+=4.6){if(Math.abs(x-14)<5)continue;let y=2.7+floor*4.45;school.box(stone,x,y,6.23,3.9,2.68,.14);school.box(glass,x,y,6.35,3.58,2.36,.12);for(let dx of [-1.15,0,1.15])school.box(white,x+dx,y,6.47,.085,2.4,.1);school.box(white,x,y-.4,6.49,3.62,.08,.1)}
// Back elevation and deep-set windows retain volume from every viewing direction.
for(let floor=0;floor<4;floor++)for(let x=-40;x<41;x+=4.6){let y=2.7+floor*4.45;school.box(stone,x,y,-6.22,3.85,2.6,.14);school.box(glass,x,y,-6.32,3.52,2.34,.1);for(let dx of [-1.12,0,1.12])school.box(white,x+dx,y,-6.41,.08,2.36,.1);school.box(white,x,y-.38,-6.42,3.6,.07,.1)}
school.box(glass,14,10.3,6.45,7.8,15.3,.35);for(let x=10.2;x<18.1;x+=1.3)school.box(white,x,10.3,6.68,.08,15.3,.1);for(let y=3;y<18;y+=1.55)school.box(white,14,y,6.7,7.8,.08,.1);
// Central gable and projecting stone entrance canopy.
const roofP=[school.point(9.4,18.65,6.7),school.point(18.6,18.65,6.7),school.point(14,21.5,6.7)];geom(now,brick,roofP.flat(),[0,0,1,0,0,1,0,0,1],[0,0,1,0,.5,1],[0,1,2]);
school.box(stone,14,3.9,9.6,15,1.25,6);for(let x of [8,20])school.box(stone,x,1.8,10.7,.9,3.6,.9);school.box(dark,14,1.5,6.7,6,3,.18);for(let j=0;j<3;j++)school.box(stone,14,.12+j*.13,12-j*.65,15,.24+j*.26,.65);
sign(school,'부산교육대학교부설초등학교',-11,19.8,6.5,36,1.5);
// Photo-derived school coordinates: +z runs from the main entrance toward the sand yard.
const yardSpec={lawn:{x:0,z:38.5,w:76,d:49},sand:{x:-2,z:74.7,w:77,d:20},pineX:42,bambooX:57,shelterX:-40.5,barZ:71.5};
school.box(grass,0,.31,38.5,76,.22,49);school.box(soil,-2,.31,74.7,77,.22,20);
school.box(pavers,0,.30,10.5,87,.16,5.5);school.box(pavers,-44,.30,38,5,.16,53);school.box(asphalt,49,.28,34,7,.2,72);
school.box(stone,-46,.98,38,1.1,1.96,54);school.box(grass,-49,1.95,38,5,.2,54);
// Thin round steel tubes for the photographed climbing frames and railings.
function tube(f,m,a,b,r=.06,sides=8){let aa=f.point(...a),bb=f.point(...b),axis=bb.map((v,i)=>v-aa[i]),len=Math.hypot(...axis);if(len<1e-6)return;axis=axis.map(v=>v/len);let helper=Math.abs(axis[1])<.95?[0,1,0]:[1,0,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],u=cross(axis,helper),ul=Math.hypot(...u);u=u.map(v=>v/ul);let v=cross(axis,u),p=[],n=[],uv=[],idx=[];for(let j=0;j<=1;j++)for(let i=0;i<=sides;i++){const t=i/sides*Math.PI*2,nn=u.map((a,k)=>a*Math.cos(t)+v[k]*Math.sin(t));p.push(...aa.map((a,k)=>a+axis[k]*len*j+nn[k]*r));n.push(...nn);uv.push(i/sides,j)}for(let i=0;i<sides;i++){const a=i,b=i+sides+1;idx.push(a,a+1,b,a+1,b+1,b)}geom(now,m,p,n,uv,idx)}
// Separate botanical silhouettes: branching pine crowns versus jointed bamboo culms.
const pineBark=surface('pineBark','#655d50','soil',2),bambooStem=mat('bambooStem','#638353'),bambooNode=mat('bambooNode','#94ad78');
let vegetationSeed=731;const vr=()=>{vegetationSeed=(1664525*vegetationSeed+1013904223)>>>0;return vegetationSeed/4294967296};const vv=(a,b)=>a+(b-a)*vr();
function foliageMaterial(name,pine){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
 for(let k=0;k<(pine?23:13);k++){const start=[256,490],tip=[vv(35,477),vv(28,275)],dx=tip[0]-start[0],dy=tip[1]-start[1];g.strokeStyle=pine?'#635e3b':'#718251';g.lineWidth=pine?2.5:1.7;g.beginPath();g.moveTo(...start);g.lineTo(...tip);g.stroke();
  for(let j=0;j<(pine?44:15);j++){const t=.16+j/(pine?52:19),x=start[0]+dx*t,y=start[1]+dy*t;for(const side of [-1,1]){const ang=Math.atan2(dy,dx)+side*vv(.48,1.15),len=vv(pine?14:24,pine?29:44),tx=x+Math.cos(ang)*len,ty=y+Math.sin(ang)*len;g.strokeStyle=['#254730','#3c5d36','#526a40','#66814a'][Math.floor(vr()*4)];g.fillStyle=g.strokeStyle;g.lineWidth=pine?1.45:1;if(pine){g.beginPath();g.moveTo(x,y);g.lineTo(tx,ty);g.stroke()}else{const nx=-Math.sin(ang)*4,ny=Math.cos(ang)*4;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo((x+tx)/2+nx,(y+ty)/2+ny,tx,ty);g.quadraticCurveTo((x+tx)/2-nx,(y+ty)/2-ny,x,y);g.fill()}}}
 }
 const tex=new pc.Texture(device,{anisotropy:ANISO,width:512,height:512,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false}),raw=g.getImageData(0,0,512,512).data,out=tex.lock();for(let y=0;y<512;y++)out.set(raw.subarray((511-y)*2048,(512-y)*2048),y*2048);tex.unlock();const m=mat(name,'#ffffff');m.diffuseMap=tex;m.opacityMap=tex;m.opacityMapChannel='a';m.alphaTest=.27;m.cull=pc.CULLFACE_NONE;m.twoSidedLighting=true;m.update();return m;
}
const pineNeedles=foliageMaterial('pineNeedles',true),bambooLeaves=foliageMaterial('bambooLeaves',false);
function foliageCard(f,m,x,y,z,w,h,az,pitch){const a=az*Math.PI/180,b=pitch*Math.PI/180,r=[Math.cos(a),0,Math.sin(a)],u=[-Math.sin(a)*Math.sin(b),Math.cos(b),Math.cos(a)*Math.sin(b)],points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>f.point(x+r[0]*i*w/2+u[0]*j*h/2,y+u[1]*j*h/2,z+r[2]*i*w/2+u[2]*j*h/2)),ab=points[1].map((q,i)=>q-points[0][i]),ac=points[2].map((q,i)=>q-points[0][i]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],l=Math.hypot(...n);geom(now,m,points.flat(),Array(4).fill(n.map(v=>v/l)).flat(),[0,0,1,0,1,1,0,1],[0,1,2,0,2,3])}
function photoPine(x,z,s=1){const bend=vv(-.7,.9),turn=vv(-.5,.5),levels=[[x,.3,z],[x+bend,4.8*s,z+.25],[x+bend*.4,8.7*s,z+turn],[x+.45,11.8*s,z-.2]];for(let i=1;i<levels.length;i++)tube(school,pineBark,levels[i-1],levels[i],(.38-i*.075)*s,9);
 for(let j=0;j<9;j++){const a=j*2.4+vv(-.3,.3),yy=(7.5+j*.53)*s,rad=vv(1.8,3.3)*s,cx=x+Math.cos(a)*rad,cz=z+Math.sin(a)*rad,mid=[x+Math.cos(a)*rad*.56,yy-.18, z+Math.sin(a)*rad*.56];tube(school,pineBark,[x+bend*.4,yy-.75,z],mid,.115*s,7);tube(school,pineBark,mid,[cx,yy+.6*s,cz],.065*s,6);
  for(let k=0;k<5;k++){const ang=a+k*1.5,px=cx+Math.cos(ang)*vv(.25,1.1)*s,pz=cz+Math.sin(ang)*vv(.25,1.1)*s,py=yy+vv(.2,1.2)*s;tube(school,pineBark,[cx,yy+.6*s,cz],[px,py,pz],.025*s,5);for(let q=0;q<3;q++)foliageCard(school,pineNeedles,px,py,pz,vv(1.8,2.5)*s,vv(1.3,1.9)*s,a*57.3+q*60,vv(15,75))}
 }
 for(let k=0;k<10;k++){const a=k*2.4;foliageCard(school,pineNeedles,x+.45+Math.cos(a)*.75*s,(11.8+Math.sin(k)*.35)*s,z-.2+Math.sin(a)*.75*s,2.5*s,1.9*s,k*41,35+k%4*12)}
}
// Simple open bamboo: straight jointed stems and a few clean lance leaves.
const bambooSimpleLeaf=mat('bambooSimpleLeaf','#527343');bambooSimpleLeaf.cull=pc.CULLFACE_NONE;bambooSimpleLeaf.twoSidedLighting=true;bambooSimpleLeaf.update();
function bambooPlant(f,x,z,h,lean=0){const base=f.point(x,0,z);if(pathDistance(base[0],base[2],bambooRouteWorld)<6.4)return;h=6.7+(h%2.4);lean*=.25;
 tube(f,bambooStem,[x,.3,z],[x+lean,h,z],.10,7);
 for(let y=1;y<h;y+=1.05){const t=y/h;tube(f,bambooNode,[x+lean*t,y,z],[x+lean*t,y+.045,z],.112,7)}
 for(let k=0;k<4;k++){const y=h-2.5+k*.65,a=k*2.4,dx=Math.cos(a),dz=Math.sin(a),bx=x+lean*y/h;
 tube(f,bambooStem,[bx,y,z],[bx+dx*1.05,y+.2,z+dz*1.05],.022,5);
 for(let j=0;j<5;j++){const t=.27+j*.17,px=bx+dx*t,py=y+.2*t,pz=z+dz*t,side=j%2?1:-1,l=.55+(j%2)*.12,ex=dx*.26-dz*side*l,ez=dz*.26+dx*side*l;
 const ps=[[px,py,pz],[px+ex*.45-dz*.075,py-.06,pz+ez*.45+dx*.075],[px+ex,py-.32,pz+ez],[px+ex*.45+dz*.075,py-.13,pz+ez*.45-dx*.075]].map(q=>f.point(...q));geom(now,bambooSimpleLeaf,ps.flat(),Array(4).fill([0,1,0]).flat(),[0,0,1,0,1,1,0,1],[0,1,2,0,2,3]);}
 }
}

// Lawn edge: mature pines in the red rectangle. The grove behind them is bamboo.
for(let z=17;z<=62;z+=7.3)photoPine(42,z,.95+(z%3)*.045);
for(let z=17;z<64;z+=1.55)school.sphere(leaf,42,.9,z,1.5,.65,1.08);
for(let i=0;i<60;i++){const x=55.2+(i%3)*2.1,z=8+Math.floor(i/3)*2.8;bambooPlant(school,x,z,10.4+(i%7)*.48,(i%3-1)*.5)}
function shelter(x,z){for(let q of [-1,1])for(let r of [-1,1])school.box(wood,x+q*1.55,1.7,z+r*1.1,.12,2.8,.12);for(let row=0;row<12;row++){school.box(wood,x, .65+row*.18,z-1.1,3.2,.115,.1);for(let q of [-1,1])school.box(wood,x+q*1.55,.65+row*.18,z,.1,.115,2.2)}school.box(wood,x,.62,z,3.1,.14,2.2);for(let q of [-1,1])for(let k=0;k<12;k++){let xx=q*(k+.5)*1.8/12,yy=3.6-Math.abs(xx)*.5;school.box(roofDark,x+xx,yy,z,.18,.12,2.7)}}
for(let z of [20,30.5,41,51.5]){shelter(-40.5,z);const p=school.point(-43.2,0,z-2);tree(now,p[0],p[2],.72)}
// White low fence and hedges separate grass from the sand play space.
for(let x=-37;x<=31;x+=1.5){tube(school,white,[x,.45,64],[x,1.45,64],.035);if(x<37){tube(school,white,[x,.83,64],[x+1.5,.83,64],.026);tube(school,white,[x,1.1,64],[x+1.5,1.1,64],.026)}for(let i=0;i<2;i++){let cx=x+.35+i*.65;for(let k=0;k<8;k++){let a=k/8*Math.PI*2,b=(k+1)/8*Math.PI*2;tube(school,white,[cx+Math.cos(a)*.2,1.21+Math.sin(a)*.21,64],[cx+Math.cos(b)*.2,1.21+Math.sin(b)*.21,64],.017)}}}
for(let x=-37;x<=31;x+=1.4)if(x<-17||x>18)school.sphere(leaf,x,.85,63,.95,.52,.66);
for(let x=-39;x<37;x+=.64)school.box([bluePanel,orangePanel,greenPanel][Math.floor((x+40)/3)%3],x,.48,65,.58,.22,.4);
function palm(f,x,z){f.box(wood,x,2.1,z,.22,4.2,.22);for(let i=0;i<9;i++){let a=i*6.283/9;for(let k=0;k<4;k++){let r=.3+k*.42;f.sphere(leaf,x+Math.sin(a)*r,4.4-k*k*.09,z+Math.cos(a)*r,.28,.14,.57)}}}
palm(school,-28,62);palm(school,10,62);
// Horizontal bars on the left; tall rectangular climbing bars in the centre.
for(let i=0;i<4;i++){let x=-33+i*3.3,h=1.65+i*.28;tube(school,metal,[x,.45,70],[x,h,70],.055);tube(school,metal,[x+3.3,.45,70],[x+3.3,h,70],.055);tube(school,metal,[x,h,70],[x+3.3,h,70],.055)}
for(let x=-14;x<=10;x+=4){tube(school,metal,[x,.45,71.5],[x,3.35,71.5],.055);tube(school,metal,[x,3.35,71.5],[Math.min(x+4,10),3.35,71.5],.055)}
for(let x of [-14,-10,-6])for(let yy=.8;yy<=3.1;yy+=.5)tube(school,metal,[x,yy,71.5],[x+4,yy,71.5],.045);
// Stepped dome-shaped jungle gym on the right.
for(let ix=0;ix<5;ix++)for(let iz=0;iz<4;iz++){const x=22+ix*1.3,z=70+iz*1.3,h=1.5+(2-Math.abs(ix-2))*.7;tube(school,metal,[x,.45,z],[x,h,z],.045);for(let y=1;y<=h;y+=.65){if(ix<4)tube(school,metal,[x,y,z],[x+1.3,Math.min(y,1.5+(2-Math.abs(ix+1-2))*.7),z],.04);if(iz<3)tube(school,metal,[x,y,z],[x,y,z+1.3],.04)}}
for(let x of [32.5,34]){tube(school,metal,[x,.45,72],[x,1.8,72],.06);tube(school,metal,[x,1.8,72],[x,1.8,78],.06);tube(school,metal,[x,1.8,78],[x,.45,78],.06)}
// Two seesaws occupy the left/front sand area.
for(let z of [78.5,81.5]){school.box(dark,-23,.65,z,.55,.55,.75);tube(school,metal,[-27,.72,z],[-19,1.05,z],.09);for(let x of [-26.4,-24.8,-21.2,-19.6]){school.box(x<-23?red:orangePanel,x,.89+(x+23)*.04,z,.75,.16,.7);tube(school,metal,[x,1,z],[x,1.4,z],.035)}}
// Wide steps beside the mural lead up to the covered upper terrace.
for(let k=0;k<11;k++)school.box(stone,1.4,.4+k*.14,87.8+k*.57,29.8,.2+k*.28,.62);
for(let x of [-12,1,15]){tube(school,metal,[x,.55,87],[x,1.5,87],.035);tube(school,metal,[x,1.5,87],[x,3.1,94.4],.035);tube(school,metal,[x,3.1,94.4],[x,2.2,94.4],.035)}
school.box(stone,1.4,1.65,99,29.8,3.3,10);
const lawnPos=school.point(0,0,38.5),sandPos=school.point(-2,0,74.7);worldLabel('잔디운동장',lawnPos[0],lawnPos[2],'now',2);worldLabel('모래운동장',sandPos[0],sandPos[2],'now',2);

function canopy(f,x,z,len){for(let k=-len/2;k<=len/2;k+=4)f.box(wood,x+k,1.6,z+1.7,.12,3.2,.12);for(let k=0;k<8;k++){let zz=-1.9+k*.55,yy=3.1+Math.sqrt(Math.max(0,4-zz*zz))*.27;f.box(roof,x,yy,z+zz,len,.07,.58)}for(let k=-len/2;k<=len/2;k+=2)f.box(metal,x+k,3.55,z,.055,.055,4.1)}
// Continuous L-shaped school canopy emitted below.
// Gaenari: white three-storey block and the actual whale mural mapped to the end wall.
const gp=school.point(23,0,114),gaenari=frame(gp[0],gp[2],schoolAngle+90);
gaenari.box(white,0,7.2,0,39,14.4,13);gaenari.box(roof,0,14.55,0,40,.3,14);
for(let floor=0;floor<3;floor++)for(let x=-16;x<=16;x+=5){let y=2.4+floor*4.5;gaenari.box(stone,x,y,6.6,3.3,2.55,.18);gaenari.box(glass,x,y,6.72,2.9,2.2,.08);gaenari.box(white,x,y,6.81,.07,2.3,.08);gaenari.box(white,x,y-.45,6.82,3,.07,.08)}
const muralEnd=frame(gp[0],gp[2],schoolAngle+180);
muralEnd.box(white,0,7.2,20,13,14.4,.22);muralEnd.quad(muralFace,[[-5.9,.2,20.14],[5.9,.2,20.14],[5.9,13.7,20.14],[-5.9,13.7,20.14]],facadeUV(300,233,767,842,1440,1080));sign(muralEnd,'개나리관',0,14.6,20.2,10,1.1);
for(let k=0;k<7;k++)gaenari.box([greenPanel,bluePanel,orangePanel][k%3],-17+k*5.4,10.2,6.84,.7,5,.25);canopy(gaenari,0,8.7,39);
// Parangsae: blue metal cladding, orange-red outlined recesses and green arched canopy.
const bp=school.point(-24,0,104),parang=frame(bp[0],bp[2],schoolAngle+90);
parang.box(white,0,5.1,0,44,10.2,12);parang.box(bluePanel,0,8.3,6.15,44,4.2,.28);parang.box(bluePanel,-20,5.3,6.35,3,10.6,.3);parang.box(bluePanel,20,5.3,6.35,3,10.6,.3);
parang.box(white,-3,9.4,0,13,18.8,11);parang.box(orangePanel,-9.6,12.4,6.4,.7,12.7,.55);parang.box(orangePanel,3.6,12.4,6.4,.7,12.7,.55);parang.box(orangePanel,-3,18.6,6.4,13.8,.7,.55);parang.box(orangePanel,-3,6.2,6.4,13.8,.7,.55);parang.box(bluePanel,-3,13,6.21,12.4,2.2,.19);
for(let x=-18;x<=18;x+=3.7){for(let y of [2.35,6.8]){parang.box(stone,x,y,6.5,2.8,2.8,.2);parang.box(glass,x,y,6.64,2.5,2.5,.09);parang.box(white,x,y,6.76,.07,2.55,.1)}}for(let x of [-14,12]){parang.box(orangePanel,x,8.2,6.9,5.3,.55,.6);for(let dx of [-2.4,2.4])parang.box(orangePanel,x+dx,6.55,6.9,.55,3.7,.6)}
canopy(parang,0,9,46);sign(parang,'파랑새관',-3,17.2,6.75,10,1.25);
// Songjuk hall: eastern/right block of the south-eastern school precinct.
const sp=school.point(66,0,97),songjuk=frame(sp[0],sp[2],schoolAngle-90);
const songBlue=mat('songjukBlue','#0865a5',35),songSeam=mat('songjukSeam','#194b76'),songGray=mat('songjukGray','#929fa6'),songYellow=mat('songjukYellow','#d5ce43'),songRed=mat('songjukRed','#ab4d3b');
songjuk.box(white,0,6.4,0,46,12.8,13);
songjuk.box(songGray,0,2.05,6.57,46,4.1,.18);
songjuk.box(white,0,6.15,6.58,46,4.1,.2);
songjuk.box(songBlue,0,10.7,6.73,47,5,.42);
songjuk.box(songBlue,0,13.18,0,47,.3,13.8);
// The blue cladding wraps the end wall. Fine seams follow the vertical metal panels.
for(const side of [-1,1]){songjuk.box(songBlue,side*23.2,10.7,0,.4,5,13.4);for(let z=-6.3;z<6.5;z+=1.15)songjuk.box(songSeam,side*23.43,10.7,z,.025,4.9,.045)}
for(let x=-23;x<23.1;x+=1.15)songjuk.box(songSeam,x,10.7,6.954,.045,4.95,.022);
// Orange frames, yellow panels between floors and green panels at the base.
for(const [cx,top]of [[-13,8.25],[4.4,11.6]]){for(const dx of [-2.8,2.8])songjuk.box(orangePanel,cx+dx,top/2,7.02,.7,top,.18);songjuk.box(orangePanel,cx,top-.42,7.02,6.3,.85,.18);songjuk.box(songYellow,cx,4.22,6.85,4.9,1.65,.16);songjuk.box(greenPanel,cx,.93,6.86,4.9,1.65,.18)}
for(let z=-6;z<6;z+=1.5){songjuk.box(songRed,-23.18,4.1,z,.18,8.2,1.45);songjuk.box(songYellow,-23.3,4.2,z,.1,1.65,1.45);if(z>-2)songjuk.box(greenPanel,-23.31,1.25,z,.12,2.4,1.45)}
function songWindow(x,y,z=7.12){songjuk.box(stone,x,y,z,3.65,2.7,.18);songjuk.box(glass,x,y,z+.12,3.4,2.46,.1);for(const dx of [-1.12,0,1.12])songjuk.box(white,x+dx,y,z+.22,.065,2.55,.07);songjuk.box(white,x,y+.15,z+.23,3.5,.065,.07);songjuk.box(white,x,y-1.36,z+.25,3.8,.12,.3);for(const yy of [-.72,-.4,-.08])songjuk.box(metal,x,y+yy,z+.4,3.65,.04,.04)}
for(let x=-18;x<=21.1;x+=4.9)for(const y of [2.03,6.08,10.1])songWindow(x,y);
// Entrance is at the right end, with a short curved rain cover, not a full-width verandah.
songjuk.box(dark,21,1.65,7.05,3.2,3.3,.18);songjuk.box(glass,21,1.65,7.18,2.9,3.05,.08);songjuk.box(metal,21,1.65,7.27,.08,3.12,.08);canopy(songjuk,21,8.7,5.2);
songjuk.box(roof,0,13.36,0,45,.09,11.8);
wallText(songjuk,'35 송죽관',-18.8,12.23,7.02,6,.65,'#ffffff');
// Small planted forecourt shown in the photograph.
songjuk.box(pavers,0,.24,12.2,47,.16,8.5);
for(const x of [-15,-5,7]){songjuk.sphere(grass,x,.34,13,2.8,.15,2);songjuk.sphere(leaf,x,.75,13,1.15,.55,.85)}

// The hall is along the rear of the main block; its front faces the end access road.
const kp=mapPoint(...mapAnchors.hall),kkachi=frame(kp[0],kp[2],schoolAngle+90);
kkachi.box(stone,0,4.45,0,25,8.9,40);kkachi.box(stone,0,8.95,20.1,25.5,.7,.36);
// Continuous shallow barrel roof, with front/back curved infill and metal edge caps.
for(let i=0;i<40;i++){let x1=-12.5+i*25/40,x2=-12.5+(i+1)*25/40,h=x=>9.15+2.7*Math.sqrt(Math.max(0,1-(x/12.5)**2)),y1=h(x1),y2=h(x2);const p=[kkachi.point(x1,y1,-20),kkachi.point(x1,y1,20),kkachi.point(x2,y2,20),kkachi.point(x2,y2,-20)],nx=-(y2-y1),ny=x2-x1,nl=Math.hypot(nx,ny),nn=kkachi.point(nx/nl,ny/nl,0),oo=kkachi.point(0,0,0);geom(now,stone,p.flat(),Array(4).fill(nn.map((v,j)=>v-oo[j])).flat(),[i/5,0,i/5,4,(i+1)/5,4,(i+1)/5,0],[0,1,2,0,2,3]);for(let z of [-20.05,20.05]){kkachi.box(stone,(x1+x2)/2,(9.05+(y1+y2)/2)/2,z,x2-x1+.02,(y1+y2)/2-9.05,.14);tube(kkachi,urbanSand,[x1,y1+.08,z],[x2,y2+.08,z],.1)}}
kkachi.box(stone,0,7.8,20.17,25.6,.6,.3);
// Front windows, entrance canopy and two cylindrical support columns.
kkachi.box(dark,2,5.75,20.2,11.5,2.1,.16);kkachi.box(windowReflect,2,5.75,20.3,11.2,1.9,.08);for(let x=-3.5;x<=7.5;x+=2.2)kkachi.box(white,x,5.75,20.38,.075,1.96,.09);kkachi.box(white,2,5.75,20.39,11.3,.075,.09);
for(let x of [-10.8,-8.2,-5.7]){kkachi.box(windowReflect,x,5.3,20.25,1.2,2,.1);kkachi.box(white,x,5.3,20.37,1.25,.08,.08)}
kkachi.box(dark,2,1.75,20.18,10.3,3.5,.22);kkachi.box(windowReflect,2,1.75,20.35,10,3.25,.08);for(let x=-3;x<=7;x+=2)kkachi.box(metal,x,1.75,20.45,.09,3.3,.1);kkachi.box(metal,2,2.55,20.46,10,.08,.1);
kkachi.box(stone,2,3.95,22.2,15.2,1.05,4.5);for(let x of [-4,8])tube(kkachi,stone,[x,.2,23.3],[x,3.45,23.3],.43,16);
kkachi.box(pavers,0,.12,23,29,.24,7);
for(let k=0;k<26;k++){const z=26-k*.55,top=.22+k*.19;kkachi.box(stone,-16,top/2,z,7,top,.55);for(let x of [-19.9,-12.1])kkachi.box(brick,x,(top+.7)/2,z,.65,top+.7,.56)}
for(let x of [-19.9,-12.1])tube(kkachi,stone,[x,1.02,26],[x,5.77,12.25],.08);
for(let z=-17;z<18;z+=4.4){kkachi.box(windowReflect,12.58,4.8,z,.1,4.8,2.8);kkachi.box(stone,12.72,4.8,z-1.45,.2,6.2,.25)}
// Brick retaining beds beside the stairs and the end-of-main-building glazed stairwell.
for(let z of [15,19,23]){kkachi.box(brick,-21,.7,z,2,1.4,3);kkachi.sphere(leaf,-21,1.8,z,1.3,.65,1.5)}
for(let row=0;row<4;row++){const y=2.3+row*4.45;school.box(windowReflect,43.58,y,-2.5,.15,3.9,4.5);for(let z=-4.7;z<=0;z+=1.1)school.box(white,43.69,y,z,.12,3.95,.065);school.box(stone,43.7,y+1.95,-2.5,.2,.25,4.8)}
const approach=frame(kp[0],kp[2],schoolAngle+90);approach.box(asphalt,0,.1,37,57,.2,19);for(let x=-23;x<25;x+=3.1)approach.box(orangePanel,x,.22,35,1.5,.035,4.7);
wallText(kkachi,'까 치 관',2,7.65,20.51,7.7,.95,'#184f86');
for(let x=-12;x<=12;x+=2)kkachi.box(stoneDark,x,8.18,20.34,.025,.95,.05);
for(let x=-5;x<10;x+=1.35)kkachi.box(stoneDark,x,3.98,24.49,.025,.82,.025);
for(let y=1;y<8;y+=1.2)kkachi.box(stoneDark,0,y,20.205,25,.014,.025);
for(let x=-11.5;x<13;x+=3)kkachi.box(stoneDark,x,4.3,20.206,.014,8.1,.025);
kkachi.box(stone,-16,4.92,10.7,7,.22,3);

// University roof topology: transverse wings, connecting corridors, courts and formal landscaping.
// Transverse university wings are authored below.

// Crest sampled from the supplied close-up photograph, with its original green and gold detail.
const crestImage=new Image();crestImage.src=window.schoolBadgeReference;await crestImage.decode();
const crestCanvas=document.createElement('canvas');crestCanvas.width=crestCanvas.height=256;const cg=crestCanvas.getContext('2d');cg.scale(256/58,256/58);cg.translate(-269,-89);cg.beginPath();
for(const [i,p]of [[297,92],[303,97],[307,104],[307,111],[316,122],[322,130],[322,136],[317,139],[306,140],[302,145],[294,145],[289,141],[278,141],[271,137],[273,130],[281,116],[284,112],[286,103],[291,97]].entries())i?cg.lineTo(...p):cg.moveTo(...p);cg.closePath();cg.clip();cg.drawImage(crestImage,0,0);
const crestTexture=new pc.Texture(device,{anisotropy:ANISO,width:256,height:256,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false}),crestPixels=cg.getImageData(0,0,256,256).data,crestDest=crestTexture.lock();for(let row=0;row<256;row++)crestDest.set(crestPixels.subarray((255-row)*1024,(256-row)*1024),row*1024);crestTexture.unlock();
const crestMat=mat('schoolCrest','#ffffff',12);crestMat.diffuseMap=crestTexture;crestMat.opacityMap=crestTexture;crestMat.opacityMapChannel='a';crestMat.alphaTest=.15;crestMat.cull=pc.CULLFACE_BACK;crestMat.update();
school.quad(crestMat,[[13.13,19.05,6.75],[14.87,19.05,6.75],[14.87,20.79,6.75],[13.13,20.79,6.75]],[0,0,1,0,1,1,0,1]);

// Main field boundary and small parking rows, emitted on modern ground only.

// Reusable people models: actual-sized meshes with enlarged, accessible talk targets.
const people=[];const moverBatch=app.batcher.addGroup('movers',true,120);const lowSphere=pc.createSphere(device,{radius:.5,latitudeBands:7,longitudeBands:10});function primitive(parent,type,m,x,y,z,sx,sy,sz){const e=new pc.Entity(type);if(type==='sphere')e.addComponent('render',{meshInstances:[new pc.MeshInstance(lowSphere,m)],castShadows:false});else{e.addComponent('render',{type,castShadows:false});e.render.material=m}e.render.batchGroupId=moverBatch.id;e.setLocalPosition(x,y,z);e.setLocalScale(sx,sy,sz);parent.addChild(e);return e}
const hanbokMats={pink:mat('hanbokPink','#dc97a0'),yellow:mat('hanbokYellow','#e8c860'),sky:mat('hanbokSky','#a9cbdc'),green:mat('hanbokGreen','#7fa66a'),white:mat('hanbokWhite','#efeadc'),skirtRed:mat('skirtRed','#b9474b'),skirtBlue:mat('skirtBlue','#3f5f82'),skirtIndigo:mat('skirtIndigo','#34465e'),sashBlue:mat('sashBlue','#2f5fa8'),sashRed:mat('sashRed','#c43a2e'),sashYellow:mat('sashYellow','#e3b21f'),hatBlack:mat('hatBlack','#1c1c1e'),brass:mat('brass','#c9a445',70),drumRed:mat('drumRed','#a8322a'),paper:mat('paperWhite','#f6f3e8')};
function dressPerson(group,o,child){if(o.skirt){primitive(group,'cone',o.skirt,0,.5,0,.66,1.02,.62);primitive(group,'box',o.top||hanbokMats.white,0,1.18,0,.44,.3,.28);primitive(group,'box',hanbokMats.sashRed,-.06,1.1,-.145,.05,.18,.02)}
 if(o.bun)primitive(group,'sphere',hair,0,1.55,.22,.17,.15,.15);if(o.braid)primitive(group,'box',hair,0,1.25,.19,.06,.5,.05);
 if(o.band)primitive(group,'box',o.band,0,1.6,0,.37,.065,.37);
 if(o.sash){const sh=primitive(group,'box',o.sash,0,1.1,-.142,.1,.66,.02);sh.setLocalEulerAngles(0,0,38);const sb=primitive(group,'box',o.sash,0,1.1,.142,.1,.66,.02);sb.setLocalEulerAngles(0,0,-38)}
 if(o.hat==='gat'){primitive(group,'cylinder',hanbokMats.hatBlack,0,1.72,0,.62,.02,.62);primitive(group,'cylinder',hanbokMats.hatBlack,0,1.84,0,.26,.24,.26)}
 if(o.hat==='sangmo'){primitive(group,'cylinder',hanbokMats.hatBlack,0,1.76,0,.42,.14,.42);const spin=new pc.Entity('sangmo');group.addChild(spin);spin.setLocalPosition(0,1.88,0);primitive(spin,'box',hanbokMats.paper,.95,.02,0,1.9,.02,.06);o.spin=spin}
 if(o.hat==='gokkal'){primitive(group,'cone',hanbokMats.paper,0,1.9,0,.38,.5,.38);for(let k=0;k<5;k++)primitive(group,'sphere',[hanbokMats.pink,hanbokMats.sashRed,hanbokMats.sashYellow,hanbokMats.sashBlue,hanbokMats.green][k],Math.cos(k*1.26)*.16,1.78+(k%2)*.12,Math.sin(k*1.26)*.16,.12,.12,.12)}
 if(o.hat==='straw')primitive(group,'cone',thatch,0,1.8,0,.62,.22,.62);
 if(o.inst==='kkwaenggwari')primitive(group,'cylinder',hanbokMats.brass,-.22,1.1,-.35,.3,.04,.3).setLocalEulerAngles(80,0,0);
 if(o.inst==='janggu'){for(const q of [-1,1]){const c=primitive(group,'cone',hanbokMats.drumRed,q*.2,.95,-.32,.34,.26,.34);c.setLocalEulerAngles(0,0,q*90)}for(const q of [-1,1])primitive(group,'cylinder',hanbokMats.paper,q*.34,.95,-.32,.36,.02,.36).setLocalEulerAngles(0,0,90)}
 if(o.inst==='buk'){primitive(group,'cylinder',hanbokMats.drumRed,0,1.0,-.36,.46,.3,.46).setLocalEulerAngles(90,0,0);primitive(group,'cylinder',hanbokMats.paper,0,1.0,-.52,.44,.02,.44).setLocalEulerAngles(90,0,0)}
 if(o.inst==='jing')primitive(group,'cylinder',hanbokMats.brass,.2,1.15,-.4,.62,.04,.62).setLocalEulerAngles(80,0,0);
 if(o.inst==='fan'){const fanRoot=new pc.Entity('fan');group.addChild(fanRoot);fanRoot.setLocalPosition(.3,1.05,-.5);const leafA=primitive(fanRoot,'cylinder',hanbokMats.paper,0,0,0,.5,.015,.5);leafA.setLocalEulerAngles(80,0,0);primitive(fanRoot,'box',wood,0,-.2,0,.03,.25,.03);o.fanRoot=fanRoot}
 if(o.jige){primitive(group,'box',wood,-.18,1.0,.3,.06,1.6,.06);primitive(group,'box',wood,.18,1.0,.3,.06,1.6,.06);for(let k=0;k<4;k++)primitive(group,'cylinder',brownCloth,0,1.25+k*.13,.42,.12,.9,.12).setLocalEulerAngles(0,0,90)}
}
function makePerson(eraKey,x,z,name,talk,kind='student',activity='stand',angle=0,opts={}){let e=new pc.Entity('person-'+people.length);(eraKey==='now'?now:old).addChild(e);e.setPosition(x,0,z);e.setEulerAngles(0,angle,0);const child=kind==='student'||kind==='child',height=child?1.48:1.72,s=height/1.65;const group=new pc.Entity('body');e.addChild(group);group.setLocalScale(s,s,s);if(activity!=='swing'&&activity!=='board'){const blob=primitive(e,'plane',contactAO,0,.05,0,1.05,1,1.05);blob.render.receiveShadows=false}let cloth=opts.top||(kind==='trainee'?skyShirt:kind==='student'?skyShirt:kind==='farmer'?creamCloth:kind==='water'?indigoCloth:creamCloth);const modernKid=kind==='student'||(child&&eraKey==='now');primitive(group,'box',skin,0,1.49,0,.34,.34,.34);primitive(group,'box',hair,0,1.66,.025,.36,.12,.36);primitive(group,'box',cloth,0,1.05,0,.43,.55,.27);for(let side of [-1,1]){primitive(group,'box',white,side*.082,1.53,-.175,.08,.055,.012);primitive(group,'box',dark,side*.071,1.53,-.185,.035,.045,.014)}primitive(group,'box',brownCloth,0,1.4,-.18,.11,.035,.014);const legs=[];for(let a of [-1,1]){let pivot=new pc.Entity('leg');group.addChild(pivot);pivot.setLocalPosition(a*.105,.8,0);if(kind==='wader'){primitive(pivot,'box',brownCloth,0,-.15,0,.15,.31,.17);primitive(pivot,'box',creamCloth,0,-.3,0,.18,.095,.19);primitive(pivot,'box',skin,0,-.47,0,.13,.3,.14);primitive(pivot,'box',skin,0,-.66,-.07,.15,.09,.26)}else{primitive(pivot,'box',opts.bottom||(modernKid?navy:child?creamCloth:brownCloth),0,-.31,0,.145,.62,.16);primitive(pivot,'box',modernKid?white:wood,0,-.68,-.055,.17,.1,.29);}legs.push(pivot)}const arms=[];for(let a of [-1,1]){let pivot=new pc.Entity('arm');group.addChild(pivot);pivot.setLocalPosition(a*.25,1.23,0);primitive(pivot,'box',kind==='student'?navy:cloth,0,-.14,0,.14,.3,.15);primitive(pivot,'box',skin,0,-.39,0,.105,.3,.12);arms.push(pivot)}if(kind==='student'){primitive(group,'box',navy,0,1.23,-.125,.16,.1,.035);primitive(group,'box',navy,0,1.11,-.126,.06,.2,.03);for(let side of [-1,1])primitive(group,'box',white,side*.27,1.12,-.073,.032,.26,.018);primitive(group,'box',greenPanel,-.1,1.08,-.135,.06,.07,.015)}else{primitive(group,'box',wood,0,.89,-.13,.36,.045,.04);if(kind==='farmer'){primitive(group,'box',thatch,0,1.77,0,.65,.2,.65);primitive(group,'cylinder',wood,.37,.6,-.15,.04,1.2,.04);primitive(group,'box',dark,.37,.05,-.25,.25,.07,.27)}if(kind==='water'){primitive(group,'box',mud,.37,1.07,0,.36,.45,.36);primitive(group,'cylinder',dark,.37,1.29,0,.22,.025,.22)}if(kind==='child')primitive(group,'box',hair,0,1.7,.03,.12,.15,.12)}
dressPerson(group,opts,child);const pin=document.createElement('button');pin.className='personPin';pin.textContent='⋯';pin.setAttribute('aria-label',name+' 이야기 듣기');$('labels').append(pin);const p={opts,entity:e,group,legs,arms,pin,name,talk,era:eraKey,x,z,activity,angle,height,phase:people.length*.8,pos:new pc.Vec3(x,height+1,z),line:0};people.push(p);pin.onclick=()=>openSpeech(p);return p}
function schoolPerson(lx,lz,name,talk,activity='stand'){const p=school.point(lx,0,lz);return makePerson('now',p[0],p[2],name,talk,'student',activity,schoolAngle)}
schoolPerson(-8,46,'운동장에서 만난 학생',['우리 학교에 온 걸 환영해요!','빨간 벽돌 건물에서 친구들과 함께 공부해요.','지금 내가 서 있는 자리는 옛날에 어떤 모습이었을까요?'],'wave');
schoolPerson(7,48,'공놀이하는 학생',['저는 점심시간이 좋아요! 밥을 먹고 친구들과 놀 수 있거든요.','친구와 공을 주고받으며 놀고 있어요.','옛날 아이들도 친구들과 노는 걸 좋아했을까요?'],'play');
schoolPerson(11,51,'친구와 노는 학생',['내가 공을 보낼게. 준비됐지?','우리 같이 놀자! 친구와 함께하면 더 재미있어.'],'play');
schoolPerson(-25,73,'놀이기구 옆 학생',['친구 차례가 끝나면 철봉에 매달려 볼 거예요.','옛날에도 이렇게 생긴 놀이기구가 있었을까요?'],'wave');
schoolPerson(27,21,'교실로 가는 학생',['친구야, 이제 교실로 돌아가자!','하늘색과 남색 활동복을 입으면 움직이기 편해요.'],'walk');
const blueFront=parang.point(0,0,12);makePerson('now',blueFront[0],blueFront[2],'건물 앞 학생',['파란 외벽과 주황색 테두리가 보이나요?','저쪽 벽에는 커다란 고래 그림도 있어요.'],'student','wave',schoolAngle+90);
const ballPoint=school.point(9,0,50);const ballRoot=new pc.Entity('ball');now.addChild(ballRoot);primitive(ballRoot,'sphere',white,0,.2,0,.4,.4,.4);ballRoot.setPosition(ballPoint[0],0,ballPoint[2]);
// Playground: a pupil hanging from the horizontal bar and another at the top of the jungle gym.
const barKid=schoolPerson(-28,70.25,'철봉에 매달린 학생',['철봉에 매달려서 버티기를 하고 있어요. 벌써 10초나 버텼어요!','팔에 힘을 주고 몸을 끌어 올리면 턱걸이가 돼요.','다음은 기다리던 친구 차례예요. 친구야, 너도 해 봐!'],'custom');barKid.custom=true;
const gymKid=schoolPerson(25.25,71.3,'정글짐에 올라간 학생',['정글짐 꼭대기까지 올라왔어! 저 멀리 대학교 운동장이 보여.','손과 발로 쇠막대를 꼭 잡고 한 칸씩 올라가요.','내려갈 때도 천천히, 조심조심!'],'custom');gymKid.custom=true;
function animateSchoolKids(t){if(era!=='now')return;const up=Math.max(0,Math.sin(t*1.4));barKid.entity.setPosition(barKid.x,.38+up*.2,barKid.z);barKid.arms.forEach((a,i)=>a.setLocalEulerAngles(-178+up*38,0,i?-6:6));barKid.legs.forEach((l,i)=>l.setLocalEulerAngles(28+Math.sin(t*1.4+i)*8,0,0));
 gymKid.entity.setPosition(gymKid.x,1.7,gymKid.z);gymKid.arms[0].setLocalEulerAngles(-160,0,8);gymKid.arms[1].setLocalEulerAngles(0,0,125+Math.sin(t*3)*14);gymKid.legs[0].setLocalEulerAngles(-18,0,-6);gymKid.legs[1].setLocalEulerAngles(12,0,6)}
// Additional figures bring the wider campus into scale without crowding the school.
const traineePoint=mapPoint(570,515);const trainees=[];for(let i=0;i<2;i++){const t=makePerson('now',traineePoint[0]+i*2.4,traineePoint[2]+i*.7,'교생선생님 '+(i+1),i===0?['곧 교생실습을 나가게 되어 정말 설레요!','아이들과 만나 함께 수업할 날을 기다리고 있어요.']:['저도 곧 교생실습을 가요. 떨리지만 무척 설레요!','어떤 수업을 하면 좋을지 친구와 이야기하고 있어요.'],'trainee','wave',i?220:40);primitive(t.group,'box',bluePanel,.28,.78,-.17,.25,.34,.07);trainees.push(t)}
makePerson('old',-345,-100,'논에서 일하는 농부',['벼가 잘 자라도록 논을 돌보고 있소.','괭이로 흙을 고르고 잡풀도 뽑아야 하오.','비가 알맞게 내려야 농사가 잘되니 하늘을 자주 살핀다오.'],'farmer','farm',25);
makePerson('old',-326,258,'물을 나르는 마을 사람',['집에서 쓸 물을 길어 가는 길이에요.','무거운 물동이를 옮기려면 천천히 걸어야 해요.','이 물로 밥도 짓고 몸도 씻으려고 해요.'],'water','walk',-35);
makePerson('old',-372,220,'초가집 앞 마을 사람',['볏짚을 엮어 지붕을 손보고 있소.','비가 새지 않도록 지붕을 잘 덮어야 한다오.','일손이 모자랄 때는 이웃과 서로 도와 일을 하지.'],'farmer','wave',40);
makePerson('old',-293,241,'마을에서 노는 아이',['친구야, 작은 돌을 모아서 같이 놀자!','심심할 때는 친구들과 마당에서 놀아.','너희는 어떤 놀이를 하니?'],'child','play',65);
makePerson('old',-290,244,'친구를 기다리는 아이',['친구가 오면 함께 놀려고 기다리고 있어.','어른들이 일하시는 논에는 조심해서 다녀야 해.'],'child','wave',-80);
const marshPerson=makePerson('old',-43,72,'뻘에서 만난 사람',['바짓단을 걷고 뻘에 들어왔어요. 발밑이 푹푹 빠지네요.','저기 물가에 황새가 천천히 걷고 있어요.'],'wader','wade',0);marshPerson.entity.setPosition(-43,-.1,72);ellipsoid(old,mud,-43,.24,72,2.4,.12,1.9,24,8);for(let k=0;k<16;k++){let a=k*Math.PI*2/16;box(old,water,-43+Math.cos(a)*1.1,.365,72+Math.sin(a)*.8,.3,.018,.05,a*180/Math.PI)}
// Well, jars, tools and stacked straw are visible beside the village conversation stops.
for(let k=0;k<14;k++){let a=k/14*Math.PI*2;box(old,stone,-334+Math.cos(a)*1.25,.5,255+Math.sin(a)*1.25,.53,1,.53)}ellipsoid(old,dark,-334,.53,255,1,.04,1);box(old,wood,-335.5,1.8,255,.15,3.6,.15);box(old,wood,-332.5,1.8,255,.15,3.6,.15);box(old,wood,-334,3.5,255,3.2,.14,.14);
for(let i=0;i<5;i++)ellipsoid(old,mud,-378+i*.8,.5,226,.36,.55,.36);for(let i=0;i<12;i++)box(old,wood,-301+i*.19,.06,241,.13,.12,.18);ellipsoid(old,thatch,-386,1.9,215,2.3,2.1,2.3);

// Magpies inhabit the green lawn in the present-day school compound only.
const magpies=[];const magpieBlue=mat('magpieBlue','#173b4b',42);
for(let i=0;i<10;i++){const lp=[[-13,28],[-10,30],[5,23],[18,32],[20,28]][i%5],wp=school.point(lp[0],0,lp[1]);const bird=new pc.Entity('magpie-'+i);(i<5?now:old).addChild(bird);bird.setPosition(wp[0],.48,wp[2]);bird.setEulerAngles(0,i*71+15,0);const body=new pc.Entity('magpieBody');bird.addChild(body);
primitive(body,'sphere',black,0,.35,0,.29,.38,.47);primitive(body,'sphere',white,0,.28,-.04,.25,.27,.32);primitive(body,'sphere',black,0,.61,-.22,.24,.24,.26);primitive(body,'box',dark,0,.59,-.4,.07,.055,.21);
for(let side of [-1,1]){primitive(body,'sphere',magpieBlue,side*.135,.39,.055,.11,.3,.36);primitive(body,'sphere',white,side*.16,.46,-.04,.08,.17,.18);primitive(body,'cylinder',dark,side*.073,.09,0,.025,.22,.025);primitive(body,'box',dark,side*.073,0,-.035,.045,.022,.15);primitive(body,'sphere',white,side*.108,.64,-.25,.018,.018,.018)}
const tail=primitive(body,'box',magpieBlue,0,.26,.43,.17,.05,.61);tail.setLocalEulerAngles(-14,0,0);magpies.push({entity:bird,body,x:wp[0],z:wp[2],phase:i*1.6,era:i<5?'now':'old'})}
function animateMagpies(t){const cam=camera.getPosition();for(let b of magpies){if(b.era!==era)continue;const far=Math.abs(b.x-cam.x)+Math.abs(b.z-cam.z)>260;if(far)continue;const v=t*.8+b.phase,hop=Math.max(0,Math.sin(v*4))*.095;b.entity.setPosition(b.x+Math.sin(v)*.5,(b.era==='old'?.23:.48)+hop,b.z+Math.cos(v)*.35);b.body.setLocalEulerAngles(Math.sin(v*2)> .65?24:0,0,0)}}

// Comic-style speech bubbles float above people when the viewer is close, like the textbook illustrations.
const bubbles=[];function bubble(target,text,dy=2.35,opts={}){const el=document.createElement('button');el.className='bubble'+(opts.hot?' hot':'');el.textContent=text;$('labels').append(el);const b={el,target,era:target.era,dy,max:opts.max||55,sx:opts.sx||0,prio:opts.prio||0,person:target.talk?target:null};if(b.person){el.onclick=()=>openSpeech(b.person,opts.line||0);el.setAttribute('aria-label',target.name+' 이야기 듣기')}bubbles.push(b);return b}
// Two magpies on the future school site talk about a dream (past era).
const magpieTalk=[['꿈꾸는 까치','나, 몇백 년 후에 여기가 초등학교가 되는 꿈을 꿨어.'],['옆에 있던 까치','엉뚱한 소리 하지 마!']];
const magpieSpeakers=[5,6].map((idx,k)=>{const b=magpies[idx];const pin=document.createElement('button');pin.className='personPin';pin.textContent='⋯';pin.setAttribute('aria-label',magpieTalk[k][0]+' 이야기 듣기');$('labels').append(pin);const sp={entity:b.entity,group:b.body,legs:[],arms:[],pin,name:magpieTalk[k][0],talk:magpieTalk,era:'old',x:b.x,z:b.z,activity:'bird',angle:0,height:.55,phase:0,pos:new pc.Vec3(),line:k,custom:true,bird:true,viewDist:7};people.push(sp);pin.onclick=()=>openSpeech(sp,k);return sp});
// The two old-era magpies stand a little apart and face each other while they talk.
magpies[5].x=magpies[6].x+1.6;magpies[5].z=magpies[6].z+.4;magpies[5].entity.setEulerAngles(0,Math.atan2(1.6,.4)*180/Math.PI,0);magpies[6].entity.setEulerAngles(0,Math.atan2(-1.6,-.4)*180/Math.PI,0);magpieSpeakers.forEach(sp=>{sp.x=magpies[sp.line?6:5].x;sp.z=magpies[sp.line?6:5].z});bubble(magpieSpeakers[0],'나, 몇백 년 후에 여기가 초등학교가 되는 꿈을 꿨어.',1.1,{hot:true,max:45,sx:-100,prio:2});bubble(magpieSpeakers[1],'엉뚱한 소리 하지 마!',1.1,{max:45,line:1,sx:100,prio:2});bubble(barKid,'철봉 매달리기 10초째!',2.45,{hot:true,max:40});bubble(gymKid,'정글짐 꼭대기에 올라왔어!',2.1,{hot:true,max:40});bubble(people[3],'친구 다음은 내 차례!',2.05,{max:40});
// Both eras share the well's map location. Its surroundings and construction change over time.
const wellPoint=mapPoint(...mapAnchors.well),wellX=wellPoint[0],wellZ=wellPoint[2],wellStone=mat('wellStone','#a1a6a5',12),pavingStone=mat('wellPaving','#596461',6),wellTimber=mat('wellTimber','#986237',10),roofTile=mat('roofTile','#52616a',18),plaster=mat('wellPlaster','#e4e6df'),buildingBeige=mat('buildingBeige','#cdbf9e');
function ring(parent,x,z,r,height,modern){for(let row=0;row<4;row++)for(let j=0;j<18;j++){const a=(j+(row%2)*.5)/18*Math.PI*2;box(parent,modern?wellStone:stoneDark,x+Math.sin(a)*r,(row+.5)*height/4,z+Math.cos(a)*r,.36,height/4-.013,.27,a*180/Math.PI)}}
// Current enclosure: irregular stone pavement, low white walls, planting and a covered stone well.
box(now,pavingStone,wellX,.07,wellZ,7,.14,7.5);for(let i=0;i<50;i++){let x=wellX+rand(-3.3,3.3),z=wellZ+rand(-3.4,3.4);segment(now,wellStone,[x,z],[x+rand(.2,.7),z+rand(.2,.6)],.015,.16)}
box(now,plaster,wellX-3.3,.65,wellZ,.2,1.3,7);box(now,plaster,wellX+3.3,.65,wellZ,.2,1.3,7);box(now,plaster,wellX,.65,wellZ-3.5,6.8,1.3,.2);
for(let i=0;i<12;i++)ellipsoid(now,leaf,wellX-3+rand(-.1,.1),1.3,wellZ-3+i*.55,.35,.45,.36);for(let i=0;i<12;i++)ellipsoid(now,leaf2,wellX+3,1.3,wellZ-3+i*.55,.36,.45,.36);for(let i=0;i<13;i++)ellipsoid(now,leaf,wellX-3+i*.5,1.2,wellZ-3.25,.36,.42,.4);
ring(now,wellX,wellZ,1.05,1.12,true);ellipsoid(now,wellTimber,wellX,1.17,wellZ,1.22,.08,1.22,32,4);for(let x of [-.8,-.4,0,.4,.8])box(now,wood,wellX+x,1.245,wellZ,.025,.018,Math.sqrt(1.3-x*x)*2);for(let x of [-.7,.7])box(now,wellTimber,wellX+x,1.31,wellZ,.13,.13,1.9);for(let x of [-.45,.45])ellipsoid(now,wellTimber,wellX+x,1.34,wellZ+.65,.15,.12,.045,10,4);
// Small round drain in front and the blue dipper shown in the reference.
ellipsoid(now,wellStone,wellX, .19,wellZ+1.9,.39,.16,.39,20,4);ellipsoid(now,dark,wellX,.3,wellZ+1.9,.24,.025,.24,20,4);ellipsoid(now,bluePanel,wellX+.35,.19,wellZ+1.95,.13,.07,.13);box(now,bluePanel,wellX+.35,.13,wellZ+2.19,.045,.045,.4);
for(let x of [-2.1,2.1])for(let z of [-1.7,1.7]){box(now,wellStone,wellX+x,.15,wellZ+z,.48,.3,.48);box(now,wellTimber,wellX+x,1.9,wellZ+z,.3,3.5,.3)}
box(now,wellTimber,wellX,3.56,wellZ-1.7,4.6,.32,.32);box(now,wellTimber,wellX,3.56,wellZ+1.7,4.6,.32,.32);
// Gabled tiled pavilion; swept eaves and overlapping curved tile rows.
for(let side of [-1,1])for(let row=0;row<12;row++){let zz=side*(row+.5)*.2,yy=4.55-Math.abs(zz)*.38+Math.max(0,Math.abs(zz)-1.8)*.45;box(now,roofTile,wellX,yy,wellZ+zz,5.3,.16,.23);for(let xx=-2.5;xx<=2.5;xx+=.25)ellipsoid(now,roofTile,wellX+xx,yy+.1,wellZ+zz,.13,.075,.19,6,4)}for(let xx=-2.6;xx<=2.6;xx+=.24)ellipsoid(now,roofTile,wellX+xx,4.66,wellZ,.14,.17,.18,6,4);
// Adjacent beige housing and blue stairwell, kept clear of the well enclosure.
box(now,buildingBeige,wellX,7.5,wellZ-6.1,12,15,4);box(now,glass,wellX+1,7.5,wellZ-3.98,1.9,14,.18);for(let y=1;y<15;y+=2.5){box(now,stone,y%2?wellX:wellX, y,wellZ-3.83,12,.14,.17);for(let xx of [-3.6,4]){box(now,stone,wellX+xx,y+.8,wellZ-3.8,1.6,1.6,.1);box(now,glass,wellX+xx,y+.8,wellZ-3.69,1.35,1.35,.1)}}
const wellSign=frame(wellX,wellZ,0);sign(wellSign,'황새알 우물터',0,3.5,1.9,3,.3);
// Earlier stone-ring well, water, earth path and the people using it.
box(old,soil,wellX,.07,wellZ,9,.14,9);ring(old,wellX,wellZ,1.08,1.02,false);ellipsoid(old,dark,wellX,.17,wellZ,.95,.03,.95,24,4);ellipsoid(old,water,wellX,.19,wellZ,.88,.02,.88,24,4);
for(let j=0;j<16;j++){let a=j/16*Math.PI*2;ellipsoid(old,wellStone,wellX+Math.cos(a)*1.08,1.05,wellZ+Math.sin(a)*1.08,.25,.12,.22,8,4)}
for(let i=0;i<5;i++)ellipsoid(old,mud,wellX+2+i*.46,.43,wellZ-1.4,.21,.42,.22);for(let i=0;i<5;i++)tree(old,wellX-6+i*3,wellZ-7,rand(.45,.65));
// Three old-era homes leave a clear common yard and approach to the well.
const wellHuts=[{dx:-16,dz:-15,w:10,d:7},{dx:15,dz:-18,w:11,d:8},{dx:21,dz:9,w:9,d:7}];
for(const h of wellHuts){const x=wellX+h.dx,z=wellZ+h.dz;box(old,soil,x,.08,z, h.w+5,.16,h.d+5);hut(x,z,h.w,h.d);const door=[x,z+h.d/2+1],bend=[wellX+h.dx*.42,wellZ+8];segment(old,soil,door,bend,1.6,.12);segment(old,soil,bend,[wellX+3,wellZ+3.7],1.6,.12);for(let j=0;j<2;j++)ellipsoid(old,mud,x-h.w/2-1,.38,z+j*.7,.27,.38,.27,10,5)}
const drawingWater=makePerson('old',wellX+1.55,wellZ+.7,'우물에서 물을 긷는 사람',['여기는 대조리입니다. 마을 사람들이 이 우물에 물을 길으러 와요.','두레박을 내려 물을 담고, 줄을 잡아 천천히 끌어 올려요.','길어 온 물로 밥을 짓고 생활에 필요한 일을 해요.'],'water','draw',-70);
makePerson('now',wellX+1.8,wellZ+2.8,'우물을 찾은 학생',['여기가 옛 우물이 있던 곳이에요. 돌로 둥글게 쌓은 우물이 보이나요?','학교 밖 우리 동네에도 옛날 사람들의 생활을 떠올릴 수 있는 장소가 있어요.'],'student','wave',5);
const bucketRoot=new pc.Entity('wellBucket');old.addChild(bucketRoot);for(let xx of [-.18,.18])primitive(bucketRoot,'box',wood,xx,0,0,.05,.3,.4);for(let zz of [-.18,.18])primitive(bucketRoot,'box',wood,0,0,zz,.4,.3,.05);primitive(bucketRoot,'box',water,0,-.05,0,.32,.035,.32);const bucketRope=primitive(old,'cylinder',wood,wellX,1.1,wellZ,.026,1.6,.026);
// A white-and-black stork approaches the earlier well, inspired by the supplied illustration.
const wellStork=new pc.Entity('wellStork');old.addChild(wellStork);primitive(wellStork,'sphere',white,0,1.3,0,.52,.6,.82);primitive(wellStork,'sphere',black,.22,1.28,.1,.17,.48,.73);primitive(wellStork,'capsule',white,0,1.88,-.27,.16,.83,.18);primitive(wellStork,'sphere',white,0,2.26,-.3,.24,.24,.25);primitive(wellStork,'box',black,0,2.23,-.63,.06,.055,.55);for(let x of [-.12,.12])primitive(wellStork,'cylinder',red,x,.6,0,.045,1.13,.045);wellStork.setPosition(wellX-2.3,.1,wellZ+2);
// A later stop on the time journey: embankment work beside Dongnaecheon.
// The embankment follows the south-west bank of the relocated Oncheoncheon channel.
const dykeSeg=[riverRoute[1],riverRoute[2]],dykeT=(()=>{const dx=dykeSeg[1][0]-dykeSeg[0][0],dz=dykeSeg[1][1]-dykeSeg[0][1],l=Math.hypot(dx,dz);return[dx/l,dz/l]})(),dykeN=dykeT[1]>0?[-dykeT[1],dykeT[0]]:[dykeT[1],-dykeT[0]];
const dykeMid=[(dykeSeg[0][0]+dykeSeg[1][0])/2+dykeN[0]*22,(dykeSeg[0][1]+dykeSeg[1][1])/2+dykeN[1]*22],dykeX=dykeMid[0],dykeZ=dykeMid[1],dykeAngle=Math.atan2(dykeT[0],dykeT[1])*180/Math.PI,dykeFace=Math.atan2(dykeN[0],dykeN[1])*180/Math.PI;
for(let i=1;i<riverRoute.length;i++)segment(old,water,riverRoute[i-1],riverRoute[i],34,.16);
for(let i=0;i<20;i++){const sd=-65+i*7,x=dykeX+dykeT[0]*sd,z=dykeZ+dykeT[1]*sd;box(old,soil,x,1.1,z,7,2.2,7.3,dykeAngle);box(old,soil,x,2.25,z,3.8,.2,7.3,dykeAngle);for(let k=0;k<4;k++)ellipsoid(old,stoneDark,x-dykeN[0]*3+dykeT[0]*(k*1.4-2),.45+k*.25,z-dykeN[1]*3+dykeT[1]*(k*1.4-2),.55,.42,.55,8,4)}
for(let i=0;i<7;i++)ellipsoid(old,soil,dykeX+dykeN[0]*7+dykeT[0]*(8+i*.75),.45,dykeZ+dykeN[1]*7+dykeT[1]*(8+i*.75),.9,.6,1);
const dykeWorkers=[];for(let i=0;i<3;i++){const worker=makePerson('old',dykeX+dykeT[0]*i*3.3,dykeZ+dykeT[1]*i*3.3,'둑을 쌓는 마을 사람 '+(i+1),i===0?['동래천에 둑을 쌓고 있어요. 물이 자주 넘쳐서 살림과 농사가 힘들었어요.','둑을 쌓아서 늪처럼 축축한 땅에 물이 덜 넘치게 하고, 농사짓기 좋은 땅으로 바꾸려고 해요.','흙을 나르고 단단하게 다지려면 여러 사람의 힘이 필요해요.']:['이쪽으로 흙을 더 날라 주세요! 흙과 돌을 모아 둑을 높여야 해요.','우리가 함께 만든 둑이 마을과 들을 지켜 주면 좋겠어요.'],'farmer','farm',dykeFace);worker.entity.setPosition(worker.x,2.3,worker.z);dykeWorkers.push(worker);primitive(worker.group,'box',wood,.15,1.08,.29,.45,.55,.25)}
function worldLabel(text,x,z,eraKey,y=3){if(eraKey==='now')return;let el=document.createElement('div');el.className='label';el.textContent=text;$('labels').append(el);labels.push({el,pos:new pc.Vec3(x,y,z),era:eraKey})}
worldLabel('우물가',wellX,wellZ,'old',3);worldLabel('둑 쌓는 곳',dykeX,dykeZ,'old',5);
function animateWell(t){if(era!=='old')return;const lift=(Math.sin(t*.85)+1)*.6;bucketRoot.setPosition(wellX+.1,.3+lift,wellZ+.1);bucketRope.setLocalPosition(wellX+.1,1.15+lift*.5,wellZ+.1);bucketRope.setLocalScale(.026,Math.max(.1,1.7-lift),.026);drawingWater.arms[0].setLocalEulerAngles(-45-Math.sin(t*.85)*23,0,-12);drawingWater.arms[1].setLocalEulerAngles(-45-Math.sin(t*.85)*23,0,12);wellStork.setPosition(wellX-2.3+Math.sin(t*.23)*.5,.1,wellZ+2+Math.cos(t*.23)*.4)}

// Photograph-guided additions to the existing school volumes.
function wallText(f,text,x,y,z,w,h,color='#214c76',bg=null){
 if(!/^(어린이|보호구역|20|30|카페|문구|GS25|STARBUCKS|COFFEE|안내|35 송죽관|까 치 관|부산지방검찰청|부산지방법원|부산교육대학교)$/.test(text))return;
 const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,c.width,c.height)}g.fillStyle=color;g.font='bold 70px "Malgun Gothic", "Noto Sans CJK KR", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,512,64,980);
 const rgba=g.getImageData(0,0,c.width,c.height).data,t=new pc.Texture(device,{anisotropy:ANISO,width:c.width,height:c.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false});const dest=t.lock(),stride=c.width*4;for(let row=0;row<c.height;row++)dest.set(rgba.subarray((c.height-1-row)*stride,(c.height-row)*stride),row*stride);t.unlock();
 const m=mat('lettering'+Object.keys(mats).length,'#ffffff',8);m.diffuseMap=t;m.opacityMap=t;m.opacityMapChannel='a';m.alphaTest=.2;m.cull=pc.CULLFACE_BACK;m.update();f.quad(m,[[x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z]],[0,0,1,0,1,1,0,1]);
}

function roofDetail(f,w,d,h){
 for(let s of [-1,1]){f.box(stone,0,h+.42,s*(d/2-.14),w,.65,.28);f.box(stone,s*(w/2-.14),h+.42,0,.28,.65,d)}
 f.box(roofMembrane,0,h+.13,0,w-.6,.13,d-.6);
 for(let x=-w*.35;x<w*.38;x+=5.5){f.box(rooftopMetal,x,h+.73,-d*.16,2.3,1.1,1.65);f.box(dark,x,h+1.29,-d*.16,1.6,.04,1.1);for(let j=-3;j<=3;j++)f.box(rooftopMetal,x+j*.23,h+1.32,-d*.16,.07,.035,1.1)}
 f.box(stone,w*.35,h+1.65,0,4.4,3.1,3.8);f.box(roofDark,w*.35,h+3.24,0,4.7,.2,4.1);
 for(let x=-w/2+1;x<w/2;x+=12)for(let s of [-1,1]){f.box(metal,x,h*.5,s*(d/2+.3),.12,h,.12)}
}
roofDetail(school,87,12,18.8);roofDetail(gaenari,39,13,14.6);roofDetail(parang,44,12,10.35);
// Parangsae's central tower remains above its surrounding lower roof.
parang.box(roofMembrane,-3,18.85,0,12.5,.16,10.6);for(let x of [-9.5,3.5])parang.box(white,x,19.1,0,.25,.55,11);
for(let i=0;i<30;i++)parang.box(roofDark,-21.5+i*1.45,8.3,6.32,.045,4.1,.04);
wallText(kkachi,'까 치 관',2,7.22,20.41,9.3,1.05);wallText(parang,'부산교육대학교',-3,17.5,6.52,10,.65);wallText(muralEnd,'개나리관',0,14,20.3,9,.67);wallText(school,'부산교육대학교부설초등학교',-13,17.72,6.42,29,.72);
// Brick joints and sill projections are modelled in addition to surface textures.
for(let xx=-40;xx<41;xx+=4.6)for(let f=0;f<4;f++)for(let side of [-1,1]){let y=2.7+f*4.45;school.box(stone,xx,y-1.39,side*6.57,4,.16,.6)}
for(let xx of [-43.3,43.3]){school.box(stone,xx,9.2,0,.23,18.4,12.15);for(let y=2.7;y<18;y+=4.45)for(let zz of [-3,1.3]){school.box(stone,xx+(xx>0?.14:-.14),y,zz,.24,2.7,2.5);school.box(windowReflect,xx+(xx>0?.28:-.28),y,zz,.08,2.4,2.2)}}
// Ground-side contact shadows tie the model to its setting.
for(const [f,w,d,h]of [[school,97,22,0],[gaenari,48,22,0],[parang,53,22,0],[songjuk,55,22,0],[kkachi,34,48,0]]){let p=f.point(0,0,0),q=f.point(1,0,0);contact(p[0],p[2],w,d,Math.atan2(-(q[2]-p[2]),q[0]-p[0])*180/Math.PI,.295)}
// Context geometry: positions are approximate relative to the supplied aerial map, not surveyed GIS coordinates.
const railStationPos=NM(1440,982),metroPos=NM(1470,600),contextSites={hill:{x:250,z:420},neighbourhood:{x:325,z:372},station:{x:(railStationPos[0]+metroPos[0])/2,z:(railStationPos[1]+metroPos[1])/2},stream:{x:NM(1830,170)[0],z:NM(1830,170)[1]},civic:{x:-195,z:665},housing:{x:210,z:660},industrial:{x:-307,z:-143}};
const hillside=surface('hillside','#5c754b','grass',18),pathEarth=surface('pathEarth','#b3a183','soil',9),blueRoof=surface('blueRoof','#639dc1','roof',4),tileGray=surface('tileGray','#626b65','roof',3),villageCream=surface('villageCream','#c8c8b7','stone',4),streamWater=mat('streamWater','#5c9998',70),embankment=surface('embankment','#9b9e8d','stone',8),cycleRed=mat('cycleRed','#aa7260'),apartmentWhite=mat('apartmentWhite','#dddcd4'),apartmentGray=mat('apartmentGray','#8c999a'),apartmentBrown=mat('apartmentBrown','#aa9278');
// Wooded hill east of the school (거제1동 숲), elongated along the street that bounds it, as on the satellite capture.
const HILL={x:250,z:420,ux:-.669,uz:.743,ra:132,rb:84};
function hillLocal(x,z){const dx=x-HILL.x,dz=z-HILL.z;return[(dx*HILL.ux+dz*HILL.uz)/HILL.ra,(dx*HILL.uz-dz*HILL.ux)/HILL.rb]}
function hillEdge(x,z){const [a,b]=hillLocal(x,z);return Math.max(0,1-(a*a+b*b))}
function hillHeight(x,z){const e=hillEdge(x,z);if(e<=0)return 0;const [a,b]=hillLocal(x,z);return e*e*(3-2*e)*(24+5*Math.sin(a*3.1+1)*Math.cos(b*2.3))}
function estateArea(x,z){const a=32*Math.PI/180,dx=x-210,dz=z-660,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);return Math.abs(lx)<96&&Math.abs(lz)<104}
// Apartment towers east of the station (거제한양·벽산·메르디앙 blocks), positioned from the capture.
const eastTowerSites=[[1540,215,-28,15],[1530,315,-28,15],[1690,262,-28,14],[1705,360,-28,15],[1770,555,28,20],[1845,610,28,22],[1700,622,28,18],[1655,690,0,24],[1575,935,28,18],[1700,950,28,20],[1800,985,28,22],[1690,1062,28,20],[1810,1100,28,21],[1905,1035,28,23],[1905,720,28,24],[1950,860,28,22],[1570,1085,0,14]].map(([u,v,a,l])=>{const p=NM(u,v);return{x:p[0],z:p[1],a,l}});
function eastTowerArea(x,z){return eastTowerSites.some(t=>Math.hypot(x-t.x,z-t.z)<24)}
const hp=[],hn=[],hu=[],hi=[],N=56;for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){let x=HILL.x-150+i*300/N,z=HILL.z-150+j*300/N,y=hillHeight(x,z),dx=(hillHeight(x+.4,z)-hillHeight(x-.4,z))/.8,dz=(hillHeight(x,z+.4)-hillHeight(x,z-.4))/.8,l=Math.hypot(dx,1,dz);hp.push(x,y+(y>0?.02:-.3),z);hn.push(-dx/l,1/l,-dz/l);hu.push(x/18,z/18)}for(let j=0;j<N;j++)for(let i=0;i<N;i++){let a=j*(N+1)+i,b=a+N+1;hi.push(a,b,a+1,a+1,b,b+1)}geom(shared,hillside,hp,hn,hu,hi);
function elevatedFrame(x,z,angle,y){const f=frame(x,z,angle);return {point:(a,b,c)=>f.point(a,b+y,c),box:(m,a,b,c,w,h,d)=>f.box(m,a,b+y,c,w,h,d),sphere:(m,a,b,c,w,h,d)=>f.sphere(m,a,b+y,c,w,h,d),quad:(m,ps,uv)=>f.quad(m,ps.map(([a,b,c])=>[a,b+y,c]),uv)}}
{let hs=4242;const hr=()=>{hs=(1664525*hs+1013904223)>>>0;return hs/4294967296};for(let i=0,n=0;i<900&&n<170;i++){const x=HILL.x+(hr()*2-1)*140,z=HILL.z+(hr()*2-1)*140;if(hillEdge(x,z)<.06)continue;n++;const y=hillHeight(x,z)-.3,sc=.8+hr()*.6;box(shared,wood,x,y+2.1*sc,z,.28*sc,4.2*sc,.28*sc);for(let k=0;k<3;k++)ellipsoid(shared,(k+n)%2?leaf:leaf2,x+Math.cos(k*2.1+n)*1.2*sc,y+(4.4+k*.5)*sc,z+Math.sin(k*2.1+n)*1.3*sc,2.5*sc,2.6*sc,2.5*sc,7,5)}}
worldLabel('숲이 우거진 언덕',HILL.x,HILL.z,'now',hillHeight(HILL.x,HILL.z)+10);worldLabel('언덕',HILL.x,HILL.z,'old',hillHeight(HILL.x,HILL.z)+10);
// Industrial yard: low broad blue-roofed production sheds, loading aprons and silos. No signs or labels.
const plant=frame(contextSites.industrial.x,contextSites.industrial.z,-9);plant.box(asphalt,0,.12,0,142,.24,133);for(let x of [-33,28]){plant.box(urbanPlaster,x,5,-9,53,10,71);for(let q of [-1,1])for(let k=0;k<14;k++){let xx=q*(k+.5)*27/14;plant.box(blueRoof,x+xx,11.7-Math.abs(xx)*.065,-9,2.1,.2,74)}for(let k=-28;k<30;k+=8){plant.box(windowReflect,x+k*.65,7.1,26.65,4.1,1.5,.12)}plant.box(metal,x,2.5,26.68,16,5,.14)}
plant.box(urbanGray,0,5,-52,122,10,13);for(let x=-54;x<60;x+=7)plant.box(windowReflect,x,6,-45.35,3.4,2,.1);
for(let i=0;i<5;i++){const x=-46+i*8;tube(plant,rooftopMetal,[x,.3,48],[x,9,48],2.6,16);plant.sphere(rooftopMetal,x,9,48,2.6,.65,2.6)}
for(let q of [-1,1]){plant.box(stone,q*71,1.1,0,.5,2.2,133);plant.box(stone,0,1.1,q*66,142,2.2,.5)}plant.box(asphalt,48,1.12,66.1,20,2.24,1); // gate opening colour
// Residential towers following the eleven-block cluster in the supplied map. No logos or building names.
const estate=frame(contextSites.housing.x,contextSites.housing.z,32);estate.box(pavers,0,.1,0,178,.2,194);
const towerSites=[[-54,62,24],[-15,67,27],[28,70,24],[58,27,25],[20,17,29],[-27,21,26],[-64,-7,23],[-18,-28,26],[26,-47,25],[-55,-56,23],[1,-79,20]];
function apartment(f,x,z,levels){let h=levels*2.8;f.box(apartmentWhite,x,h/2,z,23,h,14);f.box(apartmentWhite,x,h/2,z-7,12,h,9);f.box(apartmentBrown,x+3,h/2,z+7.08,4.8,h,.2);f.box(apartmentGray,x-10,h/2,z+7.1,2.1,h,.2);for(let floor=0;floor<levels;floor++){let y=1.5+floor*2.8;for(let xx of [-7.5,-3,7.6])for(let q of [-1,1]){f.box(windowReflect,x+xx,y,z+q*7.16,2.9,1.9,.08);f.box(apartmentWhite,x+xx,y-.98,z+q*7.29,3.35,.12,.4)}for(let zz of [-4,1,5])for(let q of [-1,1])f.box(windowReflect,x+q*11.59,y,z+zz,.1,1.7,2.1)}f.box(apartmentGray,x,h+.24,z,23.7,.48,14.6);f.box(apartmentWhite,x+2,h+2,z-2,8,4,7)}
for(let [x,z,h]of towerSites)apartment(estate,x,z,h);
for(const t of eastTowerSites){const f=frame(t.x,t.z,t.a);f.box(pavers,0,.12,0,34,.22,26);apartment(f,0,0,t.l);for(const q of [-1,1])f.sphere(leaf2,q*14,3,11,2.4,3,2.4)}
for(let i=0;i<32;i++){let x=-74+(i%8)*20,z=-85+Math.floor(i/8)*52;estate.sphere(leaf2,x,3.3,z,2.8,3.2,2.7)}
// Courthouse at the right of the reference and prosecution office beside it.
const civic=frame(contextSites.civic.x,contextSites.civic.z,43),legalStone=surface('legalStone','#d1d0c7','stone',3);
civic.box(pavers,0,.12,30,144,.24,135);
civic.box(legalStone,0,28,0,104,56,28);civic.box(windowReflect,0,31,14.2,20,60,.25);
for(let x of [-29,29]){civic.box(legalStone,x,31.5,0,37,63,30);civic.box(white,x,64,0,40,1.4,32)}
for(let row=0;row<16;row++)for(let x=-49;x<=49;x+=3.6){if(Math.abs(x)<10)continue;const y=3.2+row*3.5;civic.box(windowReflect,x,y,15.12,1.55,2.25,.12);civic.box(white,x-.95,y,15.25,.12,2.55,.15)}
for(let x=-9;x<10;x+=1.7)civic.box(metal,x,31,14.4,.09,60,.08);for(let y=2;y<62;y+=1.8)civic.box(metal,0,y,14.4,20,.075,.08);
civic.box(legalStone,0,6,24,34,12,18);for(let y=2;y<12;y+=3)for(let x=-14;x<15;x+=3)civic.box(windowReflect,x,y,33.1,2,2,.12);
civic.box(stone,0,3.5,36,20,.65,7);for(let x of [-8,8])tube(civic,stone,[x,.3,38],[x,3.2,38],.4);for(let k=0;k<7;k++)civic.box(stone,0,.12+k*.13,41-k*.6,24,.24+k*.26,.7);
wallText(civic,'부산지방법원',-28,61.3,15.3,29,1.6,'#425c68');worldLabel('부산지방법원',contextSites.civic.x,contextSites.civic.z,'now',68);
const prosecutorPoint=civic.point(-139,0,0),prosecutor=frame(prosecutorPoint[0],prosecutorPoint[2],43);
prosecutor.box(pavers,0,.12,27,142,.24,121);prosecutor.box(legalStone,0,24,0,122,48,30);
for(let row=0;row<12;row++)for(let x=-56;x<=56;x+=3.1)prosecutor.box(windowReflect,x,5+row*3.35,15.1,1.4,2.05,.13);
prosecutor.box(dark,14,49,0,89,4,27);prosecutor.box(legalStone,-46,49,0,30,6,30);prosecutor.box(legalStone,13,51.3,0,96,1.4,33);
for(let x=-28;x<59;x+=10)tube(prosecutor,stone,[x,47,14.5],[x,51,14.5],.23);
wallText(prosecutor,'부산지방검찰청',-44,49.7,15.2,27,1.7,'#435366');
prosecutor.box(stone,15,7,22,28,1.1,14);for(let x of [3,27])tube(prosecutor,stone,[x,.3,27],[x,6.5,27],.5);
for(let k=0;k<10;k++)prosecutor.box(stone,0,.1+k*.12,46-k*.65,52,.2+k*.24,.75);
for(const f of [civic,prosecutor])for(let x of [-51,51])for(let z of [30,48,65]){f.sphere(leaf,x,3,z,3.5,3,3);f.box(stone,x,.4,z,7,.8,7)}
tube(prosecutor,dark,[-3,.9,43],[0,8,43],.65,4);tube(prosecutor,dark,[0,8,43],[3,.9,43],.65,4);prosecutor.sphere(stoneDark,-4,1.1,46,2,.5,1.3);
const courtWorkerPoint=civic.point(3,0,44),courtWorker=makePerson('now',courtWorkerPoint[0],courtWorkerPoint[2],'법원에서 일하는 직원',['저는 부산지방법원에서 일해요. 찾아오신 분들에게 필요한 절차와 장소를 안내해요.','법원은 다툼이 생겼을 때 법에 따라 재판하는 곳이에요.','서로의 이야기를 듣고 자료를 꼼꼼하게 살펴보는 일이 중요해요.'],'clerk','wave',223);
primitive(courtWorker.group,'box',navy,0,1.04,0,.45,.53,.29);primitive(courtWorker.group,'box',white,0,1.21,-.16,.12,.19,.035);primitive(courtWorker.group,'box',bluePanel,0,1.13,-.185,.035,.19,.025);primitive(courtWorker.group,'box',brownCloth,-.3,.8,-.15,.24,.33,.07);
// East-side transport corridor: metro entrances and the elevated railway station.
// Elevated Donghae line: a continuous viaduct along the traced rail corridor with the station deck on it.
const railDir=(()=>{const a=NM(1200,1140),b=NM(1600,845);return Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI})(),railSteel=mat('railSteel','#7d8384',70);
const station=frame(railStationPos[0],railStationPos[1],railDir);
for(let x of [-11,11]){for(let z=-85;z<90;z+=19)station.box(stone,x,4.1,z,1.6,8.2,2)}
station.box(stone,0,8.8,0,27,.8,182);for(let x of [-12.1,-9.9,9.9,12.1])station.box(railSteel,x,9.3,0,.1,.13,180);
station.box(stone,0,9.4,0,12,.4,106);for(let z=-50;z<=50;z+=10)for(let x of [-4.7,4.7])station.box(metal,x,11,z,.14,3.4,.14);for(let i=0;i<24;i++){let xx=-7+(i+.5)*14/24;station.box(roofDark,xx,12.9+1.3*Math.sqrt(Math.max(0,1-(xx/7)**2)),0,.65,.18,113)}
for(let x of [-4.2,4.2])station.box(bluePanel,x,10.1,0,.1,.9,100);
station.box(urbanPlaster,22,3.3,31,15,6.6,26);station.box(windowReflect,22,4,44.1,13,4,.1);
for(let i=1;i<railRoute.length;i++){const a=railRoute[i-1],b=railRoute[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ang=Math.atan2(dx,dz)*180/Math.PI;for(let z=0;z<len;z+=24){const mid=[a[0]+dx*(z+12)/len,a[1]+dz*(z+12)/len];if(Math.hypot(mid[0]-railStationPos[0],mid[1]-railStationPos[1])<92)continue;const segLen=Math.min(24,len-z),f=frame(a[0]+dx*(z+segLen/2)/len,a[1]+dz*(z+segLen/2)/len,ang);f.box(stone,0,8.8,0,26,.9,segLen+.05);for(const q of [-1,1]){f.box(stone,q*12.8,9.7,0,.4,1,segLen);f.box(stone,q*7,4.2,-segLen/2+1,2.2,8.4,2.2)}for(let x of [-12.1,-9.9,9.9,12.1])f.box(railSteel,x-(x>0?1.1:-1.1)*0,9.3,0,.1,.13,segLen)}}
wallText(station,'교대역',22,5.7,44.24,10,1,'#ffffff','#28687e');
// Oncheoncheon channel, stepped banks, parallel walking/cycling paths and bridges.
const riverPts=riverRoute;
function riverStrip(a,b,width,m,y){let dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;const p=[[a[0]-nx*width/2,y,a[1]-nz*width/2],[b[0]-nx*width/2,y,b[1]-nz*width/2],[b[0]+nx*width/2,y,b[1]+nz*width/2],[a[0]+nx*width/2,y,a[1]+nz*width/2]];geom(now,m,p.flat(),[0,1,0,0,1,0,0,1,0,0,1,0],[0,0,0,len/16,width/16,len/16,width/16,0],[0,1,2,0,2,3])}
for(let i=1;i<riverPts.length;i++){let a=riverPts[i-1],b=riverPts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;riverStrip(a,b,70,embankment,.08);riverStrip(a,b,34,streamWater,.18);for(let side of [-1,1]){let offset=d=>[[a[0]+nx*d*side,a[1]+nz*d*side],[b[0]+nx*d*side,b[1]+nz*d*side]];riverStrip(...offset(24),7,pavers,.2);riverStrip(...offset(31),5,cycleRed,.21);const f=frame(0,0,0);tube(f,metal,[a[0]+nx*36*side,1.1,a[1]+nz*36*side],[b[0]+nx*36*side,1.1,b[1]+nz*36*side],.045);for(let k=0;k<len;k+=13){let t=k/len,x=a[0]+dx*t+nx*40*side,z=a[1]+dz*t+nz*40*side;tree(now,x,z,.6)}}}
for(let [x,z,angle]of [[1955,300,1900,360,2050,250],[1705,-10,0,0,0,0]].map(([u,v,u1,v1,u2,v2])=>{const p=NM(u,v);let d;if(u1){const a=NM(u1,v1),b=NM(u2,v2);d=[b[0]-a[0],b[1]-a[1]]}else{const a=riverRoute[0],b=riverRoute[2];d=[b[1]-a[1],-(b[0]-a[0])]}return[p[0],p[1],Math.atan2(-d[1],d[0])*180/Math.PI]})){const bridge=frame(x,z,angle);bridge.box(stone,0,3.3,0,105,1.4,14);bridge.box(asphalt,0,4.04,0,105,.12,11);for(let q of [-1,1]){bridge.box(curb,0,4.18,q*6.6,105,.3,1);tube(bridge,metal,[-52,5,q*6.6],[52,5,q*6.6],.055);for(let xx=-50;xx<=50;xx+=5)bridge.box(metal,xx,4.65,q*6.6,.075,.9,.075)}for(let xx of [-27,27])bridge.box(stone,xx,1.8,0,2.8,3.6,8);for(let q of [-1,1])for(let k=0;k<20;k++)bridge.box(asphalt,q*(53+k*2.6),3.95-k*.195,0,2.8,.15,11)}

// Broad connecting roads extend the viewing area to the south and east.


// Campus revision 3. Photo-guided proportions; coordinates remain illustrative.
const campusSand=surface('campusSand','#c9b18b','soil',14),campusSlate=surface('campusSlate','#6c7376','stone',4),paleBlueStone=surface('paleBlueStone','#b0c5c7','stone',3),roadYellow=mat('roadYellow','#e9bb3f'),chalk=mat('campusChalk','#ebe0c8'),sculptureWhite=surface('sculptureWhite','#e8e7df','stone',3),sculptureSeam=mat('sculptureSeam','#bbc0bc');
const athletic=frame(32,130,43);
function flatQuad(f,m,ps,y){const p=ps.map(([x,z])=>f.point(x,y,z));geom(now,m,p.flat(),p.flatMap(()=>[0,1,0]),[0,0,1,0,1,1,0,1],[0,2,1,0,3,2])}
function flatRing(f,m,x,z,rx,rz,width,y,steps=96){for(let k=0;k<steps;k++){const a=k*Math.PI*2/steps,b=(k+1)*Math.PI*2/steps;flatQuad(f,m,[[x+Math.cos(a)*rx,z+Math.sin(a)*rz],[x+Math.cos(b)*rx,z+Math.sin(b)*rz],[x+Math.cos(b)*(rx-width),z+Math.sin(b)*(rz-width)],[x+Math.cos(a)*(rx-width),z+Math.sin(a)*(rz-width)]],y)}}
function disk(f,m,x,z,rx,rz,y,steps=64){const pts=[];for(let k=0;k<steps;k++){const a=k*2*Math.PI/steps,p=f.point(x+Math.cos(a)*rx,y,z+Math.sin(a)*rz);pts.push([p[0],p[2]])}poly(now,m,pts,y)}
function railing(f,x1,z1,x2,z2,y=1.3){const len=Math.hypot(x2-x1,z2-z1);for(let k=0;k<=Math.ceil(len/2.4);k++){let t=k/Math.ceil(len/2.4);tube(f,metal,[x1+(x2-x1)*t,.45,z1+(z2-z1)*t],[x1+(x2-x1)*t,y,z1+(z2-z1)*t],.045)}for(let h of [y-.5,y-.25,y])tube(f,metal,[x1,h,z1],[x2,h,z2],.035)}
function bareTree(f,x,z,s=1){const wp=f.point(x,0,z);if(pathDistance(wp[0],wp[2],bambooRouteWorld)<6.5)return;tube(f,wood,[x,.35,z],[x+.15*s,6.9*s,z],.17*s,8);for(let j=0;j<7;j++){const a=j*2.399,yy=(3.4+j*.35)*s,xx=x+Math.cos(a)*2.8*s,zz=z+Math.sin(a)*2.8*s;tube(f,wood,[x,yy,z],[xx,yy+2.6*s,zz],.07*s);for(let q of [-1,1])tube(f,wood,[xx,yy+2*s,zz],[xx+q*.9*s,yy+3.2*s,zz+q*.8*s],.023*s)}for(let q of [-1,1])tube(f,wood,[x+q*1.05,.3,z+.4],[x,2.4*s,z],.045)}
function campusLamp(f,x,z){const lp=f.point(x+.3,5.65,z);lampPositions.push({x:lp[0],y:lp[1],z:lp[2]});tube(f,metal,[x,.3,z],[x,5.1,z],.085);tube(f,metal,[x,5.1,z],[x+.7,5.85,z],.08);f.box(dark,x+.3,5.9,z,.85,.12,.35);f.box(white,x+.3,5.81,z,.7,.025,.23)}
function bench(f,x,z){for(let q of [-1,1]){f.box(dark,x+q*.9,.55,z,.09,.8,.65);f.box(dark,x+q*.9,.98,z-.32,.08,1.1,.08)}for(let k=0;k<4;k++)f.box(wood,x,.93,z-.3+k*.18,2.4,.09,.14);for(let k=0;k<3;k++)f.box(wood,x,1.16+k*.18,z-.34,2.4,.13,.09)}
// One coordinate transform is shared by every traced campus feature.
const fieldTrace=[[389,257],[463,260],[508,284],[725,503],[780,563],[801,607],[789,660],[754,701],[708,726],[669,730],[624,713],[566,675],[425,517],[349,431],[331,372],[341,318]];
poly(now,campusSand,fieldTrace.map(([u,v])=>{const p=mapPoint(u,v);return[p[0],p[2]]}),.39);
// Sparse chalk markings reflect the open sand ground in the supplied views.
const fieldCentre=mapPoint(566,491),fieldFrame=frame(fieldCentre[0],fieldCentre[2],43);
for(let q of [-1,1]){fieldFrame.box(chalk,q*43,.418,0,.09,.02,163);fieldFrame.box(chalk,0,.418,q*81.5,86,.02,.09);for(let x of [-3.65,3.65])tube(fieldFrame,white,[x,.42,q*81.5],[x,2.86,q*81.5],.065);tube(fieldFrame,white,[-3.65,2.86,q*81.5],[3.65,2.86,q*81.5],.065);for(let x=-3.65;x<=3.66;x+=.45)tube(fieldFrame,white,[x,.45,q*83.3],[x,2.86,q*81.5],.012,5);for(let y=.65;y<2.8;y+=.4)tube(fieldFrame,white,[-3.65,y,q*(83.3-(y-.45)/2.41*1.8)],[3.65,y,q*(83.3-(y-.45)/2.41*1.8)],.012,5)}
fieldFrame.box(chalk,0,.42,0,86,.02,.08);flatRing(fieldFrame,chalk,0,0,8.7,8.7,.07,.425,64);
// Traced edge segments: short retaining walls, long stepped seating and a low southern rim.
const rim=fieldTrace.map(p=>mapPoint(...p));
for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];segment(now,stone,[a[0],a[2]],[b[0],b[2]],.6,.65)}
function seating(a,b,rows){const aa=mapPoint(...a),bb=mapPoint(...b),dx=bb[0]-aa[0],dz=bb[2]-aa[2],len=Math.hypot(dx,dz),f=frame((aa[0]+bb[0])/2,(aa[2]+bb[2])/2,Math.atan2(-dz,dx)*180/Math.PI);for(let row=0;row<rows;row++)f.box(row%2?stone:paversRed,0,.55+row*.22,-row*.85,len,.75+row*.44,.9);for(let xx=-len/2;xx<len/2;xx+=22){for(let row=0;row<rows;row++)f.box(stone,xx,.57+row*.22,-row*.85,2.1,.8+row*.44,.92)}}
seating([493,271],[618,397],6);seating([675,446],[769,542],6);seating([386,510],[535,655],4);
// The far-side dais sits alongside the long eastern edge, not on a field end.
const daisPos=mapPoint(671,390),dais=frame(daisPos[0],daisPos[2],-137);
dais.box(stone,0,1.05,0,14,2.1,7);for(let q of [-1,1])for(let k=0;k<7;k++)dais.box(stone,q*9,.15+k*.13,4-k*.62,4,.22+k*.26,.65);for(let q of [-1,1])for(let z of [-2.2,2.2])dais.box(white,q*5,3,z,.18,4,.18);dais.box(white,0,5.1,0,13,.2,7);
// The circular viewing terrace at the eastern curve is distinct from the small traffic island.
const terracePos=mapPoint(831,590),terrace=frame(terracePos[0],terracePos[2],0);
for(let k=0;k<5;k++)disk(terrace,stone,0,0,12-k*.75,12-k*.75,.42+k*.16);
flatRing(terrace,metal,0,0,12,12,.065,1.7,72);

// Museum moved behind the southeastern brick parking court; tall blank stone front and deep hall.
const museumPos=mapPoint(1001,759),museum=frame(museumPos[0],museumPos[2],-47);
museum.box(campusSlate,0,7.8,0,33,15.6,46);museum.box(stone,0,.55,0,34,1.1,47);
museum.box(roofDark,0,15.7,0,35,.45,48);
museum.box(stone,0,8.3,23.25,29,13.8,.38);museum.box(campusSlate,0,9.1,23.49,26,10.8,.16);
museum.box(windowReflect,0,3.4,23.6,23,4.8,.14);
for(let x=-11.4;x<12;x+=1.2)museum.box(metal,x,3.4,23.74,.085,4.9,.09);
museum.box(stone,0,5.9,23.7,24,.17,.27);museum.box(stone,0,14.7,23.6,30,.8,.55);
for(let q of [-1,1]){museum.box(roofDark,q*16.5,8,23.7,1.1,16,.8);for(let z=-21;z<21;z+=2.5)museum.box(metal,q*16.6,8,z,.09,15.2,.06)}
const parkingPos=mapPoint(877,807),museumParking=frame(parkingPos[0],parkingPos[2],43);
museumParking.box(paversRed,0,.16,0,69,.28,57);
for(let q of [-1,1])for(let x=-30;x<32;x+=3.3){museumParking.box(white,x,.315,q*20,.085,.02,5.1);if(Math.round(x*10)%3!==0)streetCar(museumParking,x+1.5,q*20,Math.abs(Math.round(x)))}
for(let q of [-1,1]){museumParking.box(pavers,q*36,.2,0,3,.4,60);for(let z=-27;z<29;z+=8){bareTree(museumParking,q*36,z,.9);museumParking.sphere(leaf2,q*37.5,.9,z,1.2,.7,1.2)}}
for(let k=0;k<6;k++)museum.box(stone,0,.1+k*.085,29-k*.65,24,.18+k*.17,.7);
for(let x of [-12,12]){tube(museum,metal,[x,1,29],[x,1.8,25],.05);for(let z of [27,31])museum.sphere(leaf,x,2.1,z,1.8,1.1,1.6)}

// Individually articulated university blocks: sill bands, recessed glazing, entry porticos and roof equipment.
const universityBuildings=[];
function universityBlock(name,u,v,w,d,h,angle,facade=urbanPlaster,wing=false){
 const f=frame(X(u),Z(v),angle);universityBuildings.push({name,x:X(u),z:Z(v),w,d,h,angle});
 f.box(pavers,0,.18,0,w+8,.36,d+10);f.box(facade,0,h/2+.35,0,w,h,d);f.box(stone,0,.75,0,w+.2,.7,d+.2);
 const floors=Math.round(h/3.7),fh=h/floors;
 for(let level=0;level<floors;level++){let y=.35+fh*(level+.55);for(let q of [-1,1]){f.box(stone,0,.4+(level+1)*fh,q*(d/2+.08),w,.2,.2);for(let xx=-w/2+2.2;xx<w/2-1;xx+=3.65){f.box(dark,xx,y,q*(d/2+.04),2.85,fh*.67,.09);f.box(windowReflect,xx,y,q*(d/2+.12),2.62,fh*.6,.08);for(let dx of [-.88,0,.88])f.box(metal,xx+dx,y,q*(d/2+.18),.065,fh*.62,.05);f.box(stone,xx,y-fh*.34,q*(d/2+.25),3,.13,.45)}}for(let q of [-1,1])for(let zz=-d/2+2.2;zz<d/2;zz+=3.7){f.box(windowReflect,q*(w/2+.1),y,zz,.1,fh*.6,2.4);f.box(stone,q*(w/2+.2),y,zz,.1,fh*.62,.08)}}
 f.box(windowReflect,0,h*.49,d/2+.27,6.2,h*.88,.24);for(let xx of [-3,-1.5,0,1.5,3])f.box(stone,xx,h*.49,d/2+.45,.12,h*.91,.15);
 f.box(stone,0,3.8,d/2+2.6,11,.42,5.8);for(let q of [-1,1])f.box(stone,q*4.3,1.95,d/2+4.1,.5,3.4,.5);
 for(let k=0;k<4;k++)f.box(stone,0,.15+k*.09,d/2+6.8-k*.65,12,.15+k*.18,.7);
 roofDetail(f,w,d,h+.35);if(wing){f.box(facade,-w*.38,h*.45,-d/2-6,w*.24,h*.9,12);f.box(roofMembrane,-w*.38,h*.9+.2,-d/2-6,w*.24+.2,.22,12.5);for(let y=2.5;y<h*.9;y+=3.7)for(let zz=-d/2-10;zz<-d/2;zz+=3)f.box(windowReflect,-w*.5-.1,y,zz,.12,2,1.8)}
 wallText(f,name,w*.22,h-1,d/2+.29,Math.min(15,w*.5),.8,'#344740');
 return f;
}
function mappedBlock(name,u,v,w,d,h,angle,facade=urbanPlaster,wing=false){const p=mapPoint(u,v);return universityBlock(name,619+p[0]/.85,460+p[2]/.85,w*.46,d*.46,h,angle,facade,wing)}
mappedBlock('과학관',231,126,174,58,16,43,urbanPlaster);
mappedBlock('평생교육관',132,231,105,53,12,43,urbanPlaster);
mappedBlock('교수연구관',338,22,117,72,19,43,urbanPlaster,true);
mappedBlock('실과관',454,104,115,83,14,43,urbanPlaster,true);
mappedBlock('미술관',606,168,169,80,14,-43,urbanPlaster,true);
mappedBlock('인문사회관',836,277,260,69,17,-43,urbanBrick);
mappedBlock('학생상담교육관',970,365,94,65,14,-43,urbanBrick);
const collegeMain=mappedBlock('본관',256,650,183,85,22,-43,urbanPlaster);
mappedBlock('학생복지관',133,495,152,88,17,-43,urbanPlaster,true);
mappedBlock('생활관',190,862,124,63,18,43,urbanPlaster);
mappedBlock('음악교육관',1166,865,119,67,15,43,urbanPlaster,true);

// Stone central pediment and projecting entrance columns visible in the new campus street photograph.
for(let x of [-5,5])collegeMain.box(stone,x,9,13.6,.7,17,.8);
for(let k=0;k<18;k++){let x=-8+(k+.5)*16/18;collegeMain.box(stone,x,23.1+(1-Math.abs(x)/8)*2.5,0,.94,.35,28)}
for(let x of [-16,-13,-10]){tube(collegeMain,metal,[x,.4,17],[x,7.7,17],.045);collegeMain.box(white,x+.55,7,17,1.1,.7,.025)}
// Two gymnasium masses, with ribbed arched roofs and clerestory glazing.
for(const [u,v,w,d]of [[72,609,45,48],[80,800,36,42]]){const pos=mapPoint(u,v),f=frame(pos[0],pos[2],-43);f.box(urbanPlaster,0,6,0,w,12,d);for(let k=0;k<40;k++){const x=-w/2+(k+.5)*w/40,y=12+4.4*Math.sqrt(Math.max(0,1-(x/(w/2))**2));f.box(k%5?roofMembrane:metal,x,y,0,w/40+.06,.2,d+1)}for(let x=-w/2+2;x<w/2;x+=3.5)for(let q of [-1,1])f.box(windowReflect,x,9,q*(d/2+.1),2.5,3,.1);f.box(windowReflect,0,2,d/2+.15,7,3.7,.12)}
// The white wavy pavilion facing the field, with arched glass and dark circular perforations.
const pavilionPos=mapPoint(605,248),pavilion=frame(pavilionPos[0],pavilionPos[2],-137);
pavilion.box(windowReflect,0,4.1,0,32,8.2,12);pavilion.box(stone,0,.45,0,34,.7,13);
for(let x=-16;x<16;x+=.65){const wave=9+1.15*Math.cos((x+4)*.19),bottom=3.3+4.7*Math.sqrt(Math.max(0,1-(x/16)**2));pavilion.box(white,x,(wave+bottom)/2,6.25,.68,Math.max(.4,wave-bottom),.36);pavilion.box(white,x,wave,0,.68,.25,13)}
for(let x=-15;x<=15;x+=3.8)pavilion.box(metal,x,4.1,6.12,.12,8.2,.12);
for(let k=0;k<32;k++){let x=-15+(k%16)*2,y=8.5+Math.floor(k/16)*.55;if(y<9+1.15*Math.cos((x+4)*.19))pavilion.sphere(dark,x,y,6.46,.1,.1,.025)}

// Hansae egg sculpture: separate stone egg, twisting carved upright, reflective egg and swept neck.
const statuePos=mapPoint(...mapAnchors.sculpture),hansae=frame(statuePos[0],statuePos[2],43);
hansae.box(paversRed,0,.2,0,26,.35,23);disk(hansae,stone,0,0,7.4,4.8,.46);disk(hansae,curb,0,0,6.9,4.3,.65);disk(hansae,stone,0,0,6.4,3.9,.85);
for(let k=0;k<38;k++){let a=k*Math.PI*2/38;if(Math.sin(a)<.15)continue;hansae.sphere(leaf2,7.2*Math.cos(a),.95,4.7*Math.sin(a),.57,.43,.52)}
ellipsoid(now,sculptureWhite,...hansae.point(-2.65,2.05,0),1.05,1.23,1.03,32,24);
const chrome=mat('hansaeChrome','#dfe8ee',98);chrome.specular=new pc.Color(.95,.95,.95);chrome.update();
// Procedural sky/ground reflection provides a metallic horizon without copying photographs.
const envCanvas=document.createElement('canvas');envCanvas.width=envCanvas.height=256;const eg=envCanvas.getContext('2d'),envGrad=eg.createLinearGradient(0,0,0,256);for(const [t,c]of [[0,'#819fb5'],[.43,'#edf4f7'],[.49,'#c5d5df'],[.51,'#344438'],[.64,'#7c8b76'],[.69,'#d1d2c6'],[1,'#6e7773']])envGrad.addColorStop(t,c);eg.fillStyle=envGrad;eg.fillRect(0,0,256,256);const envTexture=new pc.Texture(device,{anisotropy:ANISO,width:256,height:256,mipmaps:true});envTexture.setSource(envCanvas);chrome.sphereMap=envTexture;chrome.update();
ellipsoid(now,chrome,...hansae.point(3.15,1.92,.05),.98,1.04,.91,40,28);
function sculptProfile(t){return[-.35+.48*Math.sin(t*6.1)-.34*t, .86+t*6.5, .12*Math.sin(t*4),(.56+.35*Math.sin(t*Math.PI))*(1-.89*t**7),.37*(1-.82*t**6),t*1.3]}
function sculptPoint(t,a){const [x,y,z,rx,rz,tw]=sculptProfile(t);return[x+rx*Math.cos(a)*Math.cos(tw)+rz*Math.sin(a)*Math.sin(tw),y,z-rx*Math.cos(a)*Math.sin(tw)+rz*Math.sin(a)*Math.cos(tw)]}
function solidFace(f,m,points){const ps=points.map(p=>f.point(...p)),a=ps[1].map((v,i)=>v-ps[0][i]),b=ps[2].map((v,i)=>v-ps[0][i]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=Math.hypot(...n);if(len<1e-9)return;geom(now,m,ps.flat(),ps.flatMap(()=>n.map(v=>v/len)),[0,0,1,0,1,1,0,1],[0,1,2,0,2,3])}
for(let j=0;j<56;j++)for(let k=0;k<32;k++){let a=k*2*Math.PI/32,b=(k+1)*2*Math.PI/32;solidFace(hansae,sculptureWhite,[sculptPoint(j/56,a),sculptPoint((j+1)/56,a),sculptPoint((j+1)/56,b),sculptPoint(j/56,b)])}
for(let j=1;j<17;j++){const t=j/18;for(let k=0;k<31;k++)tube(hansae,sculptureSeam,sculptPoint(t,k*2*Math.PI/32),sculptPoint(t,(k+1)*2*Math.PI/32),.009,5)}
const neck=[];for(let k=0;k<=64;k++){let t=k/64;neck.push([1.35-1.05*Math.sin(t*Math.PI*1.6)+2.3*t*t,.95+3.15*t-.75*Math.sin(t*Math.PI*2),-.08])}for(let k=1;k<neck.length;k++)tube(hansae,chrome,neck[k-1],neck[k],.14*(1-k/neck.length*.65),12);
for(let x of [-10,10]){bareTree(hansae,x,6,1);bench(hansae,x*.72,-7)}
worldLabel('한새알 조각상',statuePos[0],statuePos[2],'now',8);
// Inside the entrance: roundabout, low stone planter, pinwheels and pedestrian crossings.
const roundPos=mapPoint(...mapAnchors.island),roundabout=frame(roundPos[0],roundPos[2],0);
disk(roundabout,asphalt,0,0,15,13,.31);disk(roundabout,pavers,0,0,5,4.4,.36);disk(roundabout,stone,0,0,2.8,2.6,.8);disk(roundabout,campusSand,0,0,2.5,2.3,.85);
for(let k=0;k<9;k++){const a=k*2.399,x=Math.cos(a)*1.8,z=Math.sin(a)*1.6;tube(roundabout,metal,[x,.8,z],[x,1.9,z],.022);for(let j=0;j<4;j++){let b=j*Math.PI/2;roundabout.sphere([red,roadYellow,bluePanel,greenPanel][k%4],x+Math.cos(b)*.19,2+Math.sin(b)*.19,z,.16,.12,.022)}}
for(let q of [-1,1])for(let k=0;k<7;k++)roundabout.box(white,-5+k*1.6,.33,q*12.5,.85,.025,3.6);
for(let x of [-10,10]){railing(roundabout,x,-16,x,-7,1.1);campusLamp(roundabout,x,13)}
// Photo-derived street corridor to the station: continuous carriageway, raised sidewalks, shops and utilities.
const gatePoint=mapPoint(...mapAnchors.gate);const campusRoute=[[gatePoint[0],gatePoint[2]],[380,202],NM(1200,630),NM(1390,647),NM(1452,652)];
const routeSegments=[];
function roadText(f,text,x,z,w,d){const plane={quad:(m,ps,uv)=>{const p=ps.map(([a,b,c])=>f.point(a,.38,-b));geom(now,m,p.flat(),p.flatMap(()=>[0,1,0]),uv,[0,1,2,0,2,3])}};wallText(plane,text,x,-z,0,w,d,'#fff9df')}
function arrow(f,x,z,dir=-1){f.box(white,x,.345,z,.18,.025,2.1);flatQuad(f,white,[[x-.65,z+dir],[x,z+2*dir],[x+.65,z+dir],[x,z+dir]],.36)}
function signal(f,x,z){tube(f,roadYellow,[x,.3,z],[x,5.1,z],.095);tube(f,roadYellow,[x,5.1,z],[x+(x<0?8:-8),5.1,z],.08);let xx=x+(x<0?6:-6);f.box(dark,xx,4.97,z,1.4,.45,.32);for(let j=0;j<3;j++)f.sphere(j===0?red:j===1?roadYellow:greenPanel,xx-.43+j*.43,4.97,z+.18,.14,.14,.035)}
function streetCar(f,x,z,index){f.box(carM[index%4],x,.94,z,1.9,1.25,4.5);f.box(windowReflect,x,1.68,z-.12,1.65,.67,2.15);for(let q of [-1,1])for(let zz of [-1.4,1.4])f.sphere(black,x+q*.92,.59,z+zz,.16,.36,.36);for(let q of [-1,1])f.box(white,x+q*.64,.99,z-2.28,.38,.21,.055)}
for(let s=1;s<campusRoute.length;s++){
 const a=campusRoute[s-1],b=campusRoute[s],len=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI,f=frame((a[0]+b[0])/2,(a[1]+b[1])/2,angle);routeSegments.push({a,b,len,angle});
 f.box(asphalt,0,.22,0,10,.22,len+1);for(let q of [-1,1]){f.box(curb,q*5.15,.34,0,.3,.3,len);f.box(pavers,q*7.1,.26,0,3.6,.4,len);f.box(roadYellow,q*6.5,.473,0,.38,.02,len);f.box(white,q*4.7,.343,0,.09,.025,len)}
 for(let q of [-1,1])f.box(roadYellow,q*.14,.344,0,.09,.025,len-2);
 for(let z=-len/2+12;z<len/2-6;z+=22)for(let q of [-1,1]){bareTree(f,q*8.15,z,.7);f.box(stone,q*8.15,.5,z,1.25,.12,1.6);if(q<0)campusLamp(f,q*8.55,z)}
 for(let z=-len/2+14;z<len/2-10;z+=32){arrow(f,-2.5,z,1);arrow(f,2.5,z+5,-1);}
 if(s>=2){for(let q of [-1,1])signal(f,q*7.5,-len/2+6);for(let k=0;k<8;k++)f.box(roadYellow,-4.2+k*1.2,.35,-len/2+8,.65,.025,3.1);f.box(white,0,.35,-len/2+11,10,.025,.22)}
 if(s===3||s===4){roadText(f,'어린이',2.5,-18,3.7,2.8);roadText(f,'보호구역',2.5,-22,3.7,2.8);roadText(f,'30',2.5,-30,2.5,3);streetCar(f,2.5,9,s);const opposite=f.point(-2.5,0,-9);streetCar(frame(opposite[0],opposite[2],angle+180),0,0,s+1);}
 if(s>=3)for(let q of [-1,1])for(let z=-len/2+17,j=0;z<len/2-14;z+=16,j++){
  // Breaks between rows leave junctions visible; no commercial brand names are copied.
  const p=f.point(q*16,0,z);if(Math.hypot(p[0]-566,p[2]-150)<48||polyDistance(p[0],p[2],roadByName('중앙대로').pts)<26||polyDistance(p[0],p[2],roadByName('캠퍼스동쪽길').pts)<14)continue;const store=frame(p[0],p[2],angle+(q<0?90:-90)),w=12+(j%3),d=12,h=8+((j+s)%4)*3.15;
  store.box(urbanWalls[(j+s)%4],0,h/2,0,w,h,d);roofDetail(store,w,d,h);
  for(let y=5;y<h-1;y+=3.15)for(let xx=-w/2+2;xx<w/2;xx+=3.3){store.box(windowReflect,xx,y,6.1,2.4,1.85,.1);store.box(stone,xx,y,6.2,.07,1.9,.08)}
  store.box(dark,0,1.55,6.1,w-1,2.8,.12);store.box(windowReflect,0,1.55,6.2,w-1.3,2.6,.08);for(let xx=-w/2+1;xx<w/2;xx+=2.8)store.box(metal,xx,1.55,6.29,.09,2.8,.08);
  store.box([roofDark,paversRed,urbanGray][j%3],0,3.4,6.45,w-.5,.9,.4);
  if(j%3===0){wallText(store,j%2?'문구':'카페',0,3.45,6.68,4.2,.6,'#fff6db');for(let xx=-w/2+.4,k=0;xx<w/2-.3;xx+=.6,k++)store.box(k%2?white:bluePanel,xx,2.9,7,.6,.15,2)}
  store.box(rooftopMetal,w*.28,4.5,6.5,1.5,.7,.65);for(let i=0;i<4;i++)store.box(dark,w*.28,4.3+i*.1,6.84,1.2,.025,.015);
 }
 if(s>=3){for(let z=-len/2+6;z<len/2;z+=35){tube(f,stone,[9,.3,z],[9,7.8,z],.13);tube(f,metal,[8.4,7.2,z],[9.6,7.2,z],.035);if(z+35<len/2)for(let wire of [-.45,0,.45])for(let k=0;k<12;k++){let t=k/12,t2=(k+1)/12;tube(f,dark,[9+wire,7.3-.45*Math.sin(t*Math.PI),z+t*35],[9+wire,7.3-.45*Math.sin(t2*Math.PI),z+t2*35],.012,5)}}}
}
// Gate stones, brick boundary piers, white metal fencing and a pedestrian staircase.
const entrance=frame(gatePoint[0],gatePoint[2],82);for(let q of [-1,1]){entrance.box(stone,q*8.8,1.7,0,4.4,3.1,1.2);entrance.box(stone,q*10.8,2.2,0,1.2,4.1,1.7);for(let z=-8;z>=-39;z-=5){entrance.box(urbanBrick,q*11.4,.9,z,.7,1.8,.7);railing(entrance,q*11.4,z,q*11.4,z-5,2);entrance.box(urbanBrick,q*11.4,.45,z-2.5,.4,.9,5)}}
wallText(entrance,'부산교육대학교',-8.8,2, .64,4.05,.6,'#3b4643');
for(let k=0;k<10;k++)entrance.box(stone,15,.18+k*.11,-6-k*.55,4,.2+k*.22,.6);
for(let q of [-1,1])tube(entrance,metal,[15+q*1.7,1.1,-6],[15+q*1.7,3.1,-11],.045);
// Roads are connected by common endpoints in the photograph's map coordinate system.
const campusRoadTraces=[
 [[66,317],[187,441],[322,577],[474,715],[578,800],[682,840],[765,789]],
 [[474,715],[522,740],[574,759],[630,771],[699,796],[765,789]],
 [[765,789],[804,719],[873,644],[934,588],[1050,599],[1193,625]],
 [[66,317],[193,240],[324,140],[425,49]],
 [[484,195],[585,277],[716,419],[853,559],[934,588]]
];
function tracedRoad(points,width=6.8){for(let i=1;i<points.length;i++){const a=mapPoint(...points[i-1]),b=mapPoint(...points[i]),dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),f=frame((a[0]+b[0])/2,(a[2]+b[2])/2,Math.atan2(dx,dz)*180/Math.PI);f.box(asphalt,0,.2,0,width,.24,len+.4);for(let q of [-1,1]){f.box(curb,q*(width/2+.18),.27,0,.36,.32,len);f.box(pavers,q*(width/2+1.6),.23,0,2.5,.35,len);f.box(white,q*(width/2-.22),.335,0,.08,.02,len)}for(let z=-len/2+5;z<len/2-3;z+=14){bareTree(f,-width/2-2.2,z,.8);if(i%2===0)campusLamp(f,width/2+2.5,z)}}}
for(const path of campusRoadTraces)tracedRoad(path);
// Join both sides of the hall forecourt and the school's eastern service road.
const schoolRoadA=school.point(50,0,-50),schoolRoadB=school.point(50,0,100),schoolRoadC=school.point(-51,0,-50);
function worldRoad(points,w=6.5){for(let i=1;i<points.length;i++){segment(now,curb,points[i-1],points[i],w+2,.14);segment(now,asphalt,points[i-1],points[i],w,.25)}}
const connection=mapPoint(474,715),southConnection=mapPoint(503,876);
worldRoad([[schoolRoadA[0],schoolRoadA[2]],[connection[0],connection[2]]]);
worldRoad([[schoolRoadA[0],schoolRoadA[2]],[schoolRoadB[0],schoolRoadB[2]]]);
worldRoad([[schoolRoadC[0],schoolRoadC[2]],[schoolRoadA[0],schoolRoadA[2]]]);
const aroundSchool=[[-60,139],[90,139],[90,-50]].map(([x,z])=>{const p=school.point(x,0,z);return[p[0],p[2]]});worldRoad([[schoolRoadC[0],schoolRoadC[2]],...aroundSchool,[schoolRoadA[0],schoolRoadA[2]]]);
// Yellow raised crossing by the hall and the sloping wooded approach to the island.
const crossingPos=mapPoint(474,715),crossing=frame(crossingPos[0],crossingPos[2],-45);
crossing.box(red,0,.34,0,13,.06,5.5);for(let x=-5.6;x<6;x+=1.3)crossing.box(roadYellow,x,.383,0,.75,.02,4.7);
const bendPos=mapPoint(620,772),bend=frame(bendPos[0],bendPos[2],79);roadText(bend,'20',0,0,3,3.5);roadText(bend,'어린이',0,6,4,3);roadText(bend,'보호구역',0,10,4,3);
for(let i=0;i<34;i++){const t=i/33,p=mapPoint(549+t*168,814+Math.sin(t*2.5)*16);bambooPlant(frame(0,0,0),p[0],p[2],10.2+(i%7)*.42,(i%3-1)*.5)}
// Connected covered walkways follow the main front and turn along the lawn's western edge.
const awningRed=mat('awningRed','#de795f'),awningWhite=mat('awningWhite','#e6e8df');
const canopyPaths=[[[-43,9],[42,9],true,0,0],[[-43,9],[-48,17],false,0,1.8],[[-48,17],[-48,66],false,1.8,1.8]];
function coveredWalk(a,b,coloured,y0=0,y1=0){const aa=school.point(a[0],0,a[1]),bb=school.point(b[0],0,b[1]),len=Math.hypot(bb[0]-aa[0],bb[2]-aa[2]),angle=Math.atan2(-(bb[2]-aa[2]),bb[0]-aa[0])*180/Math.PI,f=frame((aa[0]+bb[0])/2,(aa[2]+bb[2])/2,angle);const level=x=>y0+(x+len/2)/len*(y1-y0);for(let x=-len/2;x<len/2;x+=1)f.box(pavers,x+.5,.32+level(x+.5),0,1.04,.2,3);for(let x=-len/2;x<len/2+.1;x+=3)for(let q of [-1,1]){f.box(wood,x,1.65+level(x),q*1.35,.12,2.7,.12);f.box(metal,x,3+level(x),q*1.35,.1,.3,.1)}for(let x=-len/2;x<len/2;x+=1.5){for(let k=0;k<12;k++){let z=-1.7+(k+.5)*3.4/12,y=3.05+level(x+.75)+.62*Math.sqrt(Math.max(0,1-(z/1.7)**2));f.box(coloured?(Math.floor((x+len/2)/3)%2?awningRed:awningWhite):roofDark,x+.75,y,z,1.53,.065,.3)}for(let k=0;k<12;k++){let z=-1.7+(k+.5)*3.4/12,y=3.1+level(x)+.62*Math.sqrt(Math.max(0,1-(z/1.7)**2));f.box(metal,x,y,z,.04,.05,.3)}}for(let q of [-1,1])tube(f,metal,[-len/2,3.05+y0,q*1.7],[len/2,3.05+y1,q*1.7],.07)}
canopyPaths.forEach(p=>coveredWalk(...p));coveredWalk([-13,98],[16,98],false,3.3,3.3);

worldLabel('대학교 운동장',32,130,'now',2);
const detailStops={field:{name:'넓은 운동장',x:fieldCentre[0],z:fieldCentre[2],distance:440,pitch:55,yaw:43},sculpture:{name:'조형물 가까이',x:statuePos[0],z:statuePos[2],distance:23,pitch:22,yaw:43},entrance:{name:'입구 쪽',x:gatePoint[0],z:gatePoint[2],distance:95,pitch:35,yaw:82},street:{name:'큰길 쪽',x:500,z:216,distance:280,pitch:48,yaw:0},island:{name:'교내 길',x:roundPos[0],z:roundPos[2],distance:105,pitch:40,yaw:55},museum:{name:'주차장 쪽',x:museumPos[0]-12,z:museumPos[2]+12,distance:125,pitch:28,yaw:-47}};

// Eastern skyline landmark, west of the station and river. No lettering or logos.
const skylineTower=frame(566,150,2);
skylineTower.box(pavers,0,.2,0,66,.4,58);skylineTower.box(urbanPlaster,0,42,0,33,84,26);skylineTower.box(urbanPlaster,4,43,0,16,86,30);
for(let q of [-1,1])for(let x=-14;x<=14;x+=3.5){skylineTower.box(windowReflect,x,43,q*13.2,2.5,78,.2);skylineTower.box(white,x-1.35,43,q*13.4,.33,81,.4)}
for(let q of [-1,1])for(let z=-10;z<=10;z+=3.5){skylineTower.box(windowReflect,q*16.6,43,z,.2,78,2.5);skylineTower.box(white,q*16.8,43,z-1.4,.4,81,.33)}
for(let y=8;y<85;y+=3.35)for(let q of [-1,1])skylineTower.box(stone,0,y,q*13.5,34,.18,.5);
skylineTower.box(stone,0,84.7,0,35,1.4,28);skylineTower.box(roofMembrane,0,85.5,0,28,.25,23);
skylineTower.box(stone,0,89,-3,20,7,16);skylineTower.box(roofMembrane,0,92.65,-3,18,.25,14);
skylineTower.box(windowReflect,0,4.4,14.1,23,6.8,.2);skylineTower.box(stone,0,8.4,17,36,.8,9);for(let x=-14;x<=14;x+=7)skylineTower.box(stone,x,4,20,.6,8,.6);
// Separate underground entrances at the main avenue from the southeast elevated platform.
const metroDir=(()=>{const a=NM(1455,470),b=NM(1472,720);return Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI})(),metro=frame(metroPos[0],metroPos[1],metroDir);
for(let q of [-1,1]){metro.box(pavers,q*17.5,.22,0,4,.3,120);for(let z=-55;z<60;z+=19){bareTree(metro,q*16.5,z,.9);campusLamp(metro,q*18,z)}}
for(let z of [-27,29])for(let q of [-1,1]){const x=q*16;metro.box(dark,x,.34,z,4.7,.12,10);for(let k=0;k<8;k++)metro.box(stone,x,.35+k*.035,z-4+k*.6,4.1,.15,.63);for(let xx of [-2.4,2.4]){metro.box(stone,x+xx,1.1,z,.3,1.7,10.5);tube(metro,metal,[x+xx,1.8,z-5],[x+xx,1.8,z+5],.045)}metro.box(roofDark,x,3.1,z,5.8,.18,11);for(let xx of [-2.3,2.3])for(let zz of [-4.5,4.5])metro.box(metal,x+xx,1.65,z+zz,.11,2.9,.11);metro.box(bluePanel,x,3.15,z+5.6,3.8,.65,.16)}
for(let z of [-6,7])for(let x=-11;x<12;x+=1.7)metro.box(white,x,.285,z,.9,.025,4);
// Varied small parcels give the aerial view dense streets without overlapping the old house grid.
function districtBlock(x,z,w,d,h,a){const f=frame(x,z,a);f.box(urbanWalls[Math.floor(rnd()*4)],0,h/2,0,w,h,d);f.box(roofMembrane,0,h+.16,0,w,.25,d);for(let q of [-1,1]){f.box(stone,0,h+.35,q*d/2,w,.4,.2);f.box(stone,q*w/2,h+.35,0,.2,.4,d);for(let y=2;y<h;y+=3.4){for(let xx=-w/2+2;xx<w/2-1;xx+=3.7)f.box(windowReflect,xx,y,q*(d/2+.07),2,1.6,.1);for(let zz=-d/2+2;zz<d/2-1;zz+=3.7)f.box(windowReflect,q*(w/2+.07),y,zz,.1,1.6,1.8)}}f.box(rooftopMetal,w*.2,h+.8,-d*.2,2,1.2,1.8);f.box(dark,0,1.2,d/2+.1,1.5,2.4,.12)}
for(let row=0;row<31;row++)for(let coln=0;coln<48;coln++){const x=-470+coln*34+(row%2)*7,z=-280+row*36;if(reservedContext(x,z)||inSchoolArea(x,z)||nearRoad(619+x/.85,460+z/.85,13)||Math.hypot(x-585,z-210)<58||polyDistance(x,z,railRoute)<22||polyDistance(x,z,riverRoute)<44||x>1150||z>790)continue;const angle=(row%3===0?-8:43),w=12+(coln%4)*2.2,d=12+(row%3)*2,h=5+((row+coln)%5)*2.1;if(Math.hypot(x-32,z-130)<310)building(619+x/.85,460+z/.85,w,d,h,angle,false);else districtBlock(x,z,w,d,h,angle)}

// The mural end is a continuous wall. The terrace stairs are only to its right.
// A smooth, two-way lane through the bamboo belt links the side gate and island.
const pathStart=school.point(50,0,66),pathMid=school.point(61,0,54);
const schoolPath=bambooRouteWorld;
function pathDistance(x,z,pts){let best=Infinity;for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz))}return best}
function bench(f,x,z){for(const xx of [-.85,.85]){f.box(dark,x+xx,.42,z,.1,.8,.6);f.box(dark,x+xx,.86,z+.29,.08,1.05,.08)}for(let k=0;k<4;k++){f.box(wood,x,.83,z-.3+k*.18,2.2,.075,.13);f.box(wood,x,1.02+k*.12,z+.33,2.2,.075,.08)}}
for(let i=1;i<schoolPath.length;i++){
 const a=schoolPath[i-1],b=schoolPath[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),ang=Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI,f=frame((a[0]+b[0])/2,(a[1]+b[1])/2,ang);
 f.box(asphalt,0,.39,0,7.2,.18,len+.7);
 for(const q of [-1,1]){f.box(curb,q*3.7,.48,0,.24,.3,len+.5);f.box(pavers,q*4.9,.45,0,2.2,.24,len+.5);f.box(white,q*3.25,.495,0,.1,.025,len+2)}
 for(let z=-len/2;z<len/2;z+=4.2)for(const q of [-1,1])for(let r=0;r<1;r++){
  const x=q*(7+r*.65+rand(-.35,.35)),zz=z+rand(-.35,.35),h=rand(5.8,9);
  bambooPlant(f,x,zz,10.5+(h-5.8)*1.05,-q*.75);
 }
 for(let z=-len/2+8;z<len/2-4;z+=20){bench(f,-5,z);campusLamp(f,5.7,z+2)}
}
for(const i of [3,11,19]){const p=schoolPath[i],q=schoolPath[i+1],f=frame(p[0],p[1],Math.atan2(q[0]-p[0],q[1]-p[1])*180/Math.PI);bench(f,-5,0);campusLamp(f,5.7,0)}
const booth=frame(pathStart[0],pathStart[2],schoolAngle);booth.box(stone,-6,1.6,-3,2.8,3,3.2);booth.box(roof,-6,3.18,-3,3.3,.2,3.7);for(let x=-6.9;x<-4.9;x+=.65)booth.box(windowReflect,x,2.05,-1.35,.58,1.1,.08);wallText(booth,'안내',-6,2.9,-1.28,1.1,.32);
// Entrance scene: close junction, shopfronts to the left and wooded boundary to the right.
const gateStreet=frame(gatePoint[0],gatePoint[2],82);
gateStreet.box(asphalt,0,.38,28,76,.2,12);
for(const z of [20.8,35.2])gateStreet.box(pavers,0,.4,z,76,.3,2.4);
for(let x=-4.5;x<5;x+=1.3)gateStreet.box(roadYellow,x,.495,19,.7,.02,4.5);
for(let z=24;z<32;z+=1.3)gateStreet.box(roadYellow,-13,.495,z,4,.02,.75);
for(const x of [-9,9])signal(gateStreet,x,19.5);
for(let x=-34;x<35;x+=3)gateStreet.box(roadYellow,x,.5,28,1.8,.02,.1);
const shopSpecs=[[19,40,14,8,7.7,'GS25',bluePanel],[34,40,14,8,11.5,'STARBUCKS',greenPanel],[48,41,12,9,10,'COFFEE',urbanBrick]];
const shopGlow=mat('eveningShopGlass','#9eb5bd',65),lampGlow=mat('lampGlow','#e6ddbe');
for(const [x,z,w,d,h,name,accent]of shopSpecs){const wp=gateStreet.point(x,0,z),store=frame(wp[0],wp[2],262);store.box(name==='COFFEE'?urbanBrick:urbanSand,0,h/2,0,w,h,d);roofDetail(store,w,d,h);store.box(shopGlow,0,1.8,d/2+.12,w-1.1,3.1,.12);for(let xx=-w/2+1;xx<w/2;xx+=2.5)store.box(metal,xx,1.8,d/2+.2,.09,3.2,.1);store.box(accent,0,3.8,d/2+.3,w,.9,.4);wallText(store,name,0,3.85,d/2+.53,w*.7,.57,'#fffdf4');for(let xx=-w/2+1.4;xx<w/2;xx+=3.4)for(let y=5.8;y<h-1;y+=3.2)store.box(windowReflect,xx,y,d/2+.08,2.4,1.9,.12);for(let xx=-w/2+.7;xx<w/2;xx+=2.1)store.box(stone,xx,.6,d/2+2,.14,1.2,.14);const light=store.point(0,3.1,d/2+2);lampPositions.push({x:light[0],y:light[1],z:light[2],shop:true})}
for(let z=4;z<57;z+=3){gateStreet.box(urbanBrick,-13,1,z,.7,2,2.8);gateStreet.box(stone,-13,2.1,z,.86,.16,3);for(let r=0;r<3;r++){const p=gateStreet.point(-18-r*4,0,z);tree(now,p[0],p[2],1.05+r*.3)}}
for(let k=0;k<16;k++){gateStreet.box(stone,-19-k*.5,.15+k*.14,10, .55,.3+k*.28,3);for(const q of [-1,1])tube(gateStreet,metal,[-19-k*.5,1.1+k*.28,10+q*1.6],[-19-(k+1)*.5,1.1+(k+1)*.28,10+q*1.6],.035)}
for(const x of [-10,10])for(const z of [3,36,55])campusLamp(gateStreet,x,z);
for(const x of [-39,39])for(const z of [12,58,88])campusLamp(school,x,z);
// Old village: a communal rice field and three traditional children's games.
const dureWorkers=[],playCentre={x:-257,z:302};
box(old,soil,-335,.3,-76,39,.6,31);box(old,water,-335,.63,-76,37,.055,29);
for(let x=-351;x<-317;x+=1.3)for(let z=-89;z<-61;z+=1.3){for(let k=-1;k<=1;k++)box(old,paddy,x+k*.09,.85,z,.045,.45+Math.abs(k)*.1,.06,k*13)}
const dureLines=[
 ['여기는 대조리입니다. 이웃들과 함께 논의 김을 매고 있어요.','벼 사이의 잡풀을 뽑아야 벼가 잘 자라요.'],
 ['벼는 남겨 두고 잡풀만 골라 뽑아요.','뿌리까지 뽑으려면 손에 힘을 주어야 해요.'],
 ['혼자 하면 오래 걸리지만 함께하면 힘이 나요.','오늘은 이 논, 다음에는 이웃의 논을 도와요.'],
 ['허리를 오래 숙였더니 뻐근하네요. 잠깐 펴야겠어요.','함께 일하는 이웃과 이야기를 나누면 덜 힘들어요.'],
 ['휴, 땀이 나네요. 잠깐 땀을 닦고 다시 할게요.','더운 날에는 중간중간 쉬어야 해요.'],
 ['여럿이 힘을 모아 농사일을 하는 모임을 두레라고 해요.','서로 도우며 마을의 일을 해내지요.'],
 ['논바닥이 미끄러우니 발을 조심해요.','물과 햇볕을 먹고 벼가 쑥쑥 자라겠지요.'],
 ['저쪽 줄도 다 매었나요? 이쪽은 조금 남았어요.','먼저 끝나면 이웃을 도우러 갈 거예요.'],
 ['새참을 가져오셨대요! 이 줄까지 하고 쉬어요.','함께 음식을 나누어 먹으면 더 맛있어요.'],
 ['가을에 곡식을 거둘 생각을 하며 일해요.','먹을거리를 얻으려면 날마다 논을 돌보아야 해요.']];
for(let row=0;row<2;row++)for(let j=0;j<5;j++){const i=row*5+j,p=makePerson('old',-347+j*5.1,-84+row*10,'함께 김매기하는 두레꾼 '+(i+1),dureLines[i],'wader','weed',[10,20,-12,65,5,15,-20,-65,25,8][i]);p.entity.setPosition(p.x,.67,p.z);p.workPose=i===4||i===8?'wipe':i===3||i===7?'side':'weed';dureWorkers.push(p)}
const leader=makePerson('old',-315,-78,'두레의 일을 이끄는 사람',['우리 함께 힘을 모아 이 논부터 매 봅시다!','혼자 하기 힘든 농사일도 이웃들과 함께하면 해낼 수 있어요.','여러분은 친구와 힘을 모아 어떤 일을 해 보았나요?'],'farmer','wave',-60);
const snack=makePerson('old',-315,-70,'새참을 가져온 사람',['일하느라 수고했어요. 잠시 쉬며 새참을 드세요.','이웃과 음식을 나누고 이야기를 나누어요.'],'water','wave',-70);
box(old,wood,-315,.8,-68,2,.12,1.2);for(let j=0;j<4;j++)ellipsoid(old,white,-315.7+j*.46,.9,-68,.18,.08,.18);
worldLabel('함께 김매기하는 두레',-335,-76,'old',4);
// Swings are pivoted from a high wooden beam; the child stands on the board.
const sx=playCentre.x,sz=playCentre.z;
box(old,soil,sx,.16,sz+8,42,.3,39);tree(old,sx-10,sz-3,1.7);
for(const x of [-2.2,2.2]){box(old,wood,sx+x,3.15,sz,.22,6.3,.25);box(old,wood,sx+x,1.7,sz+1,.18,3.4,.2)}box(old,wood,sx,6.25,sz,5.2,.22,.24);
const swing=new pc.Entity('traditional-swing');old.addChild(swing);swing.setPosition(sx,6.1,sz);
for(const x of [-.5,.5])primitive(swing,'cylinder',creamCloth,x,-2.5,0,.04,5,.04);
primitive(swing,'box',wood,0,-5,0,1.3,.13,.65);
const swingChild=makePerson('old',sx,sz,'그네 타는 아이',['줄을 꼭 잡고 그네를 타고 있어!','발을 구르면 높이 올라갔다가 다시 내려와.','친구야, 내가 내리면 네 차례야!'],'child','swing');swingChild.entity.reparent(swing);swingChild.entity.setLocalPosition(0,-4.9,0);swingChild.arms.forEach((a,i)=>a.setLocalEulerAngles(-130,0,i?15:-15));
const boardRoot=new pc.Entity('neolttwigi');old.addChild(boardRoot);boardRoot.setPosition(sx+10,.7,sz+8);primitive(boardRoot,'box',wood,0,0,0,6.5,.16,.9);ellipsoid(old,thatch,sx+10,.37,sz+8,.6,.4,.7);
const boardKids=[-1,1].map((q,i)=>makePerson('old',sx+10+q*2.8,sz+8,i?'널뛰기하는 동생':'널뛰기하는 언니',['널 양쪽 끝에 서서 번갈아 발을 굴러!','친구가 내려오면 내가 하늘로 뛰어올라. 이것이 널뛰기야.','서로 박자를 맞추는 게 중요해!'],'child','board',q*90));
const kiteKids=[],kites=[];
for(let i=0;i<2;i++){const x=sx-8+i*7,z=sz+17;const kid=makePerson('old',x,z,'연날리기하는 아이 '+(i+1),['바람을 타고 연이 높이 올라간다!','줄을 조금 풀었다 감았다 하며 연을 날려.','너희가 좋아하는 놀이는 무엇이니?'],'child','kite',10);primitive(kid.group,'box',wood,.3,1,-.3,.35,.12,.12);kiteKids.push(kid);const root=new pc.Entity('kite');old.addChild(root);const diamond=primitive(root,'box',i?red:bluePanel,0,0,0,2.1,2.1,.035);diamond.setLocalEulerAngles(0,0,45);primitive(root,'box',creamCloth,0,0,-.04,.07,2.9,.025);primitive(root,'box',creamCloth,0,0,-.04,2.9,.07,.025);for(let j=0;j<6;j++)primitive(root,'box',i?bluePanel:red,Math.sin(j)*.12,-1.7-j*.35,0,.12,.36,.04);const string=primitive(old,'cylinder',creamCloth,0,0,0,.013,1,.013);kites.push({root,string,x,z,i})}
worldLabel('그네 · 널뛰기 · 연날리기',sx,sz+8,'old',5);
// Comic-style speech bubbles float above people when the viewer is close, like the textbook illustrations.

function villager(x,z,name,talk,kind,activity,angle,opts,say){const p=makePerson('old',x,z,name,talk,kind,activity,angle,opts);if(say)bubble(p,say,kind==='child'?2.1:2.4,{hot:true});return p}
const festival=[];
// 1) Birth: a straw rope (금줄) with red peppers and charcoal across the gate for 21 days.
const birthHome={x:-318,z:364};hut(birthHome.x,birthHome.z,11,8);
{const wallPts=[];for(let k=-9;k<=9;k+=.7)if(Math.abs(k)>1.9)wallPts.push([k,13]);for(const q of [-1,1])for(let zz=4.5;zz<13;zz+=.7)wallPts.push([q*9,zz]);wallPts.forEach(([xx,zz],i)=>{for(let r=0;r<3;r++)ellipsoid(old,(i+r)%3?stoneDark:wellStone,birthHome.x+xx+Math.sin(i*1.7+r)*.12,.28+r*.38,birthHome.z+zz+Math.cos(i*2.3+r)*.1,.42-r*.05,.24,.36,7,4)})}
for(const q of [-1,1])box(old,wood,birthHome.x+q*1.6,1.3,birthHome.z+13,.24,2.6,.24);
{const y0=2.25,gx=birthHome.x,gz=birthHome.z+13.05;for(let k=0;k<16;k++){const t0=k/16,t1=(k+1)/16,xa=gx-1.6+3.2*t0,xb=gx-1.6+3.2*t1,ya=y0-Math.sin(t0*Math.PI)*.28,yb=y0-Math.sin(t1*Math.PI)*.28;segment(old,thatch,[xa,gz],[xb,gz],.06,.06);box(old,thatch,(xa+xb)/2,(ya+yb)/2,gz,.21,.06,.06)}
 for(let k=1;k<8;k++){const t=k/8,x=gx-1.6+3.2*t,y=y0-Math.sin(t*Math.PI)*.28;box(old,k%2?red:black,x,y-.2,gz,k%2?.08:.12,k%2?.32:.12,k%2?.08:.12);if(k%3===0)box(old,hanbokMats.paper,x+.1,y-.15,gz,.14,.22,.02)}}
const ropeMan=villager(birthHome.x+.6,birthHome.z+13.9,'금줄을 치는 아버지',['우리 집에 아기가 태어났어요! 대문에 금줄을 치고 있어요.','새끼줄에 빨간 고추와 숯을 끼웠어요. 딸이 태어나면 숯과 솔가지를 끼우기도 해요.','금줄은 21일 동안 쳐 두어요. 나쁜 기운을 막고, 사람들이 함부로 드나들지 않게 하지요.','산모와 아기가 조용히 쉬면서 건강해지기를 바라는 마음이에요.'],'villager','custom',180,{top:hanbokMats.white,band:hanbokMats.white},'대문에 금줄을 쳐요!');ropeMan.custom=true;festival.push(['rope',ropeMan]);
const grandma=villager(birthHome.x-3.2,birthHome.z+8.5,'기도하는 할머니',['삼신할머니, 우리 아기가 건강하게 자라도록 지켜 주세요.','옛날 사람들은 아기를 지켜 주는 신을 삼신이라고 불렀어요.','아기가 태어나면 정성껏 기도하며 아기와 산모의 건강을 빌었답니다.'],'villager','custom',160,{top:hanbokMats.white,skirt:hanbokMats.skirtIndigo,bun:true},'아기를 지켜 주세요');grandma.custom=true;festival.push(['pray',grandma]);
box(old,wood,birthHome.x-3.2,.45,birthHome.z+7.6,.9,.12,.6);ellipsoid(old,white,birthHome.x-3.2,.6,birthHome.z+7.6,.18,.12,.18,8,4);
const neighbour=villager(birthHome.x+2.8,birthHome.z+17.5,'금줄을 본 이웃',['대문에 금줄이 걸려 있네! 아기가 태어났구나.','금줄이 있는 집에는 함부로 들어가지 않아요. 오늘은 밖에서 축하만 해야겠어요.','고추가 달려 있으니 아들이 태어났나 봐요.'],'villager','wave',200,{top:hanbokMats.sky,skirt:hanbokMats.skirtBlue,bun:true},'금줄이 있으니 들어가지 말아야지');
worldLabel('아기가 태어난 집 · 금줄',birthHome.x,birthHome.z+13,'old',4.2);
// 2) Dano festival ground beside the swing: ssireum, pungmul band and the exchange of fans.
const dano={x:sx+36,z:sz+8};box(old,soil,dano.x,.17,dano.z,40,.3,36);
{const ring=[];for(let k=0;k<24;k++){const a=k/24*Math.PI*2;ring.push([dano.x-8+Math.cos(a)*4.4,dano.z-6+Math.sin(a)*4.4])}poly(old,mud,ring,.34);for(let k=0;k<24;k++){const a=k/24*Math.PI*2;box(old,thatch,dano.x-8+Math.cos(a)*4.5,.4,dano.z-6+Math.sin(a)*4.5,.8,.18,.35,-a*180/Math.PI)}}
const wrestlers=[0,1].map(i=>{const p=villager(dano.x-8+(i?.55:-.55),dano.z-6,i?'씨름하는 사람 2':'씨름하는 사람 1',i?['으라차차! 샅바를 꽉 잡고 버텨야 해요.','단오에는 마을마다 씨름판이 열렸어요. 이긴 사람은 황소를 상으로 받기도 했대요.']:['영차! 다리를 걸어서 넘어뜨릴 거예요.','남자들은 단오에 힘을 겨루는 씨름을 즐겼어요.'],'villager','custom',i?-90:90,{top:hanbokMats.white,bottom:hanbokMats.white,sash:i?hanbokMats.sashBlue:hanbokMats.sashRed},i?null:'남자들은 씨름을 즐겼어요');p.custom=true;return p});festival.push(['wrestle',wrestlers]);
const cheer=[[-12.5,-1.5,210,'씨름 구경하는 아이'],[-3.5,-1.8,150,'씨름 구경하는 어른'],[-8,-11.4,0,'씨름 구경하는 할아버지']].map(([dx,dz,a,n],i)=>{const p=villager(dano.x+dx,dano.z+dz,n,[['이겨라! 힘내라!','와, 둘 다 정말 힘이 세다!'],['단오는 음력 5월 5일이에요. 모내기를 마치고 모두 모여 쉬고 즐기는 날이지요.','씨름, 그네뛰기 같은 놀이를 하며 하루를 보냈어요.'],['내가 젊었을 때는 씨름판에서 황소를 탔지!','단오에는 수리취떡을 먹고, 창포물에 머리를 감았단다.']][i],i===0?'child':'villager','wave',a,i===2?{top:hanbokMats.white,hat:'gat'}:{top:i?hanbokMats.green:hanbokMats.yellow},i===0?'이겨라! 힘내라!':null);return p});
const bandNames=[['상쇠(꽹과리)','kkwaenggwari','sangmo'],['징','jing','gokkal'],['장구','janggu','gokkal'],['북','buk','gokkal'],['소고','kkwaenggwari','sangmo']];
const band=bandNames.map(([n,inst,hat],i)=>{const p=villager(dano.x+8,dano.z+4,'농악대 '+n,[['깨갱 깽! 꽹과리로 농악대를 이끌어요.','농악을 울리며 마을 사람들의 흥을 돋워요.'],['징~ 하고 울리면 소리가 멀리까지 퍼져요.','농악은 농사일을 할 때나 명절에 함께 즐기던 음악이에요.'],['덩 기덕 쿵 더러러러! 장구는 양쪽 소리가 달라요.','단오에는 농악에 맞춰 춤추며 즐겼어요.'],['둥! 둥! 북소리에 맞춰 발을 맞춰요.','여럿이 함께 소리를 맞추면 힘이 절로 나요.'],['상모를 돌리며 춤을 춰요. 빙글빙글!','머리의 긴 끈이 바람개비처럼 돌아가요.']][i],'villager','custom',0,{top:hanbokMats.white,bottom:hanbokMats.white,sash:[hanbokMats.sashRed,hanbokMats.sashBlue,hanbokMats.sashYellow,hanbokMats.sashRed,hanbokMats.sashBlue][i],hat,inst},i===0?'농악을 울리며 흥을 돋워요!':null);p.custom=true;return p});festival.push(['band',band]);
const fanGiver=villager(dano.x-6,dano.z+10,'부채를 주는 사람',['여름을 시원하게 보내라고 부채를 선물할게요.','단오 무렵에는 서로 부채를 주고받았어요. 이것을 단오부채라고 해요.'],'villager','custom',90,{top:hanbokMats.sky,skirt:hanbokMats.skirtRed,bun:true,inst:'fan'},'여름을 시원하게 보내!');fanGiver.custom=true;
const fanTaker=villager(dano.x-4.4,dano.z+10,'부채를 받는 사람',['고마워요! 이 부채로 더운 여름을 시원하게 보낼게요.','나도 창포물에 머리를 감고 왔어요. 머릿결이 좋아진대요.'],'villager','custom',-90,{top:hanbokMats.yellow,skirt:hanbokMats.skirtBlue,braid:true});fanTaker.custom=true;festival.push(['fan',fanGiver,fanTaker]);
const washer=villager(dano.x+12,dano.z-11,'창포물에 머리 감는 사람',['단오에는 창포를 삶은 물에 머리를 감았어요.','창포물에 머리를 감으면 머리카락이 윤기 나고 나쁜 기운을 막는다고 믿었어요.'],'villager','custom',180,{top:hanbokMats.pink,skirt:hanbokMats.skirtRed},'창포물에 머리를 감아요');washer.custom=true;festival.push(['wash',washer]);
box(old,wood,dano.x+12,.35,dano.z-12.3,1.3,.4,1.3);box(old,water,dano.x+12,.57,dano.z-12.3,1.1,.05,1.1);for(let k=0;k<6;k++)box(old,paddy,dano.x+12.4+(k%3)*.18,.62,dano.z-12.3+(k>2?.2:-.2),.05,.35,.04);
worldLabel('단오 놀이마당 · 씨름 · 농악',dano.x,dano.z,'old',5);
// 3) Everyday work in the village: pounding grain, carrying firewood and washing laundry by the marsh.
const mortarPos={x:-362,z:258};ellipsoid(old,wood,mortarPos.x,.4,mortarPos.z-.9,.42,.42,.42,10,6);box(old,dark,mortarPos.x,.8,mortarPos.z-.9,.5,.04,.5);
const pounder=villager(mortarPos.x,mortarPos.z,'절구질하는 사람',['절구에 곡식을 넣고 공이로 쿵덕쿵덕 찧어요.','이렇게 찧으면 곡식의 껍질이 벗겨져서 밥을 지을 수 있어요.','기계가 없던 옛날에는 사람의 힘으로 곡식을 찧었어요.'],'villager','custom',0,{top:hanbokMats.white,skirt:hanbokMats.skirtIndigo,band:hanbokMats.white},'쿵덕쿵덕 곡식을 찧어요');pounder.custom=true;const pestle=new pc.Entity('pestle');old.addChild(pestle);primitive(pestle,'box',wood,0,0,0,.14,1.5,.14);festival.push(['pound',pounder,pestle]);
const porter=villager(-300,200,'지게를 진 나무꾼',['산에서 해 온 나무를 지게에 지고 와요.','이 나무로 아궁이에 불을 때서 밥을 짓고 방을 따뜻하게 해요.','무거운 짐도 지게를 쓰면 등에 지고 옮길 수 있어요.'],'villager','custom',0,{top:hanbokMats.white,band:hanbokMats.white,jige:true},'나무를 해 왔어요');porter.custom=true;festival.push(['walkPath',porter,[[-300,200],[-292,240],[-300,275],[-312,236]]]);
const marshPoly=[[-260,-220],[-110,-240],[25,-184],[110,-75],[76,58],[161,140],[142,215],[46,247],[-83,215],[-110,92],[-177,4],[-227,-90]];let lx=-60,lz=15;for(let k=0;k<400&&inside(lx,lz,marshPoly);k++){lx-=.8;lz+=.62}
const laundry=villager(lx-1.2,lz+.9,'빨래하는 사람',['빨랫방망이로 탁탁 두드려서 빨래를 해요.','물가에 모여 이웃과 이야기를 나누며 빨래하면 금방 끝나요.','빨래가 끝나면 햇볕에 널어 말려요.'],'villager','custom',125,{top:hanbokMats.white,skirt:hanbokMats.skirtBlue,bun:true},'탁탁! 빨래해요');laundry.custom=true;box(old,stone,lx-.4,.3,lz+.3,1.2,.4,.8,35);const bat=new pc.Entity('laundryBat');old.addChild(bat);primitive(bat,'box',wood,0,0,0,.1,.08,.7);festival.push(['launder',laundry,bat,[lx-.4,lz+.3]]);

function lean(p,deg){const r=deg*Math.PI/180;p.group.setLocalEulerAngles(deg,0,0);p.group.setLocalPosition(0,.8*(1-Math.cos(r)),Math.sin(r)*.8)}
function faceTo(p,fx,fz){p.entity.setEulerAngles(0,Math.atan2(-fx,-fz)*180/Math.PI,0)}
function animateFestival(t){if(era!=='old')return;const cam=camera.getPosition();for(const f of festival){const p=Array.isArray(f[1])?f[1][0]:f[1];const ep=p.entity.getPosition();if(Math.abs(ep.x-cam.x)+Math.abs(ep.z-cam.z)>260)continue;const kind=f[0];
 if(kind==='rope'){p.arms.forEach((a,i)=>a.setLocalEulerAngles(-168+Math.sin(t*2+i)*6,0,i?-8:8));p.entity.setPosition(p.x,Math.max(0,Math.sin(t*1.6))*.06,p.z)}
 else if(kind==='pray'){const bow=Math.max(0,Math.sin(t*.9));lean(p,-bow*22);p.arms.forEach((a,i)=>a.setLocalEulerAngles(-62,0,i?-24:24))}
 else if(kind==='wrestle'){const [a,b]=f[1],cx=dano.x-8,cz=dano.z-6,phi=Math.sin(t*.9)*.9+t*.25,push=Math.sin(t*2.3)*.12;const ax=cx+Math.cos(phi)*(.5+push),az=cz+Math.sin(phi)*(.5+push),bx=cx-Math.cos(phi)*(.5-push),bz=cz-Math.sin(phi)*(.5-push);a.entity.setPosition(ax,0,az);b.entity.setPosition(bx,0,bz);faceTo(a,bx-ax,bz-az);faceTo(b,ax-bx,az-bz);for(const w of [a,b]){lean(w,-30-Math.sin(t*2.3)*6);w.arms.forEach((m,i)=>m.setLocalEulerAngles(-95,0,i?-28:28));w.legs.forEach((l,i)=>l.setLocalEulerAngles((i?1:-1)*(14+Math.sin(t*2.3)*8)+30,0,0))}}
 else if(kind==='band'){f[1].forEach((m,i)=>{const a=t*.32-i*.55,r=6.2,cx=dano.x+8,cz=dano.z+4,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;m.entity.setPosition(x,Math.abs(Math.sin(t*4+i))*.08,z);faceTo(m,-Math.sin(a),Math.cos(a));const st=Math.sin(t*4+i);m.legs.forEach((l,j)=>l.setLocalEulerAngles((j?1:-1)*st*24,0,0));m.arms[0].setLocalEulerAngles(-55,0,10);m.arms[1].setLocalEulerAngles(-62+Math.sin(t*9+i)*28,0,-10);if(m.opts.spin)m.opts.spin.setLocalEulerAngles(18*Math.sin(t*3),t*520+i*60,0)})}
 else if(kind==='fan'){const [g,k]=[f[1],f[2]],v=(Math.sin(t*.9)+1)/2;g.arms[1].setLocalEulerAngles(-40-v*45,0,-6);g.arms[0].setLocalEulerAngles(0,0,6);if(g.opts.fanRoot){g.opts.fanRoot.setLocalPosition(.3,1.02+v*.1,-.35-v*.35);g.opts.fanRoot.setLocalEulerAngles(0,0,Math.sin(t*5)*12)}k.arms[0].setLocalEulerAngles(-30-v*50,0,6);k.arms[1].setLocalEulerAngles(-12,0,-6)}
 else if(kind==='wash'){lean(p,-58);p.arms.forEach((a,i)=>a.setLocalEulerAngles(-35+Math.sin(t*3+i)*18,0,i?-12:12))}
 else if(kind==='pound'){const v=(Math.sin(t*3.2)+1)/2;p.arms.forEach((a,i)=>a.setLocalEulerAngles(-70-v*85,0,i?-14:14));f[2].setPosition(p.x,1.2+v*.95,p.z-.75);lean(p,-8+v*6)}
 else if(kind==='walkPath'){const pts=f[2];let L=0;const seg=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);seg.push([a,b,l]);L+=l}let d=(t*1.1)%L;for(const [a,b,l]of seg){if(d<=l){const x=a[0]+(b[0]-a[0])*d/l,z=a[1]+(b[1]-a[1])*d/l;p.entity.setPosition(x,0,z);faceTo(p,b[0]-a[0],b[1]-a[1]);break}d-=l}const st=Math.sin(t*4.2);p.legs.forEach((l,i)=>l.setLocalEulerAngles((i?1:-1)*st*22,0,0));p.arms.forEach((a,i)=>a.setLocalEulerAngles(-35,0,i?-18:18));lean(p,-10)}
 else if(kind==='launder'){lean(p,-42);const v=Math.abs(Math.sin(t*3.4));p.arms[1].setLocalEulerAngles(-40-v*70,0,-8);p.arms[0].setLocalEulerAngles(-40,0,8);f[2].setPosition(f[3][0],.58+v*.45,f[3][1]);f[2].setEulerAngles(0,35,v*30)}
}}
function animateVillage(t){if(era!=='old')return;for(let p of dureWorkers){const v=t*1.8+p.phase,wipe=p.workPose==='wipe'&&Math.sin(t*.55+p.phase)>.1,side=p.workPose==='side';const bend=wipe?-6:side?-28:-52-Math.sin(v)*6;p.group.setLocalEulerAngles(bend,0,0);p.group.setLocalPosition(0,.8*(1-Math.cos(bend*Math.PI/180)),Math.sin(bend*Math.PI/180)*.8);p.arms.forEach((a,i)=>a.setLocalEulerAngles(wipe?(i?145:0):35+Math.sin(v+i)*12,0,wipe?(i?-25:-5):(i?8:-8)));p.legs.forEach((l,i)=>l.setLocalEulerAngles(-bend,0,i?5:-5))}swing.setLocalEulerAngles(Math.sin(t*1.15)*29,0,0);swingChild.arms.forEach((a,i)=>a.setLocalEulerAngles(-130,0,i?15:-15));const angle=Math.sin(t*2.4)*14;boardRoot.setLocalEulerAngles(0,0,angle);boardKids.forEach((p,i)=>{const q=i?1:-1,y=.82+q*2.8*Math.sin(angle*Math.PI/180)+Math.max(0,Math.sin(t*2.4+q*Math.PI/2))*.55;p.entity.setPosition(sx+10+q*2.8,y,sz+8);p.arms.forEach((a,j)=>a.setLocalEulerAngles(0,0,(j?1:-1)*65))});for(const k of kites){const y=17+k.i*4+Math.sin(t*.8+k.i),x=k.x+5+Math.sin(t*.45+k.i)*2,z=k.z-13+Math.cos(t*.4)*1.5;k.root.setPosition(x,y,z);k.root.setEulerAngles(-12,Math.sin(t*.6)*15,Math.sin(t)*9);const a=new pc.Vec3(k.x+.3,1.1,k.z-.3),b=new pc.Vec3(x,y,z),delta=b.clone().sub(a);k.string.setPosition(a.clone().add(b).mulScalar(.5));k.string.setLocalScale(.013,delta.length(),.013);k.string.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,delta.normalize()))}}
// Point lights are pooled: only nearby lamps illuminate the night scene.
const nightPool=[];for(let i=0;i<10;i++){const l=new pc.Entity('pooled-streetlight');l.addComponent('light',{type:'omni',color:new pc.Color(1,.78,.46),intensity:2.4,range:19,castShadows:false,falloffMode:pc.LIGHTFALLOFF_INVERSESQUARED});now.addChild(l);l.enabled=false;nightPool.push(l)}
const moonMaterial=mat('moon','#edf1ff');moonMaterial.useLighting=false;moonMaterial.emissive=new pc.Color(.55,.65,.9);moonMaterial.update();const moon=primitive(shared,'sphere',moonMaterial,-700,1200,-1900,35,35,35);moon.enabled=false;
const stars=new pc.Entity('night-stars');shared.addChild(stars);stars.enabled=false;
const starMaterial=mat('starlight','#e6eeff');starMaterial.useLighting=false;starMaterial.emissive.set(.75,.83,1);starMaterial.update();
let starSeed=991;const starRand=()=>{starSeed=(1664525*starSeed+1013904223)>>>0;return starSeed/4294967296};
for(let i=0;i<180;i++){const az=starRand()*Math.PI*2,elev=.18+starRand()*1.18,r=2600,size=1.7+starRand()*2.3;box(stars,starMaterial,Math.cos(az)*Math.cos(elev)*r,Math.sin(elev)*r,Math.sin(az)*Math.cos(elev)*r,size,size,size)}

const nightOriginalEmissive=new Map();for(const m of Object.values(mats))nightOriginalEmissive.set(m,m.emissive.clone());
function applyLighting(){const night=isNight;daylightButton.textContent=night?'빛: 밤':'빛: 한낮';daylightButton.setAttribute('aria-pressed',night);document.body.classList.toggle('night',night);sun.light.color=night?new pc.Color(.42,.53,.85):new pc.Color(1,.96,.87);sun.light.intensity=night?(era==='now'?.48:.29):1.5;sun.setEulerAngles(night?32:52,night?145:-35,0);app.scene.ambientLight=night?(era==='now'?new pc.Color(.24,.29,.39):new pc.Color(.13,.17,.25)):new pc.Color(.54,.59,.63);useSky(night?'night':'day');app.scene.skyboxIntensity=night?(era==='now'?.75:.5):1;app.scene.exposure=night?1.1:1.0;const sky=night?(era==='now'?new pc.Color(.12,.16,.24):new pc.Color(.09,.12,.19)):new pc.Color(.84,.89,.9);camera.camera.clearColor=sky;app.scene.fog.color=sky;moon.enabled=night;stars.enabled=night;for(const [m,e]of nightOriginalEmissive){m.emissive.copy(night?pc.Color.BLACK:e);m.update()}lampGlow.emissive.set(night?2:0,night?1.5:0,night?.6:0);lampGlow.update();shopGlow.emissive.set(night?.6:0,night?.35:0,night?.13:0);shopGlow.update();moonMaterial.emissive.set(.55,.65,.9);moonMaterial.update();starMaterial.emissive.set(.75,.83,1);starMaterial.update();updateNightLights()}
function updateNightLights(){const active=isNight&&era==='now';if(!active){for(const l of nightPool)if(l.enabled)l.enabled=false;return}let nearby=active?[...lampPositions].sort((a,b)=>Math.hypot(a.x-desired.x,a.z-desired.z)-Math.hypot(b.x-desired.x,b.z-desired.z)):[];nightPool.forEach((l,i)=>{l.enabled=active&&i<nearby.length;if(l.enabled){const p=nearby[i];l.setPosition(p.x,p.y,p.z);l.light.intensity=p.shop?5:4.5;l.light.range=p.shop?25:30}})}

for(const p of lampPositions){const bulb=primitive(now,'box',lampGlow,p.x,p.y+.12,p.z,.55,.065,.23);bulb.render.castShadows=false}
// School motto stone at the lawn/path corner, textured from the supplied photograph.
const monumentPoint=school.point(36,0,60),monument=frame(monumentPoint[0],monumentPoint[2],schoolAngle),mottoRock=surface('mottoRock','#888c7c','soil',1);
const rockOutline=[[-.95,.28],[-.94,1.62],[-.68,2.25],[-.16,2.48],[.47,2.55],[.86,2.18],[1.01,1.3],[.89,.19],[.38,.04],[-.68,.1]];for(let i=0;i<rockOutline.length;i++){const a=rockOutline[i],b=rockOutline[(i+1)%rockOutline.length];solidFace(monument,mottoRock,[[a[0],a[1],.5],[b[0],b[1],.5],[b[0]*.85,b[1],-.42],[a[0]*.85,a[1],-.42]])}monument.sphere(mottoRock,-1.36,.38,0,.8,.42,.6);monument.sphere(mottoRock,1.3,.42,-.05,.8,.5,.62);
const stonePhoto=new Image();stonePhoto.src=window.stoneReference;await stonePhoto.decode();const sc=document.createElement('canvas');sc.width=512;sc.height=640;const sxg=sc.getContext('2d');sxg.scale(512/770,640/930);sxg.translate(-675,-235);sxg.beginPath();[[712,578],[812,357],[1002,273],[1220,245],[1348,287],[1405,460],[1433,794],[1401,1097],[1209,1151],[826,1134],[710,1037]].forEach((p,i)=>i?sxg.lineTo(...p):sxg.moveTo(...p));sxg.closePath();sxg.clip();sxg.drawImage(stonePhoto,0,0);
const st=new pc.Texture(device,{anisotropy:ANISO,width:512,height:640,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,flipY:false}),sr=sxg.getImageData(0,0,512,640).data,sd=st.lock();for(let y=0;y<640;y++)sd.set(sr.subarray((639-y)*2048,(640-y)*2048),y*2048);st.unlock();const sm=mat('mottoPhoto','#ffffff');sm.diffuseMap=st;sm.opacityMap=st;sm.opacityMapChannel='a';sm.alphaTest=.2;sm.cull=pc.CULLFACE_BACK;sm.update();monument.quad(sm,[[-1.05,0,.56],[1.05,0,.56],[1.05,2.55,.56],[-1.05,2.55,.56]],[0,0,1,0,1,1,0,1]);
const flowerPurple=mat('azaleaPurple','#a46b9c');for(let i=0;i<18;i++){const a=i*2.4,x=Math.cos(a)*1.8,z=-.6+Math.sin(a)*.8;monument.sphere(leaf,x,.32,z,.4,.35,.4);if(i%2===0)monument.sphere(flowerPurple,x,.6,z,.14,.08,.14)}
worldLabel('꽃과 노래와 웃음이 있고 · 땀과 애태움이 있는 학교',monumentPoint[0],monumentPoint[2],'now',3.2);
// The northwestern campus rear gate, with two open sculptural stone pillars.
const backGatePoint=mapPoint(66,317),backGate=frame(backGatePoint[0],backGatePoint[2],224),gateConcrete=surface('rearGateConcrete','#c6c8c2','stone',2.2);
backGate.box(asphalt,0,.25,-4,14,.24,43);for(const q of [-1,1]){backGate.box(paversRed,q*11,.24,-4,6,.26,43);backGate.box(curb,q*7.2,.35,-4,.28,.32,43)}
for(let z=-23;z<14;z+=10){arrow(backGate,-3.4,z,1);arrow(backGate,3.4,z,-1)}backGate.box(roadYellow,0,.38,-3,.15,.025,42);
// Each pillar flares outward, with a curved opening and a split upper arm.
for(const q of [-1,1])for(const depth of [-.72,.72]){const profile=[[0,0],[2.7,0],[1.6,3.5],[1.8,5.1],[2.5,6.4],[4.1,7.3],[6.9,8.1],[7.3,10],[3.8,9.1],[.7,8.8],[.25,6.4],[.7,3.6]];
 const shape=profile.map(([x,y])=>[q*(8+x),y,depth]);for(let i=0;i<shape.length;i++){const a=shape[i],b=shape[(i+1)%shape.length];solidFace(backGate,gateConcrete,[[a[0],a[1],depth-.3],[b[0],b[1],depth-.3],[b[0],b[1],depth+.3],[a[0],a[1],depth+.3]])}
 // Polygon surface with concave outline triangulated as a strip between outside and inside edges.
 const outer=shape.slice(0,7),inner=[shape[0],shape[11],shape[10],shape[9],shape[8],shape[7],shape[6]];for(let j=0;j<6;j++)for(const dz of [-.31,.31])solidFace(backGate,gateConcrete,[[outer[j][0],outer[j][1],depth+dz],[outer[j+1][0],outer[j+1][1],depth+dz],[inner[j+1][0],inner[j+1][1],depth+dz],[inner[j][0],inner[j][1],depth+dz]]);
}
backGate.box(stone,19,1.7,-4,10,3.4,6);backGate.box(windowReflect,19,2.1,-.9,8.7,1.75,.1);backGate.box(roofDark,19,3.52,-3.7,11,.35,7);for(let x=15;x<24;x+=2)backGate.box(metal,x,2.1,-.8,.08,1.8,.1);
backGate.box(stone,-20,1.8,0,10,3.6,1.4);wallText(backGate,'부산교육대학교',-20,2,.75,8,.7,'#333f44');
for(let x=-7;x<8;x+=1.3)backGate.box(roadYellow,x,.39,7,.7,.03,3.6);
const rearAnnexPoint=backGate.point(-31,0,-22),rearAnnex=frame(rearAnnexPoint[0],rearAnnexPoint[2],224);
rearAnnex.box(stone,0,7.5,0,23,15,20);for(let x=-10;x<11;x+=2.2)rearAnnex.box([white,urbanSand,urbanBrick][Math.abs(Math.round(x))%3],x,10,10.1,.65,9,.13);for(let y of [2.5,6.5,10.5])for(let x=-9;x<10;x+=3)rearAnnex.box(windowReflect,x,y,10.2,2,1.7,.12);
for(let z=-27;z<=-7;z+=5){backGate.sphere(stoneDark,-18,.65,z,1.3,.6,.8);backGate.sphere(leaf,-22,2.3,z,1.8,2,1.8);bareTree(backGate,-11,z,.9)}
// Low industrial roofs and boundary wall visible across the road outside the rear gate.
backGate.box(asphalt,0,.24,17,90,.24,11);backGate.box(urbanSand,0,1.9,26,85,3.8,.5);backGate.box(urbanPlaster,0,4,37,79,8,18);backGate.box(blueRoof,0,8.1,37,82,.25,20);
for(let x=-35;x<36;x+=8)backGate.box(windowReflect,x,6.5,27.9,4,1.4,.12);
worldLabel('부산교육대학교 후문',backGatePoint[0],backGatePoint[2],'now',11);
// Muddy meadow occupying the identical school footprint in the past.
const schoolMarsh=surface('schoolMarsh','#756c50','soil',3),wildGrass=mat('wildMeadow','#647546');
const wetPatch=(x,z,rx,rz,m,y)=>{const pts=[];for(let k=0;k<24;k++){const a=k*Math.PI/12,r=1+.12*Math.sin(k*2.8),p=school.point(x+Math.cos(a)*rx*r,0,z+Math.sin(a)*rz*r);pts.push([p[0],p[2]])}poly(old,m,pts,y)};
wetPatch(0,46,62,82,schoolMarsh,.13);wetPatch(-16,33,23,13,water,.17);wetPatch(21,70,18,29,water,.18);wetPatch(-28,94,17,16,water,.17);
for(let i=0;i<510;i++){const x=-57+vr()*114,z=-24+vr()*150;if(((x+16)/24)**2+((z-33)/14)**2<1||((x-21)/19)**2+((z-70)/30)**2<1)continue;const p=school.point(x,0,z),h=.3+vr()*.8;for(let k=0;k<3;k++)box(old,k%2?reed:wildGrass,p[0]+k*.09,.15+h/2,p[2],.055,h,.08,(i*37+k*55)%180)}
for(let i=0;i<16;i++){const p=school.point(-30+i*4,0,52+Math.sin(i)*2);ellipsoid(old,schoolMarsh,p[0],.21,p[2],1,.12,.65)}

// Compile meshes once. Each era stays in memory for instant camera-preserving switching.
// Static geometry is split into map cells so frustum culling, shadow culling and distance LOD can skip unseen chunks.
const noShadowMats=new Set(['water','ripple','grass','paddy','contactAO','pavers','concrete','soil','asphalt','lines','windowReflect','dark','white','rooftopMetal','curb','campusChalk','roadYellow','streamWater','cycleRed','campusSand','wellPaving','schoolMarsh','hillside','pathEarth','starlight','eveningShopGlass','lampGlow','mottoPhoto','schoolCrest','whaleMuralPhoto','sculptureSeam','stoneDark','songjukSeam','mud','paversRed','wildMeadow','reed','laneWhite','laneYellow','railSteel','groundTint']);
const detailMats=new Set(['windowReflect','metal','dark','white','rooftopMetal','curb','roadYellow','railSteel','laneYellow']),tinyMats=new Set(['bambooNode','sculptureSeam','lines','campusChalk','stoneDark','songjukSeam','laneWhite','reed','wildMeadow','ripple','bambooSimpleLeaf','pineNeedles']);
const lodChunks=[];
for(const b of buckets.values()){const mesh=new pc.Mesh(device);mesh.setPositions(b.p);mesh.setNormals(b.n);mesh.setUvs(0,b.u);mesh.setIndices(b.i);mesh.update(pc.PRIMITIVE_TRIANGLES);const nm=b.material.name;const ent=new pc.Entity(nm);ent.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,b.material)],castShadows:!noShadowMats.has(nm)&&!nm.startsWith('lettering'),receiveShadows:true});b.parent.addChild(ent);if(b.parent===now||b.parent===old){const aabb=mesh.aabb;const tier=tinyMats.has(nm)||nm.startsWith('lettering')?0:detailMats.has(nm)?1:2;const r=aabb.halfExtents.length();if(r<700)lodChunks.push({ent,c:aabb.center.clone(),r,tier})}}buckets.clear();
let era='now',showLabels=true;let firstPerson=false,isNight=false,runToggle=false;const walker={y:0,vy:0,grounded:true,step:0};let yaw=25,pitch=43,distance=285,target=new pc.Vec3(...school.point(0,0,32));let desired={yaw,pitch,distance,x:target.x,z:target.z};
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',2300)}
function setEra(e){closeSpeech();era=e;document.querySelectorAll('.sceneTabs button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false')});now.enabled=e==='now';old.enabled=e==='old';$('past').classList.toggle('active',e==='old');$('present').classList.toggle('active',e==='now');$('past').setAttribute('aria-pressed',e==='old');$('present').setAttribute('aria-pressed',e==='now');$('eraTitle').textContent=e==='old'?'황새가 찾아오던 한새벌':'오늘날의 우리 동네';$('eraText').innerHTML=e==='old'?'논과 들, 물이 고인 습지와<br>초가가 모여 있는 옛날의 풍경':'학교와 대학, 집과 도로가<br>모여 있는 오늘날의 풍경';applyLighting();walker.y=walkHeight(desired.x,desired.z);walker.vy=0}
$('past').onclick=()=>setEra('old');$('present').onclick=()=>setEra('now');const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));function zoom(f){desired.distance=clamp(desired.distance*f,8,2700)}$('zoomIn').onclick=()=>zoom(.78);$('zoomOut').onclick=()=>zoom(1.28);$('home').onclick=()=>Object.assign(desired,{yaw:0,pitch:53,distance:990,x:0,z:65});$('school').onclick=()=>{Object.assign(desired,{x:school.point(0,0,46)[0],z:school.point(0,0,46)[2],distance:240,pitch:43,yaw:25});toast(era==='old'?'지금 우리 학교가 있는 자리입니다':'우리 학교를 가까이 살펴보세요')};$('top').onclick=()=>{desired.pitch=85;desired.yaw=0};$('names').onclick=()=>{showLabels=!showLabels;$('names').textContent=showLabels?'설명 숨김':'설명 보기';$('names').setAttribute('aria-pressed',showLabels)};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){toast('전체 화면은 F11 키로도 볼 수 있습니다')}};
let selectedPerson=null,meetingIndex={now:0,old:0};
function closeSpeech(){selectedPerson=null;$('speech').hidden=true}
function showLine(p){const line=p.talk[p.line];if(Array.isArray(line)){$('speaker').textContent=line[0];$('speechText').textContent=line[1]}else{$('speaker').textContent=p.name;$('speechText').textContent=line}}
function openSpeech(p,start=0){selectedPerson=p;p.line=start;showLine(p);$('speech').hidden=false;if(firstPerson){document.exitPointerLock?.();return}Object.assign(desired,{x:p.entity.getPosition().x,z:p.entity.getPosition().z,distance:p.viewDist||32,pitch:p.bird?24:18,yaw:p.era==='now'?schoolAngle:p.angle+155});}
$('speechClose').onclick=closeSpeech;$('speechNext').onclick=()=>{if(!selectedPerson)return;selectedPerson.line=(selectedPerson.line+1)%selectedPerson.talk.length;showLine(selectedPerson)};
$('meetPeople').onclick=()=>{const list=people.filter(p=>p.era===era);openSpeech(list[meetingIndex[era]%list.length]);meetingIndex[era]++};
$('magpies').onclick=()=>{closeSpeech();const p=school.point(0,0,28);Object.assign(desired,{x:p[0],z:p[2],distance:36,pitch:30,yaw:0})};
$('college').onclick=()=>{closeSpeech();Object.assign(desired,{x:32,z:180,distance:660,pitch:53,yaw:43})};
$('compare').onclick=()=>$('comparison').showModal();$('closeCompare').onclick=()=>$('comparison').close();

function animatePeople(dt,time){const cam=camera.getPosition();for(let p of people){if(p.era!==era)continue;const ep=p.entity.getPosition(),far=Math.abs(ep.x-cam.x)+Math.abs(ep.z-cam.z)+Math.abs(ep.y-cam.y)>230;p.far=far;if(far||p.custom)continue;const t=time+p.phase;const walk=p.activity==='walk',play=p.activity==='play',wave=p.activity==='wave',farm=p.activity==='farm';let step=p.activity==='wade'?Math.sin(t*.7)*8:walk?Math.sin(t*3.3)*22:play?Math.sin(t*3)*12:0;for(let i=0;i<2;i++){p.legs[i].setLocalEulerAngles((i?1:-1)*step,0,0);p.arms[i].setLocalEulerAngles((i?-1:1)*step,0,wave&&i===1?125+Math.sin(t*3)*13:(i?1:-1)*(play?35+Math.sin(t*2)*18:7))}if(p.activity==='wade')p.entity.setPosition(p.x+Math.sin(t*.35)*.12,-.1,p.z+Math.cos(t*.35)*.12);if(walk){p.entity.setPosition(p.x+Math.sin(t*.45)*1.2,0,p.z+Math.cos(t*.45)*.9)}p.group.setLocalEulerAngles(farm?-13-Math.sin(t*1.8)*10:0,0,0);p.group.setLocalPosition(0,play?Math.abs(Math.sin(t*2))*.07:0,0)}if(era==='now')ballRoot.setPosition(ballPoint[0]+Math.sin(time*1.3)*1.1,.1+Math.abs(Math.sin(time*2.6))*.45,ballPoint[2])}
const bubbleScreen=new pc.Vec3(),bubblePos=new pc.Vec3();
function updateBubbles(){const cp=camera.getPosition(),cw=canvas.clientWidth||innerWidth,ch=canvas.clientHeight||innerHeight,occupied=[];const list=bubbles.map(b=>{const ep=b.target.entity.getPosition();return{b,ep,d:Math.hypot(ep.x-cp.x,ep.z-cp.z,ep.y-cp.y)}}).sort((a,c)=>(c.b.prio-a.b.prio)||(a.d-c.d));for(const {b,ep,d}of list){let show=showLabels&&b.era===era&&d<b.max*(firstPerson?1:1.25);let w=0,h=0;if(show){bubblePos.set(ep.x,ep.y+b.dy,ep.z);camera.camera.worldToScreen(bubblePos,bubbleScreen);bubbleScreen.x+=b.sx;w=Math.min(214,b.el.textContent.length*14+28);h=b.el.textContent.length>14?58:36;show=bubbleScreen.z>0&&bubbleScreen.x>40&&bubbleScreen.x<cw-40&&bubbleScreen.y>60&&bubbleScreen.y<ch-60&&(b.prio>=2||!occupied.some(r=>Math.abs(r.x-bubbleScreen.x)<(r.w+w)/2+4&&Math.abs(r.y-bubbleScreen.y)<(r.h+h)/2+2))}b.el.style.display=show?'block':'none';if(show){occupied.push({x:bubbleScreen.x,y:bubbleScreen.y-h/2,w,h});b.el.style.left=bubbleScreen.x+'px';b.el.style.top=bubbleScreen.y+'px';b.el.style.opacity=String(Math.min(1,(b.max*1.25-d)/12+.2));if(b.person)b.person.pin.style.display='none'}}}
const aerialNames=new Set(['운동장에서 만난 학생','건물 앞 학생','교생선생님 1','교생선생님 2','논에서 일하는 농부','물을 나르는 마을 사람','뻘에서 만난 사람','금줄을 치는 아버지','농악대 상쇠(꽹과리)']);const personScreen=new pc.Vec3();
function updatePeoplePins(){const cw=canvas.clientWidth||innerWidth,ch=canvas.clientHeight||innerHeight;for(let p of people){let pos=p.entity.getPosition();p.pos.set(pos.x,pos.y+p.height+.3,pos.z);camera.camera.worldToScreen(p.pos,personScreen);const camP=camera.getPosition(),pd=Math.hypot(pos.x-camP.x,pos.z-camP.z);let active=p.era===era&&(firstPerson?pd<70:pd<420)&&personScreen.z>0&&personScreen.x>5&&personScreen.x<cw-85&&personScreen.y>150&&personScreen.y<ch-110; // Filter distant clusters to keep the aerial view readable.
if(!firstPerson&&distance>350){active=active&&aerialNames.has(p.name)}if(active){p.pin.style.display='block';p.pin.style.left=personScreen.x+'px';p.pin.style.top=personScreen.y+'px'}else p.pin.style.display='none'}}
// Direct body clicking supplements the explicit speech markers; drags never trigger speech.
let tapStart=null;canvas.addEventListener('pointerdown',e=>{if(e.button===0)tapStart={x:e.clientX,y:e.clientY,id:e.pointerId}});canvas.addEventListener('pointerup',e=>{if(!tapStart||tapStart.id!==e.pointerId||Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>5){tapStart=null;return}tapStart=null;if(pointers.size>1)return;let nearest=null,best=24;for(let p of people){if(p.era!==era||p.pin.style.display==='none')continue;const pos=p.entity.getPosition();camera.camera.worldToScreen(new pc.Vec3(pos.x,pos.y+p.height*.6,pos.z),personScreen);const d=Math.hypot(personScreen.x-e.clientX,personScreen.y-e.clientY);if(personScreen.z>0&&d<best){nearest=p;best=d}}if(nearest)openSpeech(nearest)});canvas.addEventListener('pointercancel',()=>tapStart=null);

const pointers=new Map();let pinch=0;canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('pointerdown',e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});pinch=0});function pan(dx,dy){let a=desired.yaw*Math.PI/180,s=desired.distance*.0011;desired.x=clamp(desired.x+(-dx*Math.cos(a)+dy*Math.sin(a))*s,-1500,1500);desired.z=clamp(desired.z+(dx*Math.sin(a)+dy*Math.cos(a))*s,-1350,1450)}
canvas.addEventListener('pointermove',e=>{let prev=pointers.get(e.pointerId);if(!prev)return;const dx=e.clientX-prev.x,dy=e.clientY-prev.y;if(firstPerson){desired.yaw-=dx*.2;desired.pitch=clamp(desired.pitch+dy*.16,-80,80);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:prev.button});return}let panMode=prev.button===2||e.shiftKey;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:prev.button});if(pointers.size===2){let [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0)zoom(pinch/Math.max(d,1));pinch=d;pan(dx*.5,dy*.5)}else if(panMode)pan(dx,dy);else{desired.yaw-=dx*.25;desired.pitch=clamp(desired.pitch+dy*.19,9,85)}});for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{pointers.delete(e.pointerId);pinch=0});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-180,180)*.0015))},{passive:false});const heldKeys=new Set();
const touchKeys=new Set();function setTouchVisible(show){$('touchMove').classList.toggle('shown',show);document.body.classList.toggle('touchControls',show);$('touchToggle').setAttribute('aria-pressed',show);if(!show)touchKeys.clear()}
setTouchVisible(window.matchMedia('(pointer: coarse), (max-width: 1200px)').matches);
$('touchToggle').onclick=()=>setTouchVisible(!$('touchMove').classList.contains('shown'));
for(const button of document.querySelectorAll('[data-move]')){const code=button.dataset.move;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touchKeys.add(code);button.classList.add('pressed')});const stop=()=>{touchKeys.delete(code);button.classList.remove('pressed')};for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,stop)}
window.addEventListener('blur',()=>touchKeys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)touchKeys.clear()});
$('well').onclick=()=>{closeSpeech();Object.assign(desired,{x:wellX,z:wellZ,distance:era==='old'?68:15,pitch:era==='old'?43:27,yaw:0})};
$('dyke').onclick=()=>{closeSpeech();if(era!=='old')setEra('old');Object.assign(desired,{x:dykeX,z:dykeZ,distance:45,pitch:30,yaw:75})};

const moveCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight','Space','KeyF'];
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;if(e.code==='Space'&&!e.repeat){e.preventDefault();jump()}if(e.code==='KeyF'&&!e.repeat)talkNearby();if(moveCodes.includes(e.code)){e.preventDefault();heldKeys.add(e.code)}if(e.code==='Equal'||e.code==='NumpadAdd'){e.preventDefault();zoom(.9)}if(e.code==='Minus'||e.code==='NumpadSubtract'){e.preventDefault();zoom(1.1)}});
window.addEventListener('keyup',e=>heldKeys.delete(e.code));window.addEventListener('blur',()=>heldKeys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)heldKeys.clear()});
function orbitKeyboardMove(dt){if(document.querySelector('dialog[open]')){heldKeys.clear();touchKeys.clear();return}const down=(...keys)=>keys.some(k=>heldKeys.has(k)||touchKeys.has(k));let forward=Number(down('KeyW','ArrowUp'))-Number(down('KeyS','ArrowDown')),right=Number(down('KeyD','ArrowRight'))-Number(down('KeyA','ArrowLeft'));const len=Math.hypot(forward,right)||1;const speed=clamp(desired.distance*.22,8,150)*(down('ShiftLeft','ShiftRight')?2:1)*Math.min(dt,.05);let angle=desired.yaw*Math.PI/180;if(forward||right){desired.x=clamp(desired.x+(-Math.sin(angle)*forward+Math.cos(angle)*right)/len*speed,-1500,1500);desired.z=clamp(desired.z+(-Math.cos(angle)*forward-Math.sin(angle)*right)/len*speed,-1350,1450)}desired.yaw+=(Number(down('KeyQ'))-Number(down('KeyE')))*60*Math.min(dt,.05)}

let teleportArmed=false;
const teleportGesture=teleportSupport.createGesture(),teleportPointers=new Set(),teleportDrag=new Map();let teleportPinch=0;
function setTeleportArmed(active){
 teleportArmed=active;teleportGesture.reset();teleportDrag.clear();teleportPinch=0;
 for(const id of teleportPointers){if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}teleportPointers.clear();
 document.body.classList.toggle('teleport-mode',active);$('teleport').setAttribute('aria-pressed',String(active));$('teleport').textContent=active?'순간 이동: 켜짐':'순간 이동';
 if(active){document.exitPointerLock?.();for(const id of pointers.keys()){if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}pointers.clear();pinch=0;tapStart=null;heldKeys.clear();touchKeys.clear();closeSpeech();toast('짧게 누르면 이동, 드래그하면 둘러보기. Esc 또는 버튼으로 끌 수 있어요.')}
}
function teleportToScreen(clientX,clientY){
 const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return false;
 const pixelX=(clientX-rect.left)*device.clientRect.width/rect.width,pixelY=(clientY-rect.top)*device.clientRect.height/rect.height;
 const origin=camera.getPosition().clone(),rayPoint=camera.camera.screenToWorld(pixelX,pixelY,1,new pc.Vec3()),direction=rayPoint.sub(origin).normalize();
 const hit=teleportSupport.pickGround(origin,direction,(x,z)=>walkHeight(x,z),camera.camera.farClip);
 if(!hit){toast('이동할 수 있는 바닥을 선택해 주세요.');return false}if(firstPerson){const y=walker.y;walker.y=walkHeight(hit.x,hit.z);const solid=blocked(hit.x,hit.z);walker.y=y;if(solid){toast('건물 밖의 길이나 운동장을 골라 주세요.');return false}}
 // Commit both the displayed and desired state, bypassing camera easing for this one action.
 closeSpeech();heldKeys.clear();touchKeys.clear();desired.x=hit.x;desired.z=hit.z;if(!firstPerson){desired.yaw=yaw;desired.pitch=pitch;desired.distance=distance;}
 target.x=hit.x;target.y=hit.y;target.z=hit.z;
 const a=yaw*Math.PI/180,b=pitch*Math.PI/180;camera.setPosition(target.x+distance*Math.cos(b)*Math.sin(a),target.y+distance*Math.sin(b),target.z+distance*Math.cos(b)*Math.cos(a));camera.lookAt(target);
 if(firstPerson){walker.y=walkHeight(hit.x,hit.z);walker.vy=0;walker.grounded=true;placeFirstPerson()}toast('이동했어요. 다른 바닥을 누르면 또 이동해요.');return true;
}
$('teleport').onclick=()=>setTeleportArmed(!teleportArmed);
// A tap teleports; a mouse or touch drag rotates without disarming teleport.
canvas.addEventListener('pointerdown',e=>{
 if(!teleportArmed)return;e.preventDefault();e.stopImmediatePropagation();
 if(e.button!==0&&e.button!==2)return;
 canvas.focus();teleportPointers.add(e.pointerId);teleportGesture.down(e.pointerId,e.clientX,e.clientY);teleportDrag.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,dragging:e.button===2,button:e.button});teleportPinch=0;canvas.setPointerCapture(e.pointerId);
},{capture:true,passive:false});
canvas.addEventListener('pointermove',e=>{
 if(!teleportArmed)return;const p=teleportDrag.get(e.pointerId);if(!p)return;e.preventDefault();e.stopImmediatePropagation();teleportGesture.move(e.pointerId,e.clientX,e.clientY);
 if(!p.dragging&&Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>8)p.dragging=true;
 const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
 if(teleportDrag.size===2){const [a,b]=[...teleportDrag.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(teleportPinch>0&&!firstPerson)zoom(teleportPinch/Math.max(d,1));teleportPinch=d;return}
 if(p.dragging){desired.yaw-=dx*(firstPerson?.2:.25);desired.pitch=clamp(desired.pitch+dy*(firstPerson?.16:.19),firstPerson?-80:9,firstPerson?80:85)}
},{capture:true,passive:false});
canvas.addEventListener('pointerup',e=>{
 if(!teleportArmed)return;e.preventDefault();e.stopImmediatePropagation();const p=teleportDrag.get(e.pointerId);
 const valid=teleportGesture.up(e.pointerId,e.clientX,e.clientY)&&p&&!p.dragging&&p.button===0;teleportDrag.delete(e.pointerId);teleportPointers.delete(e.pointerId);teleportPinch=0;
 if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 if(valid)teleportToScreen(e.clientX,e.clientY);
},{capture:true,passive:false});
for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(!teleportArmed)return;teleportGesture.cancel(e.pointerId);teleportPointers.delete(e.pointerId);teleportDrag.delete(e.pointerId);teleportPinch=0;e.stopImmediatePropagation();},{capture:true});
window.addEventListener('keydown',e=>{if(teleportArmed&&e.code==='Escape'){setTeleportArmed(false);e.preventDefault()}});
window.addEventListener('blur',()=>setTeleportArmed(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setTeleportArmed(false)});

// Kinematic first person walking uses the same terrain in both eras.
function schoolLocal(x,z){const a=schoolAngle*Math.PI/180,dx=x-schoolOrigin.x,dz=z-schoolOrigin.z;return {x:dx*Math.cos(a)-dz*Math.sin(a),z:dx*Math.sin(a)+dz*Math.cos(a)}}
function walkHeight(x,z){let h=Math.max(0,hillHeight(x,z));if(era==='now'){h=Math.max(h,.42);const ka=(schoolAngle+90)*Math.PI/180,kx=(x-kp[0])*Math.cos(ka)-(z-kp[2])*Math.sin(ka),kz=(x-kp[0])*Math.sin(ka)+(z-kp[2])*Math.cos(ka);if(kx>-19.5&&kx<-12.5&&kz>=12&&kz<=26.4)h=Math.max(h,.22+Math.min(25,Math.max(0,Math.floor((26.27-kz)/.55)))*.19);if(kx>-19.5&&kx<-12.5&&kz>9.2&&kz<12)h=Math.max(h,5.03);const p=schoolLocal(x,z);if(p.x>=-13.5&&p.x<=16.3&&p.z>=87.45&&p.z<=93.82){const k=Math.max(0,Math.min(10,Math.floor((p.z-87.49)/.57)));h=Math.max(h,.5+k*.28)}if(p.x>=-13.5&&p.x<=16.3&&p.z>93.4&&p.z<104)h=Math.max(h,3.3)}else if(x>-354&&x<-316&&z>-91&&z<-60)h=Math.max(h,.64);return h}
function blocked(x,z){for(const b of solidBoxes){if(b.era!=='both'&&b.era!==era)continue;if(walker.y+1.55<b.y-b.h/2||walker.y+.28>b.y+b.h/2)continue;const a=b.angle*Math.PI/180,dx=x-b.x,dz=z-b.z,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);if(Math.abs(lx)<b.w/2+.25&&Math.abs(lz)<b.d/2+.25)return true}return false}
function keyboardMove(dt){if(!firstPerson){orbitKeyboardMove(dt);return}if(document.querySelector('dialog[open]')){heldKeys.clear();touchKeys.clear();return}dt=Math.min(dt,.05);const down=(...keys)=>keys.some(k=>heldKeys.has(k)||touchKeys.has(k)),forward=Number(down('KeyW','ArrowUp'))-Number(down('KeyS','ArrowDown')),right=Number(down('KeyD','ArrowRight'))-Number(down('KeyA','ArrowLeft')),len=Math.hypot(forward,right)||1,speed=(down('ShiftLeft','ShiftRight')||runToggle?8.5:4.3)*dt,a=desired.yaw*Math.PI/180,dx=(-Math.sin(a)*forward+Math.cos(a)*right)*speed/len,dz=(-Math.cos(a)*forward-Math.sin(a)*right)*speed/len;
 function axis(x,z){const g=walkHeight(x,z);if(g-walker.y>.36||blocked(x,z))return false;desired.x=x;desired.z=z;return true}
 if(forward||right){axis(clamp(desired.x+dx,-1500,1500),desired.z);axis(desired.x,clamp(desired.z+dz,-1350,1450));walker.step+=dt*(speed/dt)}
 desired.yaw+=(Number(down('KeyQ'))-Number(down('KeyE')))*80*dt;
 const floor=walkHeight(desired.x,desired.z);walker.vy-=20*dt;walker.y+=walker.vy*dt;if(walker.y<=floor){walker.y=floor;walker.vy=0;walker.grounded=true}else walker.grounded=false;
}
function jump(){if(firstPerson&&walker.grounded&&!document.querySelector('dialog[open]')){walker.vy=7.2;walker.grounded=false}}
function placeFirstPerson(){const a=desired.yaw*Math.PI/180,b=desired.pitch*Math.PI/180;const bob=walker.grounded&&[...heldKeys,...touchKeys].some(k=>['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k))?Math.sin(walker.step*2)*.025:0;camera.setPosition(desired.x,walker.y+1.58+bob,desired.z);camera.lookAt(desired.x-Math.sin(a)*Math.cos(b),walker.y+1.58+bob-Math.sin(b),desired.z-Math.cos(a)*Math.cos(b));target.set(desired.x,walker.y,desired.z)}
function setFirstPerson(value){firstPerson=value;heldKeys.clear();touchKeys.clear();runToggle=false;$('runButton').setAttribute('aria-pressed','false');document.body.classList.toggle('first-person',value);$('firstPerson').textContent=value?'시점: 1인칭':'시점: 둘러보기';$('firstPerson').setAttribute('aria-pressed',value);camera.camera.nearClip=value?.06:.5;camera.camera.fov=value?65:46;desired.pitch=value?0:38;if(value){walker.y=walkHeight(desired.x,desired.z);walker.vy=0;walker.grounded=true;if(blocked(desired.x,desired.z)){let found=false;for(let r=2;r<50&&!found;r+=2)for(let j=0;j<16;j++){const x=desired.x+Math.cos(j*Math.PI/8)*r,z=desired.z+Math.sin(j*Math.PI/8)*r;if(!blocked(x,z)){desired.x=x;desired.z=z;walker.y=walkHeight(x,z);found=true;break}}}placeFirstPerson();toast('WASD 이동 · Shift 달리기 · Space 점프 · F 대화. 화면을 드래그해 둘러보세요.')}else{document.exitPointerLock?.();desired.distance=65}}
function talkNearby(){const origin=camera.getPosition();let nearest=null,best=7;for(const p of people){if(p.era!==era)continue;const d=p.entity.getPosition().distance(origin);if(d<best){best=d;nearest=p}}if(nearest)openSpeech(nearest);else toast('사람에게 조금 더 가까이 다가가 보세요.')}
$('firstPerson').onclick=()=>setFirstPerson(!firstPerson);
$('jumpButton').addEventListener('pointerdown',e=>{e.preventDefault();jump()});
$('runButton').onclick=()=>{runToggle=!runToggle;$('runButton').setAttribute('aria-pressed',runToggle)};
$('talkButton').onclick=talkNearby;
$('lookButton').onclick=()=>{if(!firstPerson)setFirstPerson(true);setTeleportArmed(false);try{const p=canvas.requestPointerLock?.();p?.catch(()=>toast('화면을 드래그해서 둘러볼 수 있어요.'))}catch{toast('화면을 드래그해서 둘러볼 수 있어요.')}};
document.addEventListener('mousemove',e=>{if(firstPerson&&document.pointerLockElement===canvas){desired.yaw-=e.movementX*.16;desired.pitch=clamp(desired.pitch+e.movementY*.14,-80,80)}});
canvas.addEventListener('pointerup',e=>{if(firstPerson&&document.pointerLockElement===canvas&&e.button===0)talkNearby()});
window.addEventListener('blur',()=>{runToggle=false;$('runButton').setAttribute('aria-pressed','false')});
// Existing fly-to viewpoints retain their overview behaviour; walking stops explicitly enter first person.
for(const id of ['home','school','top','college','magpies','well','dyke'])$(id).addEventListener('click',()=>{if(firstPerson)setFirstPerson(false)},true);
const activities=document.createElement('select');activities.id='activityVisit';activities.setAttribute('aria-label','체험할 장소');activities.innerHTML='<option value="">걸어서 체험하기</option><option value="entrance">정문에서 거리 보기</option><option value="stairs">벽화와 오른쪽 계단 보기</option><option value="bamboo">대나무숲 길 걷기</option><option value="dure">두레와 김매기</option><option value="games">옛날 어린이 놀이</option>';
document.querySelector('.meet').append(activities);
activities.onchange=()=>{const key=activities.value;if(!key)return;let p,heading;if(key==='entrance'){setEra('now');p=gateStreet.point(0,0,6);heading=262}else if(key==='stairs'){setEra('now');p=school.point(6,0,83);heading=schoolAngle+180}else if(key==='bamboo'){setEra('now');p=[...schoolPath[0]];p=[p[0],0,p[1]];heading=Math.atan2(p[0]-schoolPath[1][0],p[2]-schoolPath[1][1])*180/Math.PI}else if(key==='dure'){setEra('old');p=[-326,0,-59];heading=0}else{setEra('old');p=[playCentre.x+3,0,playCentre.z+25];heading=0}desired.x=p[0];desired.z=p[2];desired.yaw=heading;setFirstPerson(true);activities.value=''};

// Dedicated, repeatable scene shortcuts. Each switches era and takes the viewer close to people.
function visitScene(key){closeSpeech();setTeleportArmed(false);const specs={oldPlay:{era:'old',p:[playCentre.x+3,0,playCentre.z+25],yaw:0},nowPlay:{era:'now',p:school.point(9,0,57),yaw:schoolAngle},oldWork:{era:'old',p:[-333,0,-89],yaw:180},court:{era:'now',p:civic.point(3,0,51),yaw:43},rear:{era:'now',p:backGate.point(0,0,19),yaw:224},stone:{era:'now',p:monument.point(0,0,5),yaw:schoolAngle},hall:{era:'now',p:kkachi.point(0,0,44),yaw:schoolAngle+90}};const v=specs[key];if(!v)return;setEra(v.era);desired.x=v.p[0];desired.z=v.p[2];desired.yaw=v.yaw;setFirstPerson(true);if(key==='stone'){desired.pitch=7;placeFirstPerson()}document.querySelectorAll('.sceneTabs button').forEach(b=>{b.classList.toggle('active',b.id===key);b.setAttribute('aria-pressed',String(b.id===key))});toast('도착했어요. 친구나 사람의 말풍선을 누르면 이야기할 수 있어요.');}
for(const id of ['oldPlay','nowPlay','oldWork'])$(id).onclick=()=>visitScene(id);
const photoVisits=document.createElement('select');photoVisits.id='photoVisit';photoVisits.setAttribute('aria-label','새로 살펴볼 장소');photoVisits.innerHTML='<option value="">장소 바로 보기</option><option value="hall">까치관과 계단</option><option value="stone">학교 교훈석</option><option value="rear">부산교대 후문</option><option value="court">법원 직원 만나기</option>';document.querySelector('.meet').append(photoVisits);photoVisits.onchange=()=>{visitScene(photoVisits.value);photoVisits.value=''};
// Moving traffic keeps to the right-hand lanes of the traced streets.
const traffic=[];
function makeRoute(pts,lanes,y,count,speed){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));const total=cum[cum.length-1];for(let k=0;k<count;k++){const e=new pc.Entity('car');now.addChild(e);const m=carM[(k+traffic.length)%4];primitive(e,'box',m,0,.82,0,1.9,1.05,4.4);primitive(e,'box',windowReflect,0,1.58,.25,1.66,.62,2.3);primitive(e,'box',m,0,1.9,.25,1.6,.06,2.1);for(const q of [-1,1]){primitive(e,'box',lampGlow,q*.62,.9,-2.21,.4,.18,.04);primitive(e,'box',red,q*.66,.95,2.21,.36,.16,.04)}primitive(e,'box',black,0,.38,0,1.95,.36,3.6);const dir=k%2?1:-1;traffic.push({e,pts,cum,total,s:(k/count)*total+rnd()*20,dir,lane:lanes[Math.floor(k/2)%lanes.length],y,speed:speed*(.8+rnd()*.4)})}}
makeRoute(roadByName('중앙대로').pts,[5.6,9.4],.24,12,13);makeRoute(campusRoute,[2.5],.33,4,7);for(const [n,l,c,v] of [['미남로',3.5,4,9],['법원북로',3.5,4,9],['명륜로',3.5,4,10],['여고로',3,2,8],['캠퍼스동쪽길',2.5,2,7]]){const r=roadByName(n);if(r)makeRoute(r.pts,[l],.24,c,v)}
function animateTraffic(dt){if(era!=='now')return;const cam=camera.getPosition();for(const c of traffic){c.s=(c.s+c.speed*dt*c.dir+c.total)%c.total;let i=1;while(i<c.cum.length-1&&c.cum[i]<c.s)i++;const a=c.pts[i-1],b=c.pts[i],t=(c.s-c.cum[i-1])/(c.cum[i]-c.cum[i-1]||1),L=c.cum[i]-c.cum[i-1]||1;let fx=(b[0]-a[0])/L*c.dir,fz=(b[1]-a[1])/L*c.dir;const x=a[0]+(b[0]-a[0])*t-fz*c.lane,z=a[1]+(b[1]-a[1])*t+fx*c.lane;c.e.setPosition(x,c.y,z);c.e.setEulerAngles(0,Math.atan2(-fx,-fz)*180/Math.PI,0)}}
const screen=new pc.Vec3();let lastLabels=0,lodTimer=1,perfFrames=0,perfTime=0,perfGood=0,perfNotice=false;let animationTime=0;app.on('update',dt=>{keyboardMove(dt);animateTraffic(dt);animationTime+=dt;animatePeople(dt,animationTime);animateMagpies(animationTime);animateWell(animationTime);animateVillage(animationTime);animateFestival(animationTime);animateSchoolKids(animationTime);let f=1-Math.exp(-dt*10);yaw+=(desired.yaw-yaw)*f;pitch+=(desired.pitch-pitch)*f;distance+=(desired.distance-distance)*f;target.x+=(desired.x-target.x)*f;target.z+=(desired.z-target.z)*f;target.y+=(Math.max(0,hillHeight(target.x,target.z))-target.y)*f;const a=yaw*Math.PI/180,b=pitch*Math.PI/180;camera.setPosition(target.x+distance*Math.cos(b)*Math.sin(a),target.y+distance*Math.sin(b),target.z+distance*Math.cos(b)*Math.cos(a));camera.lookAt(target);if(firstPerson)placeFirstPerson();{const fd=firstPerson?0:distance;app.scene.fog.start=(isNight?120:220)+fd*.55;app.scene.fog.end=app.scene.fog.start+(isNight?1900:3000)+fd*.6}$('north').style.transform=`rotate(${-yaw}deg)`;lodTimer+=dt;if(lodTimer>.25){lodTimer=0;updateNightLights();const cp=camera.getPosition(),lim=[firstPerson?260:450,fine?1700:(firstPerson?600:900),3200];for(const c of lodChunks){const d=Math.hypot(c.c.x-cp.x,c.c.y-cp.y,c.c.z-cp.z)-c.r,on=d<lim[c.tier];if(c.ent.enabled!==on)c.ent.enabled=on}sun.light.shadowDistance=firstPerson?(fine?320:220):clamp(distance*1.5+200,300,fine?2200:1500)}
perfFrames++;perfTime+=dt;if(perfTime>3){const fps=perfFrames/perfTime;perfFrames=0;perfTime=0;if(!fine&&fps<24&&perfScale>.7&&!document.hidden){perfScale=Math.round((perfScale-.15)*100)/100;quality();if(!perfNotice){perfNotice=true;toast('움직임이 부드럽도록 화질을 자동으로 조절했어요')}}else if(!fine&&fps>55&&perfScale<1.25){perfGood++;if(perfGood>3){perfGood=0;perfScale=Math.min(1.25,perfScale+.15);quality()}}else perfGood=0}
lastLabels+=dt;if(lastLabels>.05){lastLabels=0;updatePeoplePins();updateBubbles();const occupied=[];for(let l of [...labels].sort((a,b)=>a.pos.distance(target)-b.pos.distance(target))){camera.camera.worldToScreen(l.pos,screen);const width=Math.min(260,l.el.textContent.length*12+20);let visible=showLabels&&l.era===era&&screen.z>0&&screen.x>width/2+12&&screen.x<innerWidth-width/2-110&&screen.y>190&&screen.y<innerHeight-140&&!occupied.some(r=>Math.abs(r.x-screen.x)<(r.w+width)/2+6&&Math.abs(r.y-screen.y)<36);l.el.style.display=visible?'block':'none';if(visible){occupied.push({x:screen.x,y:screen.y,w:width});l.el.style.left=screen.x+'px';l.el.style.top=screen.y+'px'}}}});
// Useful fixed views make individual buildings inspectable on a touch screen.
const buildingStops=[['학교 앞쪽',school,0,6,110,43],['벽화 쪽',gaenari,0,10,75,133],['파란 건물 쪽',parang,0,10,85,133],['학교 뒤쪽',kkachi,0,21,82,133],['옆 건물 쪽',songjuk,0,10,80,-47],['잔디 마당',school,0,39,160,25],['모래 마당',school,-2,74,110,43]];
const visit=document.createElement('select');visit.id='buildingVisit';visit.setAttribute('aria-label','건물 가까이 보기');visit.innerHTML='<option value="">건물 가까이 보기</option>'+buildingStops.map((v,i)=>`<option value="${i}">${v[0]}</option>`).join('');document.querySelector('.meet').append(visit);visit.onchange=()=>{if(visit.value==='')return;if(firstPerson)setFirstPerson(false);closeSpeech();setEra('now');const [name,f,x,z,d,y]=buildingStops[Number(visit.value)],p=f.point(x,0,z);Object.assign(desired,{x:p[0],z:p[2],distance:d,pitch:25,yaw:y});visit.value='';toast(name+' 외관을 살펴보세요')};
const cityButton=document.createElement('button');cityButton.textContent='도시 전경';cityButton.onclick=()=>{closeSpeech();Object.assign(desired,{x:X(625),z:Z(630),distance:600,pitch:48,yaw:20})};document.querySelector('.tools').insertBefore(cityButton,$('school'));
const daylightButton=document.createElement('button');daylightButton.id='dayNight';daylightButton.textContent='빛: 한낮';daylightButton.onclick=()=>{isNight=!isNight;applyLighting()};document.querySelector('.tools').append(daylightButton);

const qualityButton=document.createElement('button');let fine=innerWidth>1200&&!matchMedia('(pointer: coarse)').matches;let perfScale=1.25;function quality(){device.maxPixelRatio=Math.min(devicePixelRatio,fine?1.8:perfScale);sun.light.shadowResolution=fine?4096:(perfScale<1?1024:2048);sun.light.numCascades=fine?3:(perfScale<.9?1:2);sun.light.shadowType=fine?pc.SHADOW_PCF5_32F:pc.SHADOW_PCF3_32F;app.resizeCanvas();qualityButton.textContent=fine?'화질: 정밀':'화질: 기본'}qualityButton.onclick=()=>{fine=!fine;quality()};document.querySelector('.tools').append(qualityButton);quality();

const nearby=document.createElement('select');nearby.id='nearbyVisit';nearby.setAttribute('aria-label','동네 둘러보기');nearby.innerHTML='<option value="">동네 둘러보기</option><option value="hill">언덕</option><option value="station">역 주변</option><option value="stream">하천</option>';document.querySelector('.meet').append(nearby);nearby.onchange=()=>{if(firstPerson)setFirstPerson(false);const key=nearby.value;if(!key)return;closeSpeech();if(key!=='hill')setEra('now');const p=contextSites[key];Object.assign(desired,{x:p.x,z:p.z,distance:key==='hill'?410:key==='neighbourhood'?280:key==='stream'?380:320,pitch:46,yaw:20});nearby.value=''};
cityButton.onclick=()=>{if(firstPerson)setFirstPerson(false);closeSpeech();Object.assign(desired,{x:180,z:220,distance:1300,pitch:58,yaw:43})};

const campusVisit=document.createElement('select');campusVisit.id='campusVisit';campusVisit.setAttribute('aria-label','대학과 길 자세히 보기');campusVisit.innerHTML='<option value="">대학과 길 자세히 보기</option>'+Object.entries(detailStops).map(([key,p])=>`<option value="${key}">${p.name}</option>`).join('');document.querySelector('.meet').append(campusVisit);campusVisit.onchange=()=>{if(firstPerson)setFirstPerson(false);const stop=detailStops[campusVisit.value];if(!stop)return;closeSpeech();setEra('now');Object.assign(desired,stop);campusVisit.value='';toast(stop.name+'을 살펴보세요')};
app.start();$('loading').classList.add('hidden');window.timeTravel={app,people,orbit:(x,z,d,p,y)=>Object.assign(desired,{x,z,distance:d,pitch:p,yaw:y}),look:(y,p)=>{desired.yaw=y;desired.pitch=p},schoolPoint:(x,z)=>school.point(x,0,z),sites:{birthHome,dano,dyke:[dykeX,dykeZ],station:railStationPos,metro:metroPos},visitScene,setEra,setFirstPerson,teleportToScreen,setTeleportArmed,jump,walkHeight,visit:(x,z)=>{desired.x=x;desired.z=z;walker.y=walkHeight(x,z);walker.vy=0},getState:()=>({era,device:device.deviceType,desired:{...desired},meshes:now.children.length+old.children.length,people:people.length,terrainShared:shared.enabled!==false,schoolLayout:{yard:yardSpec,kkachiFacing:schoolAngle+90,main:school.point(0,0,0),kkachi:kp,parang:bp,songjuk:sp,playground:school.point(0,0,43)},graphicsRevision:'r9-sky-env-lod-traced-roads',roadCount:realRoads.length,trafficCars:traffic.length,festivalActors:festival.length,bubbles:bubbles.length,trafficSide:'right',rearGateLocation:backGatePoint,monumentLocation:monumentPoint,durePoses:dureWorkers.map(p=>({pose:p.workPose,bend:p.group.getLocalEulerAngles().x,talk:p.talk[0]})),nightAmbient:app.scene.ambientLight.toString(),crestSource:'user-photo',songjukFacade:'blue-orange-yellow-green',starCount:180,vegetationRevision:'simple-open-jointed-bamboo',firstPerson,isNight,walker:{...walker},nightLights:lampPositions.length,dureWorkers:dureWorkers.length,schoolPath,muralWall:school.point(23,0,94),terraceStairBounds:{minX:-13.5,maxX:16.3},playCentre,teleportArmed,wellHuts,mapAnchors,riverRoute,trainees:trainees.length,universityBuildings,detailStops,campusRoute,textOrientation:'bottom-up RGBA with outward-only faces',contextSites,characterStyle:'block',magpies:magpies.length,wellLocation:{x:wellX,z:wellZ},dykeLocation:{x:dykeX,z:dykeZ},textureUpload:'ImageBitmap'})};
}
