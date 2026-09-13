
'use strict';
const $=id=>document.getElementById(id);


function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;const fail=()=>{if(done)return;done=true;clearTimeout(timer);s.remove();reject(new Error('엔진 다운로드 실패'))};const timer=setTimeout(fail,20000);s.src=url;s.onload=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};s.onerror=fail;document.head.append(s)})}
(async()=>{try{await main()}catch(e){console.error(e);$('loadText').textContent='장면을 열지 못했습니다. Chrome 또는 Edge에서 다시 열어 주세요. '+e.message}})();
async function main(){
const canvas=$('view');const device=await pc.createGraphicsDevice(canvas,{deviceTypes:[pc.DEVICETYPE_WEBGPU,pc.DEVICETYPE_WEBGL2],antialias:true,powerPreference:'high-performance'});
const app=new pc.Application(canvas,{graphicsDevice:device});device.maxPixelRatio=Math.min(window.devicePixelRatio,1.6);app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);app.setCanvasResolution(pc.RESOLUTION_AUTO);window.addEventListener('resize',()=>app.resizeCanvas());
$('gpu').textContent=device.deviceType==='webgpu'?'WebGPU':'WebGL2';
app.scene.ambientLight=new pc.Color(.54,.59,.63);app.scene.exposure=1.03;app.scene.fog.type='linear';app.scene.fog.color=new pc.Color(.69,.78,.81);app.scene.fog.start=1300;app.scene.fog.end=4600;
const camera=new pc.Entity('camera');camera.addComponent('camera',{clearColor:new pc.Color(.69,.78,.81),fov:46,nearClip:.5,farClip:6500,toneMapping:pc.TONEMAP_ACES});app.root.addChild(camera);
const sun=new pc.Entity('sun');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.96,.87),intensity:1.5,castShadows:true,shadowDistance:900,shadowResolution:2048,shadowBias:.045,normalOffsetBias:.12,numCascades:3});sun.setEulerAngles(52,-35,0);app.root.addChild(sun);
const now=new pc.Entity('today'),old=new pc.Entity('past'),shared=new pc.Entity('landscape');app.root.addChild(now);app.root.addChild(old);app.root.addChild(shared);old.enabled=false;
let seed=819;function rnd(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}const rand=(a,b)=>a+rnd()*(b-a);function col(hex){return new pc.Color().fromString(hex)}
const mats={};function mat(name,color,gloss=5){let m=new pc.StandardMaterial();m.name=name;m.diffuse=col(color);m.gloss=gloss/100;m.specular=new pc.Color(.16,.16,.16);m.update();mats[name]=m;return m}
const grass=mat('grass','#6c7d47'),soil=mat('soil','#998565'),asphalt=mat('asphalt','#596063'),walk=mat('concrete','#b1aea2'),white=mat('white','#e2dfcc'),wall=mat('wall','#d4cfbd'),roof=mat('roof','#67928b'),glass=mat('glass','#577b88',75),dark=mat('dark','#343f3e'),wood=mat('wood','#67513a'),leaf=mat('leaf','#466440'),leaf2=mat('leaf2','#607844'),reed=mat('reed','#8b944f'),water=mat('water','#6c9995',90),thatch=mat('thatch','#9d895a'),mud=mat('mud','#c1ad85'),black=mat('black','#272c29'),red=mat('red','#ad4c36'),lines=mat('lines','#e8e5d6'),paddy=mat('paddy','#768c49');water.metalness=.25;water.useMetalness=true;water.update();
// Material atlases supply fine surface detail without local image loading restrictions.
function texture(material,kind){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle=material.diffuse.toString(false);x.fillRect(0,0,256,256);for(let i=0;i<6500;i++){let v=Math.floor(rand(75,205));x.fillStyle=`rgba(${v},${v},${v},${rand(.04,.20)})`;x.fillRect(rand(0,256),rand(0,256),rand(1,4),rand(1,4))}if(kind==='grass'){for(let i=0;i<1200;i++){x.strokeStyle=rnd()<.5?'#83945570':'#42533380';x.beginPath();let a=rand(0,256),b=rand(0,256);x.moveTo(a,b);x.lineTo(a+rand(-3,3),b-rand(2,8));x.stroke()}}if(kind==='roof'){x.strokeStyle='#32453c66';for(let i=0;i<256;i+=12){x.fillStyle='#c7d6bc28';x.fillRect(i,0,3,256);x.fillStyle='#203b3745';x.fillRect(i+4,0,1,256)}}if(kind==='thatch'){for(let i=0;i<900;i++){x.strokeStyle=rnd()<.5?'#d1ba7a90':'#604d2c70';x.beginPath();let a=rand(0,256),b=rand(0,256);x.moveTo(a,b);x.lineTo(a+rand(-7,7),b+rand(8,45));x.stroke()}}const t=new pc.Texture(device,{width:256,height:256,mipmaps:true});t.setSource(c);material.diffuseMap=t;material.diffuse.set(1,1,1);material.update()}
texture(grass,'grass');texture(soil,'soil');texture(asphalt,'soil');texture(roof,'roof');texture(thatch,'thatch');texture(mud,'soil');texture(paddy,'grass');
// Aggregate static geometry per material and era to keep draw calls modest.
const buckets=new Map();function geom(parent,material,pos,norm,uv,idx){const k=parent.name+material.name;let b=buckets.get(k);if(!b){b={parent,material,p:[],n:[],u:[],i:[]};buckets.set(k,b)}const off=b.p.length/3;b.p.push(...pos);b.n.push(...norm);b.u.push(...uv);for(const n of idx)b.i.push(n+off)}
function box(parent,m,x,y,z,w,h,d,angle=0){let p=[],n=[],u=[],i=[];let a=angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);const faces=[[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],[[0,1,0],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]],[[0,-1,0],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],[[0,0,1],[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]],[[0,0,-1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]]];for(const [normal,verts]of faces){let off=p.length/3;for(let j=0;j<4;j++){let v=verts[j],vx=v[0]*w/2,vz=v[2]*d/2;p.push(x+vx*ca+vz*sa,y+v[1]*h/2,z-vx*sa+vz*ca);n.push(normal[0]*ca+normal[2]*sa,normal[1],-normal[0]*sa+normal[2]*ca);{const faceU=normal[0]?d:w,faceV=normal[1]?d:h,sc=m._meterScale||0,uv=[[0,0],[1,0],[1,1],[0,1]][j];u.push(uv[0]*(sc?faceU/sc:1),uv[1]*(sc?faceV/sc:1))}}i.push(off,off+1,off+2,off,off+2,off+3)}geom(parent,m,p,n,u,i)}
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
 const t=new pc.Texture(device,{width:512,height:512,mipmaps:true});t.setSource(c);m.diffuseMap=t;m.diffuse.set(1,1,1);m._meterScale=scale;m.update();return m;
}
const urbanPlaster=surface('urbanPlaster','#d6d2c5','stone',5),urbanBrick=surface('urbanBrick','#a9674e','brick',5),urbanSand=surface('urbanSand','#c7b999','stone',5),urbanGray=surface('urbanGray','#a5b4b2','stone',5),roofMembrane=surface('roofMembrane','#719d90','roof',7),roofDark=surface('roofDark','#4c6670','roof',6),pavers=surface('pavers','#b7b4a6','paver',6),paversRed=surface('paversRed','#a16e5c','paver',5),windowReflect=surface('windowReflect','#527d8e','glass',0),curb=surface('curb','#d8d9ce','stone',4),rooftopMetal=surface('rooftopMetal','#bec4c3','roof',3);
const urbanWalls=[urbanPlaster,urbanBrick,urbanSand,urbanGray];
// Radial contact shade is a low-cost baked-style ambient occlusion decal.
const aoCanvas=document.createElement('canvas');aoCanvas.width=aoCanvas.height=128;const ag=aoCanvas.getContext('2d'),ar=ag.createRadialGradient(64,64,6,64,64,64);ar.addColorStop(0,'rgba(21,35,31,.40)');ar.addColorStop(.57,'rgba(21,35,31,.20)');ar.addColorStop(1,'rgba(21,35,31,0)');ag.fillStyle=ar;ag.fillRect(0,0,128,128);const aoTex=new pc.Texture(device,{width:128,height:128,mipmaps:true});aoTex.setSource(aoCanvas);const contactAO=mat('contactAO','#26372c');contactAO.opacityMap=aoTex;contactAO.opacityMapChannel='a';contactAO.blendType=pc.BLEND_NORMAL;contactAO.depthWrite=false;contactAO.update();
function contact(x,z,w,d,angle=0,y=.15){const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);let p=[];for(const [xx,zz]of [[-w/2,-d/2],[-w/2,d/2],[w/2,d/2],[w/2,-d/2]])p.push(x+xx*c+zz*s,y,z-xx*s+zz*c);geom(now,contactAO,p,[0,1,0,0,1,0,0,1,0,0,1,0],[0,0,0,1,1,1,1,0],[0,1,2,0,2,3])}

grass._meterScale=14;soil._meterScale=18;asphalt._meterScale=8;roof._meterScale=9;
// Dappled, directional leaf clusters instead of a single flat foliage colour.
for(const [m,base]of [[leaf,'#466745'],[leaf2,'#698050']]){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,256,256);for(let i=0;i<1800;i++){g.save();g.translate(rand(0,256),rand(0,256));g.rotate(rand(0,6.28));g.fillStyle=['#b8c17b55','#253e3470','#76975866','#8ca95c80'][i%4];g.beginPath();g.ellipse(0,0,rand(1.2,4),rand(2,7),0,0,6.283);g.fill();g.restore()}const t=new pc.Texture(device,{width:256,height:256,mipmaps:true});t.setSource(c);m.diffuseMap=t;m.diffuse.set(1,1,1);m.update()}
function tree(parent,x,z,s=1){
 box(parent,wood,x,2.5*s,z,.38*s,5*s,.38*s);
 const variants=[leaf,leaf2],main=variants[rnd()<.5?0:1];
 // Irregular clumped crowns with smaller edge foliage retain tree silhouettes at aerial scale.
 for(let i=0;i<9;i++){const a=i*2.399,rr=(i?1.7:0)*s,cx=x+Math.cos(a)*rr,cz=z+Math.sin(a)*rr,cy=(5.4+Math.sin(i*1.9)*1.1)*s;ellipsoid(parent,i%3?main:variants[1],cx,cy,cz,(1.65+rnd()*.35)*s,(1.9+rnd()*.65)*s,(1.6+rnd()*.35)*s,9,6)}
 if(parent===now)contact(x,z,8*s,8*s,0,.18);
}
// Map-image coordinates are kept common to both eras (illustrative metre scale).
const X=u=>(u-619)*.85,Z=v=>(v-460)*.85;
function mapPoint(u,v){return [32+(u-565)*.46,0,130+(v-485)*.46]}
const mapAnchors={school:[375,833],hall:[354,756],field:[566,491],island:[765,789],museum:[1001,759],sculpture:[962,539],gate:[1193,625],well:[1280,380]};
const riverRoute=[[827,-450],[849,-240],[858,-80],[861,110],[875,270],[904,445],[963,625],[1034,820]];

box(shared,grass,0,-2,100,3800,4,3300);
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
const roadNetwork=[[[[0,700],[372,565],[625,334],[955,215],[1240,55]],16],[[[191,0],[88,90],[88,405],[322,409],[420,667],[560,920]],13],[[[538,920],[675,901],[949,674],[1238,712]],19],[[[705,0],[818,325],[971,666]],12],[[[1040,0],[1102,370],[1180,919]],27],[[[1140,0],[1177,360],[1190,665]],20]];
for(const [points,width]of roadNetwork){for(let j=1;j<points.length;j++){const a=[X(points[j-1][0]),Z(points[j-1][1])],b=[X(points[j][0]),Z(points[j][1])];contextRoad(curb,a,b,width+4,.10)}road(points,width)}
function nearRoad(u,v,r){const x=X(u),z=Z(v);return roadNetwork.some(([pts,w])=>pts.slice(1).some((b,i)=>{const a=pts[i],ax=X(a[0]),az=Z(a[1]),dx=X(b[0])-ax,dz=Z(b[1])-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-ax-dx*t,z-az-dz*t)<w/2+r}))}
// Neighbourhood blocks follow the street density of the reference, outside the campus.
function reservedRoute(x,z){const pts=[[321,194],[410,205],[535,222],[650,246]];return pts.slice(1).some((b,i)=>{const a=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<35})}
function reservedCampus(x,z){return inside(x,z,[[0,310],[427,-100],[1105,453],[1193,625],[760,1120],[270,1020],[-100,590]].map(([u,v])=>{const a=mapPoint(u,v);return[a[0],a[2]]}))}
function reservedContext(x,z){return reservedCampus(x,z)||reservedRoute(x,z)||(x>162&&x<542&&z>285&&z<719)||(x>-425&&x<-260&&z>-280&&z<-110)||Math.hypot(x-585,z-210)<55||Math.hypot(x-361,z-82)<18}
function inSchoolArea(x,z){const o=mapPoint(375,833),dx=x-o[0],dz=z-o[2],a=43*Math.PI/180,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);return lx>-80&&lx<86&&lz>-65&&lz<128}

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
for(let j=0;j<72;j++){let v=j*13;box(now,lines,X(1040+v*.15),.23,Z(v),.24,.025,4,-8)}
const carM=[mat('carBlue','#436575',55),mat('carSilver','#b9bebb',60),mat('carWhite','#eeeae0',65),mat('carRed','#81524b',55)];for(let j=0;j<37;j++){let v=rand(30,870),u=1040+v*.15+(j%2?8:-8),x=X(u),z=Z(v);box(now,carM[j%4],x,.8,z,1.9,1.2,4.4,-8);box(now,glass,x,1.55,z,1.65,.65,2.1,-8)}
label('부산교육대학교',605,468,23,'now');
// Older landscape: wet lowland, winding channels, cultivated plots and a small village.
poly(old,water,[[-260,-220],[-110,-240],[25,-184],[110,-75],[76,58],[161,140],[142,215],[46,247],[-83,215],[-110,92],[-177,4],[-227,-90]],.15);

for(let j=0;j<8;j++)for(let i=0;i<5;i++){let x=-445+i*55,z=-350+j*69;if(x>-235&&z<240)continue;box(old,soil,x,.26,z,51,.5,64);box(old,rnd()<.5?paddy:water,x,.53,z,47,.12,59);for(let r=0;r<11;r++)box(old,paddy,x-21+r*4.1,.66,z,1,.3,57)}
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
function patternMaterial(m,type){const c=document.createElement('canvas');c.width=c.height=512;let g=c.getContext('2d');g.fillStyle=m.diffuse.toString(false);g.fillRect(0,0,512,512);if(type==='brick'){for(let row=0;row<32;row++)for(let k=-1;k<17;k++){g.fillStyle=['#98614e','#ac735a','#8f5b4c','#a96c53'][(row+k+17)%4];g.fillRect(k*32+(row%2)*16+1,row*16+1,30,14)}m.diffuseMapTiling=new pc.Vec2(8,2)}else{g.strokeStyle='#78837f70';g.lineWidth=1;for(let n=0;n<=512;n+=64){g.beginPath();g.moveTo(n,0);g.lineTo(n,512);g.moveTo(0,n);g.lineTo(512,n);g.stroke()}}const tex=new pc.Texture(device,{width:512,height:512,mipmaps:true});tex.setSource(c);m.diffuseMap=tex;m.diffuse.set(1,1,1);m.update()}
patternMaterial(brick,'brick');patternMaterial(stone,'stone');glass.diffuseMap=windowReflect.diffuseMap;glass.diffuse.set(1,1,1);glass.gloss=.72;glass.update();grass._meterScale=14;soil._meterScale=18;asphalt._meterScale=8;roof._meterScale=9;walk.diffuseMap=pavers.diffuseMap;walk.diffuse.set(1,1,1);walk._meterScale=8;walk.update();
function frame(x,z,angle){const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);const point=(xx,yy,zz)=>[x+xx*c+zz*s,yy,z-xx*s+zz*c];return{point,box:(m,xx,yy,zz,w,h,d)=>{let p=point(xx,yy,zz);box(now,m,...p,w,h,d,angle)},sphere:(m,xx,yy,zz,rx,ry,rz)=>{let p=point(xx,yy,zz);ellipsoid(now,m,...p,rx,ry,rz)},quad:(m,corners,uv)=>{let p=[],n=[];for(let q of corners){p.push(...point(...q));n.push(s,0,c)}geom(now,m,p,n,uv,[0,1,2,0,2,3])}}}
async function photoMaterial(name,index){const im=new Image();im.src=referencePhotos[index].src;await im.decode();const bitmap=await createImageBitmap(im,{imageOrientation:'flipY',premultiplyAlpha:'none'});const tex=new pc.Texture(device,{width:bitmap.width,height:bitmap.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false});tex.setSource(bitmap);const m=mat(name,'#ffffff',8);m.diffuseMap=tex;m.emissiveMap=tex;m.emissive=new pc.Color(.12,.12,.12);m.cull=pc.CULLFACE_BACK;m.update();return m}
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
function photoPine(x,z,s=1){tube(school,wood,[x,.4,z],[x+.6*s,7.8*s,z],.24*s);for(let j=0;j<5;j++){let yy=(6.1+j*.63)*s,xx=x+(j%2?1.25:-.9)*s; tube(school,wood,[x+.4*s,yy-.8,z],[xx,yy,z+(j%3-1)*.8*s],.12*s);school.sphere(j%2?leaf:leaf2,xx,yy,z+(j%3-1)*.8*s,2.5*s,.83*s,1.8*s)}}
for(let z=17;z<=62;z+=7.3)photoPine(42,z,.95+(z%3)*.045);
for(let z=17;z<64;z+=1.55)school.sphere(leaf,42,.9,z,1.5,.65,1.08);
const bambooStem=mat('bambooStem','#768c55');for(let i=0;i<90;i++){let x=55.5+(i%5)*1.65,z=9+Math.floor(i/5)*3.1,hh=7+(i%7)*.35;tube(school,bambooStem,[x,.35,z],[x-.5,hh,z+.3],.05);if(i%2===0)school.sphere(leaf2,x,hh-1,z,1.1,2,1.1)}
function shelter(x,z){for(let q of [-1,1])for(let r of [-1,1])school.box(wood,x+q*1.55,1.7,z+r*1.1,.12,2.8,.12);for(let row=0;row<12;row++){school.box(wood,x, .65+row*.18,z-1.1,3.2,.115,.1);for(let q of [-1,1])school.box(wood,x+q*1.55,.65+row*.18,z,.1,.115,2.2)}school.box(wood,x,.62,z,3.1,.14,2.2);for(let q of [-1,1])for(let k=0;k<12;k++){let xx=q*(k+.5)*1.8/12,yy=3.6-Math.abs(xx)*.5;school.box(roofDark,x+xx,yy,z,.18,.12,2.7)}}
for(let z of [20,30.5,41,51.5]){shelter(-40.5,z);const p=school.point(-43.2,0,z-2);tree(now,p[0],p[2],.72)}
// White low fence and hedges separate grass from the sand play space.
for(let x=-37;x<=37;x+=1.5){tube(school,white,[x,.45,64],[x,1.45,64],.035);if(x<37){tube(school,white,[x,.83,64],[x+1.5,.83,64],.026);tube(school,white,[x,1.1,64],[x+1.5,1.1,64],.026)}for(let i=0;i<2;i++){let cx=x+.35+i*.65;for(let k=0;k<8;k++){let a=k/8*Math.PI*2,b=(k+1)/8*Math.PI*2;tube(school,white,[cx+Math.cos(a)*.2,1.21+Math.sin(a)*.21,64],[cx+Math.cos(b)*.2,1.21+Math.sin(b)*.21,64],.017)}}}
for(let x=-37;x<=37;x+=1.4)if(x<-17||x>18)school.sphere(leaf,x,.85,63,.95,.52,.66);
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
for(let k=0;k<11;k++)school.box(stone,7,.4+k*.14,87.8+k*.57,41,.2+k*.28,.62);
for(let x of [-12,1,15,27]){tube(school,metal,[x,.55,87],[x,1.5,87],.035);tube(school,metal,[x,1.5,87],[x,3.1,94.4],.035);tube(school,metal,[x,3.1,94.4],[x,2.2,94.4],.035)}
for(let x of [-9,3,16]){tube(school,metal,[x,2,98],[x,4.2,98],.045);const cm=x<0?red:x<10?bluePanel:orangePanel;for(let i=0;i<8;i++){let a=i*6.283/8,b=(i+1)*6.283/8;const pts=[[x,4.5,98],[x+Math.cos(b)*3.2,3.65,98+Math.sin(b)*3.2],[x+Math.cos(a)*3.2,3.65,98+Math.sin(a)*3.2]].map(p=>school.point(...p));geom(now,cm,pts.flat(),[0,1,0,0,1,0,0,1,0],[.5,.5,0,0,1,0],[0,1,2])}}
const lawnPos=school.point(0,0,38.5),sandPos=school.point(-2,0,74.7);worldLabel('잔디운동장',lawnPos[0],lawnPos[2],'now',2);worldLabel('모래운동장',sandPos[0],sandPos[2],'now',2);

function canopy(f,x,z,len){for(let k=-len/2;k<=len/2;k+=4)f.box(wood,x+k,1.6,z+1.7,.12,3.2,.12);for(let k=0;k<8;k++){let zz=-1.9+k*.55,yy=3.1+Math.sqrt(Math.max(0,4-zz*zz))*.27;f.box(roof,x,yy,z+zz,len,.07,.58)}for(let k=-len/2;k<=len/2;k+=2)f.box(metal,x+k,3.55,z,.055,.055,4.1)}
// Continuous L-shaped school canopy emitted below.
// Gaenari: white three-storey block and the actual whale mural mapped to the end wall.
const gp=school.point(37,0,86),gaenari=frame(gp[0],gp[2],schoolAngle+90);
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
songjuk.box(white,0,6.4,0,46,12.8,13);songjuk.box(roof,0,12.97,0,47,.34,14);
for(let floor=0;floor<3;floor++)for(let x=-20;x<=20;x+=4.4){let y=2.3+floor*4.1;songjuk.box(stone,x,y,6.65,3.35,2.55,.16);songjuk.box(glass,x,y,6.79,3.05,2.24,.09);songjuk.box(white,x,y,6.86,.09,2.3,.1);songjuk.box(white,x,y-.4,6.86,3.12,.09,.1)}
for(let y of [4.2,8.3,12.7])songjuk.box(stone,0,y,6.7,46,.33,.28);songjuk.box(greenPanel,0,2,6.8,4.5,4,.25);canopy(songjuk,0,9,46);sign(songjuk,'송죽관',0,14,6.9,12,1.4);
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
for(let k=0;k<18;k++){const z=25.3-k*.51,top=.22+k*.18;kkachi.box(stone,-16,top/2,z,7,top,.55);for(let x of [-19.9,-12.1])kkachi.box(brick,x,(top+.7)/2,z,.65,top+.7,.56)}
for(let x of [-19.9,-12.1])tube(kkachi,stone,[x,1.02,25.3],[x,4.05,16.1],.08);
for(let z=-17;z<18;z+=4.4){kkachi.box(windowReflect,12.58,4.8,z,.1,4.8,2.8);kkachi.box(stone,12.72,4.8,z-1.45,.2,6.2,.25)}
// Brick retaining beds beside the stairs and the end-of-main-building glazed stairwell.
for(let z of [15,19,23]){kkachi.box(brick,-21,.7,z,2,1.4,3);kkachi.sphere(leaf,-21,1.8,z,1.3,.65,1.5)}
for(let row=0;row<4;row++){const y=2.3+row*4.45;school.sphere(windowReflect,43.4,y,-3,1.5,1.9,2.1);school.box(stone,43.7,y+1.95,-3,2.9,.25,4.1)}
const approach=frame(kp[0],kp[2],schoolAngle+90);approach.box(asphalt,0,.1,37,57,.2,19);for(let x=-23;x<25;x+=3.1)approach.box(orangePanel,x,.22,35,1.5,.035,4.7);
sign(kkachi,'까치관',1,9.8,20.5,10,1);

// University roof topology: transverse wings, connecting corridors, courts and formal landscaping.
// Transverse university wings are authored below.

// Main field boundary and small parking rows, emitted on modern ground only.

// Reusable people models: actual-sized meshes with enlarged, accessible talk targets.
const people=[];function primitive(parent,type,m,x,y,z,sx,sy,sz){const e=new pc.Entity(type);e.addComponent('render',{type,castShadows:true});e.render.material=m;e.setLocalPosition(x,y,z);e.setLocalScale(sx,sy,sz);parent.addChild(e);return e}
function makePerson(eraKey,x,z,name,talk,kind='student',activity='stand',angle=0){let e=new pc.Entity('person-'+people.length);(eraKey==='now'?now:old).addChild(e);e.setPosition(x,0,z);e.setEulerAngles(0,angle,0);const child=kind==='student'||kind==='child',height=child?1.48:1.72,s=height/1.65;const group=new pc.Entity('body');e.addChild(group);group.setLocalScale(s,s,s);let cloth=kind==='trainee'?skyShirt:kind==='student'?skyShirt:kind==='farmer'?creamCloth:kind==='water'?indigoCloth:creamCloth;primitive(group,'box',skin,0,1.49,0,.34,.34,.34);primitive(group,'box',hair,0,1.66,.025,.36,.12,.36);primitive(group,'box',cloth,0,1.05,0,.43,.55,.27);for(let side of [-1,1]){primitive(group,'box',white,side*.082,1.53,-.175,.08,.055,.012);primitive(group,'box',dark,side*.071,1.53,-.185,.035,.045,.014)}primitive(group,'box',brownCloth,0,1.4,-.18,.11,.035,.014);const legs=[];for(let a of [-1,1]){let pivot=new pc.Entity('leg');group.addChild(pivot);pivot.setLocalPosition(a*.105,.8,0);if(kind==='wader'){primitive(pivot,'box',brownCloth,0,-.15,0,.15,.31,.17);primitive(pivot,'box',creamCloth,0,-.3,0,.18,.095,.19);primitive(pivot,'box',skin,0,-.47,0,.13,.3,.14);primitive(pivot,'box',skin,0,-.66,-.07,.15,.09,.26)}else{primitive(pivot,'box',child?navy:brownCloth,0,-.31,0,.145,.62,.16);primitive(pivot,'box',child?white:wood,0,-.68,-.055,.17,.1,.29);}legs.push(pivot)}const arms=[];for(let a of [-1,1]){let pivot=new pc.Entity('arm');group.addChild(pivot);pivot.setLocalPosition(a*.25,1.23,0);primitive(pivot,'box',kind==='student'?navy:cloth,0,-.14,0,.14,.3,.15);primitive(pivot,'box',skin,0,-.39,0,.105,.3,.12);arms.push(pivot)}if(kind==='student'){primitive(group,'box',navy,0,1.23,-.125,.16,.1,.035);primitive(group,'box',navy,0,1.11,-.126,.06,.2,.03);for(let side of [-1,1])primitive(group,'box',white,side*.27,1.12,-.073,.032,.26,.018);primitive(group,'box',greenPanel,-.1,1.08,-.135,.06,.07,.015)}else{primitive(group,'box',wood,0,.89,-.13,.36,.045,.04);if(kind==='farmer'){primitive(group,'box',thatch,0,1.77,0,.65,.2,.65);primitive(group,'cylinder',wood,.37,.6,-.15,.04,1.2,.04);primitive(group,'box',dark,.37,.05,-.25,.25,.07,.27)}if(kind==='water'){primitive(group,'box',mud,.37,1.07,0,.36,.45,.36);primitive(group,'cylinder',dark,.37,1.29,0,.22,.025,.22)}if(kind==='child')primitive(group,'box',hair,0,1.7,.03,.12,.15,.12)}
const pin=document.createElement('button');pin.className='personPin';pin.textContent='⋯';pin.setAttribute('aria-label',name+' 이야기 듣기');$('labels').append(pin);const p={entity:e,group,legs,arms,pin,name,talk,era:eraKey,x,z,activity,angle,height,phase:people.length*.8,pos:new pc.Vec3(x,height+1,z),line:0};people.push(p);pin.onclick=()=>openSpeech(p);return p}
function schoolPerson(lx,lz,name,talk,activity='stand'){const p=school.point(lx,0,lz);return makePerson('now',p[0],p[2],name,talk,'student',activity,schoolAngle)}
schoolPerson(-8,46,'운동장에서 만난 학생',['우리 학교에 온 걸 환영해요!','빨간 벽돌 건물에서 친구들과 함께 공부해요.','지금 내가 서 있는 자리는 옛날에 어떤 모습이었을까요?'],'wave');
schoolPerson(7,48,'공놀이하는 학생',['저는 점심시간이 좋아요! 밥을 먹고 친구들과 놀 수 있거든요.','친구와 공을 주고받으며 놀고 있어요.','옛날 아이들도 친구들과 노는 걸 좋아했을까요?'],'play');
schoolPerson(11,51,'친구와 노는 학생',['내가 공을 보낼게. 준비됐지?','우리 같이 놀자! 친구와 함께하면 더 재미있어.'],'play');
schoolPerson(-25,73,'놀이기구 옆 학생',['친구 차례가 끝나면 철봉에 매달려 볼 거예요.','옛날에도 이렇게 생긴 놀이기구가 있었을까요?'],'wave');
schoolPerson(27,21,'교실로 가는 학생',['친구야, 이제 교실로 돌아가자!','하늘색과 남색 활동복을 입으면 움직이기 편해요.'],'walk');
const blueFront=parang.point(0,0,12);makePerson('now',blueFront[0],blueFront[2],'건물 앞 학생',['파란 외벽과 주황색 테두리가 보이나요?','저쪽 벽에는 커다란 고래 그림도 있어요.'],'student','wave',schoolAngle+90);
const ballPoint=school.point(9,0,50);const ballRoot=new pc.Entity('ball');now.addChild(ballRoot);primitive(ballRoot,'sphere',white,0,.2,0,.4,.4,.4);ballRoot.setPosition(ballPoint[0],0,ballPoint[2]);
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
for(let i=0;i<5;i++){const lp=[[-13,28],[-10,30],[5,23],[18,32],[20,28]][i],wp=school.point(lp[0],0,lp[1]);const bird=new pc.Entity('magpie-'+i);now.addChild(bird);bird.setPosition(wp[0],.48,wp[2]);bird.setEulerAngles(0,i*71+15,0);const body=new pc.Entity('magpieBody');bird.addChild(body);
primitive(body,'sphere',black,0,.35,0,.29,.38,.47);primitive(body,'sphere',white,0,.28,-.04,.25,.27,.32);primitive(body,'sphere',black,0,.61,-.22,.24,.24,.26);primitive(body,'box',dark,0,.59,-.4,.07,.055,.21);
for(let side of [-1,1]){primitive(body,'sphere',magpieBlue,side*.135,.39,.055,.11,.3,.36);primitive(body,'sphere',white,side*.16,.46,-.04,.08,.17,.18);primitive(body,'cylinder',dark,side*.073,.09,0,.025,.22,.025);primitive(body,'box',dark,side*.073,0,-.035,.045,.022,.15);primitive(body,'sphere',white,side*.108,.64,-.25,.018,.018,.018)}
const tail=primitive(body,'box',magpieBlue,0,.26,.43,.17,.05,.61);tail.setLocalEulerAngles(-14,0,0);magpies.push({entity:bird,body,x:wp[0],z:wp[2],phase:i*1.6})}
function animateMagpies(t){if(era!=='now')return;for(let b of magpies){const v=t*.8+b.phase,hop=Math.max(0,Math.sin(v*4))*.095;b.entity.setPosition(b.x+Math.sin(v)*.5,.48+hop,b.z+Math.cos(v)*.35);b.body.setLocalEulerAngles(Math.sin(v*2)> .65?24:0,0,0)}}

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
const dykeX=838,dykeZ=35;
for(let i=1;i<riverRoute.length;i++)segment(old,water,riverRoute[i-1],riverRoute[i],34,.16);
for(let i=0;i<20;i++){const z=dykeZ-65+i*7,xc=858+(z+80)*3/190,x=xc-22;box(old,soil,x,1.1,z,7,2.2,7.3);box(old,soil,x,2.25,z,3.8,.2,7.3);for(let k=0;k<4;k++)ellipsoid(old,stoneDark,x+3,.45+k*.25,z-2+k*1.4,.55,.42,.55,8,4)}

for(let i=0;i<7;i++)ellipsoid(old,soil,dykeX+7+i*.75,.45,dykeZ+8+rand(-2,2),.9,.6,1);
const dykeWorkers=[];for(let i=0;i<3;i++){const worker=makePerson('old',dykeX+i*.6,dykeZ+i*3.3,'둑을 쌓는 마을 사람 '+(i+1),i===0?['동래천에 둑을 쌓고 있어요. 물이 자주 넘쳐서 살림과 농사가 힘들었어요.','둑을 쌓아서 늪처럼 축축한 땅에 물이 덜 넘치게 하고, 농사짓기 좋은 땅으로 바꾸려고 해요.','흙을 나르고 단단하게 다지려면 여러 사람의 힘이 필요해요.']:['이쪽으로 흙을 더 날라 주세요! 흙과 돌을 모아 둑을 높여야 해요.','우리가 함께 만든 둑이 마을과 들을 지켜 주면 좋겠어요.'],'farmer','farm',-70);worker.entity.setPosition(worker.x,2.3,worker.z);dykeWorkers.push(worker);primitive(worker.group,'box',wood,.15,1.08,.29,.45,.55,.25)}
function worldLabel(text,x,z,eraKey,y=3){if(eraKey==='now')return;let el=document.createElement('div');el.className='label';el.textContent=text;$('labels').append(el);labels.push({el,pos:new pc.Vec3(x,y,z),era:eraKey})}
worldLabel('우물가',wellX,wellZ,'old',3);worldLabel('둑 쌓는 곳',dykeX,dykeZ,'old',5);
function animateWell(t){if(era!=='old')return;const lift=(Math.sin(t*.85)+1)*.6;bucketRoot.setPosition(wellX+.1,.3+lift,wellZ+.1);bucketRope.setLocalPosition(wellX+.1,1.15+lift*.5,wellZ+.1);bucketRope.setLocalScale(.026,Math.max(.1,1.7-lift),.026);drawingWater.arms[0].setLocalEulerAngles(-45-Math.sin(t*.85)*23,0,-12);drawingWater.arms[1].setLocalEulerAngles(-45-Math.sin(t*.85)*23,0,12);wellStork.setPosition(wellX-2.3+Math.sin(t*.23)*.5,.1,wellZ+2+Math.cos(t*.23)*.4)}

// Photograph-guided additions to the existing school volumes.
function wallText(f,text,x,y,z,w,h,color='#214c76',bg=null){
 if(!/^(어린이|보호구역|20|30|카페|문구)$/.test(text))return;
 const c=document.createElement('canvas');c.width=1024;c.height=128;const g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,c.width,c.height)}g.fillStyle=color;g.font='bold 70px "Malgun Gothic", "Noto Sans CJK KR", sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,512,64,980);
 const rgba=g.getImageData(0,0,c.width,c.height).data,t=new pc.Texture(device,{width:c.width,height:c.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,flipY:false});const dest=t.lock(),stride=c.width*4;for(let row=0;row<c.height;row++)dest.set(rgba.subarray((c.height-1-row)*stride,(c.height-row)*stride),row*stride);t.unlock();
 const m=mat('lettering'+Object.keys(mats).length,'#ffffff',8);m.diffuseMap=t;m.opacityMap=t;m.opacityMapChannel='a';m.alphaTest=.2;m.cull=pc.CULLFACE_BACK;m.update();f.quad(m,[[x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z]],[0,0,1,0,1,1,0,1]);
}

function roofDetail(f,w,d,h){
 for(let s of [-1,1]){f.box(stone,0,h+.42,s*(d/2-.14),w,.65,.28);f.box(stone,s*(w/2-.14),h+.42,0,.28,.65,d)}
 f.box(roofMembrane,0,h+.13,0,w-.6,.13,d-.6);
 for(let x=-w*.35;x<w*.38;x+=5.5){f.box(rooftopMetal,x,h+.73,-d*.16,2.3,1.1,1.65);f.box(dark,x,h+1.29,-d*.16,1.6,.04,1.1);for(let j=-3;j<=3;j++)f.box(rooftopMetal,x+j*.23,h+1.32,-d*.16,.07,.035,1.1)}
 f.box(stone,w*.35,h+1.65,0,4.4,3.1,3.8);f.box(roofDark,w*.35,h+3.24,0,4.7,.2,4.1);
 for(let x=-w/2+1;x<w/2;x+=12)for(let s of [-1,1]){f.box(metal,x,h*.5,s*(d/2+.3),.12,h,.12)}
}
roofDetail(school,87,12,18.8);roofDetail(gaenari,39,13,14.6);roofDetail(songjuk,46,13,13);roofDetail(parang,44,12,10.35);
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
const contextSites={hill:{x:350,z:500},neighbourhood:{x:325,z:372},station:{x:681,z:248},stream:{x:861,z:110},civic:{x:-195,z:665},housing:{x:210,z:660},industrial:{x:-345,z:-195}};
const hillside=surface('hillside','#5c754b','grass',18),pathEarth=surface('pathEarth','#b3a183','soil',9),blueRoof=surface('blueRoof','#639dc1','roof',4),tileGray=surface('tileGray','#626b65','roof',3),villageCream=surface('villageCream','#c8c8b7','stone',4),streamWater=mat('streamWater','#5c9998',70),embankment=surface('embankment','#9b9e8d','stone',8),cycleRed=mat('cycleRed','#aa7260'),apartmentWhite=mat('apartmentWhite','#dddcd4'),apartmentGray=mat('apartmentGray','#8c999a'),apartmentBrown=mat('apartmentBrown','#aa9278');
function hillHeight(x,z){const hx=x-350,hz=z-500;const main=Math.exp(-((hx/126)**2+(hz/147)**2)*1.7),ridge=Math.exp(-(((hx+44)/82)**2+((hz+48)/103)**2)*1.7);const edge=Math.max(0,1-((hx/177)**2+(hz/205)**2));return edge*(30*main+9*ridge)*(1+.06*Math.sin(x*.04)*Math.cos(z*.035))}
const hp=[],hn=[],hu=[],hi=[],N=50;for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){let x=165+i*370/N,z=285+j*430/N,y=hillHeight(x,z),dx=(hillHeight(x+.4,z)-hillHeight(x-.4,z))/.8,dz=(hillHeight(x,z+.4)-hillHeight(x,z-.4))/.8,l=Math.hypot(dx,1,dz);hp.push(x,y+.02,z);hn.push(-dx/l,1/l,-dz/l);hu.push(x/18,z/18)}for(let j=0;j<N;j++)for(let i=0;i<N;i++){let a=j*(N+1)+i,b=a+N+1;hi.push(a,b,a+1,a+1,b,b+1)}geom(shared,hillside,hp,hn,hu,hi);
// Irregular blue/grey roofs step down the northwest slope; a continuous wooded edge stays visible.
function elevatedFrame(x,z,angle,y){const f=frame(x,z,angle);return {point:(a,b,c)=>f.point(a,b+y,c),box:(m,a,b,c,w,h,d)=>f.box(m,a,b+y,c,w,h,d),sphere:(m,a,b,c,w,h,d)=>f.sphere(m,a,b+y,c,w,h,d),quad:(m,ps,uv)=>f.quad(m,ps.map(([a,b,c])=>[a,b+y,c]),uv)}}
for(let row=0;row<7;row++)for(let coln=0;coln<9;coln++){let x=232+coln*23+Math.sin(row*1.2)*6,z=334+row*22;if(x>415&&z>424)continue;let base=hillHeight(x,z),w=12+(coln%3)*2,d=11+(row%3)*1.5,h=4.6+((coln+row)%3)*2.5,angle=-14+(row%3)*9,f=elevatedFrame(x,z,angle,base);f.box(embankment,0,-1.2,0,w+2,2.4,d+2);f.box((coln+row)%4===0?urbanBrick:villageCream,0,h/2,0,w,h,d);const rm=(coln+row)%3?blueRoof:tileGray;for(let q of [-1,1])for(let k=0;k<8;k++){let xx=q*(k+.5)*w/16;f.box(rm,xx,h+1.1-Math.abs(xx)*1.5/w,0,w/16+.1,.18,d+1.2)}for(let xx=-w/2+2;xx<w/2;xx+=3.7){f.box(windowReflect,xx,2.6,d/2+.07,1.7,1.45,.1);f.box(white,xx,2.6,d/2+.15,.055,1.46,.06)}f.box(dark,1,1.25,d/2+.13,1.1,2.5,.13);f.box(roofMembrane,0,h+.1,0,w-.4,.1,d-.4);if(coln%2===0){f.sphere(bluePanel,-w*.2,h+1.5,-d*.18,.7,1,.7)}
}
// Winding alleys are sampled on the slope, keeping paths on the ground surface.
for(let r=0;r<7;r++){let prev=null;for(let k=0;k<34;k++){let x=218+k*7,z=324+r*22+Math.sin(k*.3+r)*4,p=[x,hillHeight(x,z)+.08,z];if(prev){let f=frame(0,0,0);tube(f,pathEarth,prev,p,1.12,6)}prev=p}}
for(let i=0;i<100;i++){let a=i*2.399,rad=.62+(i%9)*.042,x=350+Math.cos(a)*153*rad,z=515+Math.sin(a)*170*rad;if(z<452&&x<433)continue;let y=hillHeight(x,z);box(shared,wood,x,y+2.1,z,.28,4.2,.28);for(let k=0;k<3;k++)ellipsoid(shared,k%2?leaf:leaf2,x+Math.cos(k*2.1)*1.2,y+4.6+k*.5,z+Math.sin(k*2.1)*1.3,2.4,2.6,2.4,8,5)}
worldLabel('십자산',310,345,'now',hillHeight(310,345)+9);worldLabel('언덕',350,525,'old',hillHeight(350,525)+9);
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
for(let i=0;i<32;i++){let x=-74+(i%8)*20,z=-85+Math.floor(i/8)*52;estate.sphere(leaf2,x,3.3,z,2.8,3.2,2.7)}
// Civic complex: long main block, central glass atrium, projecting wings and a circular forecourt. Unlabelled.
const civic=frame(contextSites.civic.x,contextSites.civic.z,43);civic.box(pavers,0,.12,34,178,.24,156);civic.box(urbanPlaster,0,24,0,134,48,27);civic.box(urbanPlaster,0,27,0,30,54,30);civic.box(windowReflect,0,25.2,15.2,24,48,.2);
for(let x of [-54,54])civic.box(urbanPlaster,x,17.5,19,27,35,48);
for(let f=0;f<13;f++){let y=3+f*3.45;for(let x=-62;x<=62;x+=5.2){if(Math.abs(x)<15)continue;civic.box(windowReflect,x,y,13.65,3.3,2.25,.13);civic.box(curb,x,y-1.3,13.85,3.8,.15,.42)}civic.box(curb,0,y+1.7,15.36,25,.13,.16)}for(let x=-11;x<=12;x+=3.5)civic.box(metal,x,25.2,15.4,.14,48,.18);
for(let x of [-54,54])for(let f=0;f<9;f++)for(let xx=-10;xx<=10;xx+=5)civic.box(windowReflect,x+xx,3+f*3.45,43.12,3,2.3,.1);
civic.box(stone,0,4.9,20,37,1.25,11);for(let x=-15;x<=15;x+=6)tube(civic,stone,[x,.2,24],[x,4.3,24],.55,12);civic.box(dark,0,1.9,15.5,21,3.8,.2);
for(let k=0;k<8;k++)civic.box(stone,0,.08+k*.12,31-k*.55,40,.16+k*.24,.65);
for(let k=0;k<64;k++){let a=k*6.283/64,b=(k+1)*6.283/64;tube(civic,asphalt,[Math.cos(a)*27,.2,76+Math.sin(a)*22],[Math.cos(b)*27,.2,76+Math.sin(b)*22],3.9,6)}civic.sphere(grass,0,.24,76,22,.14,17);civic.box(stone,0,.8,76,7,1.6,7);for(let k=0;k<28;k++){let a=k*6.283/28,b=(k+1)*6.283/28;tube(civic,metal,[Math.cos(a)*3.3,4.7+Math.sin(a)*3.3,76],[Math.cos(b)*3.3,4.7+Math.sin(b)*3.3,76],.31,8)}
for(let i=0;i<25;i++){let x=-78+(i%5)*6,z=43+Math.floor(i/5)*11;civic.box(white,x,.27,z,.11,.03,5.2)}for(let x of [-46,46])for(let z of [58,75,94])civic.sphere(leaf,x,2.4,z,2.8,2.1,2.5);
// East-side transport corridor: metro entrances and the elevated railway station.
const station=frame(741,380,-8);station.box(asphalt,0,.08,0,76,.16,195);
for(let x of [-11,11]){station.box(stone,x,8.8,0,8,.75,180);for(let z=-85;z<90;z+=19)station.box(stone,x,4.1,z,1.6,8.2,2)}
for(let x of [-12.1,-9.9,9.9,12.1])station.box(metal,x,9.25,0,.1,.13,180);for(let z=-88;z<90;z+=1.9)for(let x of [-11,11])station.box(wood,x,9.16,z,3.5,.14,.3);
station.box(stone,0,9.25,0,12,.4,106);for(let z=-50;z<=50;z+=10)for(let x of [-4.7,4.7])station.box(metal,x,11,z,.14,3.4,.14);for(let i=0;i<24;i++){let xx=-7+(i+.5)*14/24;station.box(roofDark,xx,12.9+1.3*Math.sqrt(Math.max(0,1-(xx/7)**2)),0,.65,.18,113)}
station.box(urbanPlaster,22,3.3,31,15,6.6,26);station.box(windowReflect,22,4,44.1,13,4,.1);

wallText(station,'교대역',22,5.7,44.24,10,1,'#ffffff','#28687e');worldLabel('교대역',670,90,'now',20);
// Oncheoncheon channel, stepped banks, parallel walking/cycling paths and bridges.
const riverPts=riverRoute;
function riverStrip(a,b,width,m,y){let dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;const p=[[a[0]-nx*width/2,y,a[1]-nz*width/2],[b[0]-nx*width/2,y,b[1]-nz*width/2],[b[0]+nx*width/2,y,b[1]+nz*width/2],[a[0]+nx*width/2,y,a[1]+nz*width/2]];geom(now,m,p.flat(),[0,1,0,0,1,0,0,1,0,0,1,0],[0,0,0,len/16,width/16,len/16,width/16,0],[0,1,2,0,2,3])}
for(let i=1;i<riverPts.length;i++){let a=riverPts[i-1],b=riverPts[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len;riverStrip(a,b,70,embankment,.08);riverStrip(a,b,34,streamWater,.18);for(let side of [-1,1]){let offset=d=>[[a[0]+nx*d*side,a[1]+nz*d*side],[b[0]+nx*d*side,b[1]+nz*d*side]];riverStrip(...offset(24),7,pavers,.2);riverStrip(...offset(31),5,cycleRed,.21);const f=frame(0,0,0);tube(f,metal,[a[0]+nx*36*side,1.1,a[1]+nz*36*side],[b[0]+nx*36*side,1.1,b[1]+nz*36*side],.045);for(let k=0;k<len;k+=13){let t=k/len,x=a[0]+dx*t+nx*40*side,z=a[1]+dz*t+nz*40*side;tree(now,x,z,.6)}}}
for(let [x,z,angle]of [[861,110,-1],[904,445,-12]]){const bridge=frame(x,z,angle);bridge.box(stone,0,3.3,0,105,1.4,14);bridge.box(asphalt,0,4.04,0,105,.12,11);for(let q of [-1,1]){bridge.box(curb,0,4.18,q*6.6,105,.3,1);tube(bridge,metal,[-52,5,q*6.6],[52,5,q*6.6],.055);for(let xx=-50;xx<=50;xx+=5)bridge.box(metal,xx,4.65,q*6.6,.075,.9,.075)}for(let xx of [-27,27])bridge.box(stone,xx,1.8,0,2.8,3.6,8);for(let q of [-1,1])for(let k=0;k<20;k++)bridge.box(asphalt,q*(53+k*2.6),3.95-k*.195,0,2.8,.15,11)}
worldLabel('온천천',915,230,'now',4);
// Broad connecting roads extend the viewing area to the south and east.
for(const [a,b]of [[[-380,465],[-350,900]],[[-60,850],[520,480]],[[570,-60],[680,470]],[[650,60],[829,60]]])segment(now,asphalt,a,b,14,.12);

// Campus revision 3. Photo-guided proportions; coordinates remain illustrative.
const campusSand=surface('campusSand','#c9b18b','soil',14),campusSlate=surface('campusSlate','#6c7376','stone',4),paleBlueStone=surface('paleBlueStone','#b0c5c7','stone',3),roadYellow=mat('roadYellow','#e9bb3f'),chalk=mat('campusChalk','#ebe0c8'),sculptureWhite=surface('sculptureWhite','#e8e7df','stone',3),sculptureSeam=mat('sculptureSeam','#bbc0bc');
const athletic=frame(32,130,43);
function flatQuad(f,m,ps,y){const p=ps.map(([x,z])=>f.point(x,y,z));geom(now,m,p.flat(),p.flatMap(()=>[0,1,0]),[0,0,1,0,1,1,0,1],[0,2,1,0,3,2])}
function flatRing(f,m,x,z,rx,rz,width,y,steps=96){for(let k=0;k<steps;k++){const a=k*Math.PI*2/steps,b=(k+1)*Math.PI*2/steps;flatQuad(f,m,[[x+Math.cos(a)*rx,z+Math.sin(a)*rz],[x+Math.cos(b)*rx,z+Math.sin(b)*rz],[x+Math.cos(b)*(rx-width),z+Math.sin(b)*(rz-width)],[x+Math.cos(a)*(rx-width),z+Math.sin(a)*(rz-width)]],y)}}
function disk(f,m,x,z,rx,rz,y,steps=64){const pts=[];for(let k=0;k<steps;k++){const a=k*2*Math.PI/steps,p=f.point(x+Math.cos(a)*rx,y,z+Math.sin(a)*rz);pts.push([p[0],p[2]])}poly(now,m,pts,y)}
function railing(f,x1,z1,x2,z2,y=1.3){const len=Math.hypot(x2-x1,z2-z1);for(let k=0;k<=Math.ceil(len/2.4);k++){let t=k/Math.ceil(len/2.4);tube(f,metal,[x1+(x2-x1)*t,.45,z1+(z2-z1)*t],[x1+(x2-x1)*t,y,z1+(z2-z1)*t],.045)}for(let h of [y-.5,y-.25,y])tube(f,metal,[x1,h,z1],[x2,h,z2],.035)}
function bareTree(f,x,z,s=1){tube(f,wood,[x,.35,z],[x+.15*s,6.9*s,z],.17*s,8);for(let j=0;j<7;j++){const a=j*2.399,yy=(3.4+j*.35)*s,xx=x+Math.cos(a)*2.8*s,zz=z+Math.sin(a)*2.8*s;tube(f,wood,[x,yy,z],[xx,yy+2.6*s,zz],.07*s);for(let q of [-1,1])tube(f,wood,[xx,yy+2*s,zz],[xx+q*.9*s,yy+3.2*s,zz+q*.8*s],.023*s)}for(let q of [-1,1])tube(f,wood,[x+q*1.05,.3,z+.4],[x,2.4*s,z],.045)}
function campusLamp(f,x,z){tube(f,metal,[x,.3,z],[x,5.1,z],.085);tube(f,metal,[x,5.1,z],[x+.7,5.85,z],.08);f.box(dark,x+.3,5.9,z,.85,.12,.35);f.box(white,x+.3,5.81,z,.7,.025,.23)}
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
const envCanvas=document.createElement('canvas');envCanvas.width=envCanvas.height=256;const eg=envCanvas.getContext('2d'),envGrad=eg.createLinearGradient(0,0,0,256);for(const [t,c]of [[0,'#819fb5'],[.43,'#edf4f7'],[.49,'#c5d5df'],[.51,'#344438'],[.64,'#7c8b76'],[.69,'#d1d2c6'],[1,'#6e7773']])envGrad.addColorStop(t,c);eg.fillStyle=envGrad;eg.fillRect(0,0,256,256);const envTexture=new pc.Texture(device,{width:256,height:256,mipmaps:true});envTexture.setSource(envCanvas);chrome.sphereMap=envTexture;chrome.update();
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
const gatePoint=mapPoint(...mapAnchors.gate);const campusRoute=[[gatePoint[0],gatePoint[2]],[363,200],[410,205],[535,222],[650,246]];
const routeSegments=[];
function roadText(f,text,x,z,w,d){const plane={quad:(m,ps,uv)=>{const p=ps.map(([a,b,c])=>f.point(a,.38,-b));geom(now,m,p.flat(),p.flatMap(()=>[0,1,0]),uv,[0,1,2,0,2,3])}};wallText(plane,text,x,-z,0,w,d,'#fff9df')}
function arrow(f,x,z){f.box(white,x,.345,z,.18,.025,2.1);flatQuad(f,white,[[x-.65,z-1],[x,z-2],[x+.65,z-1],[x,z-1]],.36)}
function signal(f,x,z){tube(f,roadYellow,[x,.3,z],[x,5.1,z],.095);tube(f,roadYellow,[x,5.1,z],[x+(x<0?8:-8),5.1,z],.08);let xx=x+(x<0?6:-6);f.box(dark,xx,4.97,z,1.4,.45,.32);for(let j=0;j<3;j++)f.sphere(j===0?red:j===1?roadYellow:greenPanel,xx-.43+j*.43,4.97,z+.18,.14,.14,.035)}
function streetCar(f,x,z,index){f.box(carM[index%4],x,.94,z,1.9,1.25,4.5);f.box(windowReflect,x,1.68,z-.12,1.65,.67,2.15);for(let q of [-1,1])for(let zz of [-1.4,1.4])f.sphere(black,x+q*.92,.59,z+zz,.16,.36,.36);for(let q of [-1,1])f.box(white,x+q*.64,.99,z-2.28,.38,.21,.055)}
for(let s=1;s<campusRoute.length;s++){
 const a=campusRoute[s-1],b=campusRoute[s],len=Math.hypot(b[0]-a[0],b[1]-a[1]),angle=Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI,f=frame((a[0]+b[0])/2,(a[1]+b[1])/2,angle);routeSegments.push({a,b,len,angle});
 f.box(asphalt,0,.22,0,10,.22,len+1);for(let q of [-1,1]){f.box(curb,q*5.15,.34,0,.3,.3,len);f.box(pavers,q*7.1,.26,0,3.6,.4,len);f.box(roadYellow,q*6.5,.473,0,.38,.02,len);f.box(white,q*4.7,.343,0,.09,.025,len)}
 for(let q of [-1,1])f.box(roadYellow,q*.14,.344,0,.09,.025,len-2);
 for(let z=-len/2+12;z<len/2-6;z+=22)for(let q of [-1,1]){bareTree(f,q*8.15,z,.7);f.box(stone,q*8.15,.5,z,1.25,.12,1.6);if(q<0)campusLamp(f,q*8.55,z)}
 for(let z=-len/2+14;z<len/2-10;z+=32)arrow(f,-2.5,z);
 if(s>=2){for(let q of [-1,1])signal(f,q*7.5,-len/2+6);for(let k=0;k<8;k++)f.box(roadYellow,-4.2+k*1.2,.35,-len/2+8,.65,.025,3.1);f.box(white,0,.35,-len/2+11,10,.025,.22)}
 if(s===3||s===4){roadText(f,'어린이',-2.5,-18,3.7,2.8);roadText(f,'보호구역',-2.5,-22,3.7,2.8);roadText(f,'30',-2.5,-30,2.5,3);streetCar(f,2.5,9,s);}
 if(s>=3)for(let q of [-1,1])for(let z=-len/2+17,j=0;z<len/2-14;z+=16,j++){
  // Breaks between rows leave junctions visible; no commercial brand names are copied.
  const p=f.point(q*16,0,z);if(Math.hypot(p[0]-585,p[2]-210)<52)continue;const store=frame(p[0],p[2],angle+(q<0?90:-90)),w=12+(j%3),d=12,h=8+((j+s)%4)*3.15;
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
for(let i=0;i<70;i++){const t=i/69,p=mapPoint(549+t*168,814+Math.sin(t*2.5)*16),h=6+(i%7)*.45;tube(frame(0,0,0),bambooStem,[p[0],.3,p[2]],[p[0]-.3,h,p[2]+.2],.045);if(i%3===0)ellipsoid(now,leaf,p[0],h-.5,p[2],1.3,2,1.1,8,5)}
// Connected covered walkways follow the main front and turn along the lawn's western edge.
const awningRed=mat('awningRed','#de795f'),awningWhite=mat('awningWhite','#e6e8df');
const canopyPaths=[[[-43,9],[42,9],true,0,0],[[-43,9],[-48,17],false,0,1.8],[[-48,17],[-48,66],false,1.8,1.8]];
function coveredWalk(a,b,coloured,y0=0,y1=0){const aa=school.point(a[0],0,a[1]),bb=school.point(b[0],0,b[1]),len=Math.hypot(bb[0]-aa[0],bb[2]-aa[2]),angle=Math.atan2(-(bb[2]-aa[2]),bb[0]-aa[0])*180/Math.PI,f=frame((aa[0]+bb[0])/2,(aa[2]+bb[2])/2,angle);const level=x=>y0+(x+len/2)/len*(y1-y0);for(let x=-len/2;x<len/2;x+=1)f.box(pavers,x+.5,.32+level(x+.5),0,1.04,.2,3);for(let x=-len/2;x<len/2+.1;x+=3)for(let q of [-1,1]){f.box(wood,x,1.65+level(x),q*1.35,.12,2.7,.12);f.box(metal,x,3+level(x),q*1.35,.1,.3,.1)}for(let x=-len/2;x<len/2;x+=1.5){for(let k=0;k<12;k++){let z=-1.7+(k+.5)*3.4/12,y=3.05+level(x+.75)+.62*Math.sqrt(Math.max(0,1-(z/1.7)**2));f.box(coloured?(Math.floor((x+len/2)/3)%2?awningRed:awningWhite):roofDark,x+.75,y,z,1.53,.065,.3)}for(let k=0;k<12;k++){let z=-1.7+(k+.5)*3.4/12,y=3.1+level(x)+.62*Math.sqrt(Math.max(0,1-(z/1.7)**2));f.box(metal,x,y,z,.04,.05,.3)}}for(let q of [-1,1])tube(f,metal,[-len/2,3.05+y0,q*1.7],[len/2,3.05+y1,q*1.7],.07)}
canopyPaths.forEach(p=>coveredWalk(...p));

worldLabel('대학교 운동장',32,130,'now',2);
const detailStops={field:{name:'넓은 운동장',x:fieldCentre[0],z:fieldCentre[2],distance:440,pitch:55,yaw:43},sculpture:{name:'조형물 가까이',x:statuePos[0],z:statuePos[2],distance:23,pitch:22,yaw:43},entrance:{name:'입구 쪽',x:gatePoint[0],z:gatePoint[2],distance:95,pitch:35,yaw:82},street:{name:'큰길 쪽',x:500,z:216,distance:280,pitch:48,yaw:0},island:{name:'교내 길',x:roundPos[0],z:roundPos[2],distance:105,pitch:40,yaw:55},museum:{name:'주차장 쪽',x:museumPos[0]-12,z:museumPos[2]+12,distance:125,pitch:28,yaw:-47}};

// Eastern skyline landmark, west of the station and river. No lettering or logos.
const skylineTower=frame(585,190,-8);
skylineTower.box(pavers,0,.2,0,66,.4,58);skylineTower.box(urbanPlaster,0,42,0,33,84,26);skylineTower.box(urbanPlaster,4,43,0,16,86,30);
for(let q of [-1,1])for(let x=-14;x<=14;x+=3.5){skylineTower.box(windowReflect,x,43,q*13.2,2.5,78,.2);skylineTower.box(white,x-1.35,43,q*13.4,.33,81,.4)}
for(let q of [-1,1])for(let z=-10;z<=10;z+=3.5){skylineTower.box(windowReflect,q*16.6,43,z,.2,78,2.5);skylineTower.box(white,q*16.8,43,z-1.4,.4,81,.33)}
for(let y=8;y<85;y+=3.35)for(let q of [-1,1])skylineTower.box(stone,0,y,q*13.5,34,.18,.5);
skylineTower.box(stone,0,84.7,0,35,1.4,28);skylineTower.box(roofMembrane,0,85.5,0,28,.25,23);
skylineTower.box(stone,0,89,-3,20,7,16);skylineTower.box(roofMembrane,0,92.65,-3,18,.25,14);
skylineTower.box(windowReflect,0,4.4,14.1,23,6.8,.2);skylineTower.box(stone,0,8.4,17,36,.8,9);for(let x=-14;x<=14;x+=7)skylineTower.box(stone,x,4,20,.6,8,.6);
// Separate underground entrances at the main avenue from the southeast elevated platform.
const metro=frame(681,248,-8);metro.box(asphalt,0,.15,0,26,.25,300);
for(let q of [-1,1]){metro.box(pavers,q*16,.22,0,5,.35,295);for(let z=-130;z<140;z+=19){bareTree(metro,q*16.5,z,.9);campusLamp(metro,q*18,z)}}
for(let z of [-27,29])for(let q of [-1,1]){const x=q*16;metro.box(dark,x,.34,z,4.7,.12,10);for(let k=0;k<8;k++)metro.box(stone,x,.35+k*.035,z-4+k*.6,4.1,.15,.63);for(let xx of [-2.4,2.4]){metro.box(stone,x+xx,1.1,z,.3,1.7,10.5);tube(metro,metal,[x+xx,1.8,z-5],[x+xx,1.8,z+5],.045)}metro.box(roofDark,x,3.1,z,5.8,.18,11);for(let xx of [-2.3,2.3])for(let zz of [-4.5,4.5])metro.box(metal,x+xx,1.65,z+zz,.11,2.9,.11);metro.box(bluePanel,x,3.15,z+5.6,3.8,.65,.16)}
for(let z of [-6,7])for(let x=-11;x<12;x+=1.7)metro.box(white,x,.285,z,.9,.025,4);
// Varied small parcels give the aerial view dense streets without overlapping the old house grid.
function districtBlock(x,z,w,d,h,a){const f=frame(x,z,a);f.box(urbanWalls[Math.floor(rnd()*4)],0,h/2,0,w,h,d);f.box(roofMembrane,0,h+.16,0,w,.25,d);for(let q of [-1,1]){f.box(stone,0,h+.35,q*d/2,w,.4,.2);f.box(stone,q*w/2,h+.35,0,.2,.4,d);for(let y=2;y<h;y+=3.4){for(let xx=-w/2+2;xx<w/2-1;xx+=3.7)f.box(windowReflect,xx,y,q*(d/2+.07),2,1.6,.1);for(let zz=-d/2+2;zz<d/2-1;zz+=3.7)f.box(windowReflect,q*(w/2+.07),y,zz,.1,1.6,1.8)}}f.box(rooftopMetal,w*.2,h+.8,-d*.2,2,1.2,1.8);f.box(dark,0,1.2,d/2+.1,1.5,2.4,.12)}
for(let row=0;row<30;row++)for(let coln=0;coln<35;coln++){const x=-470+coln*34+(row%2)*7,z=-280+row*36;if(reservedContext(x,z)||inSchoolArea(x,z)||nearRoad(619+x/.85,460+z/.85,13)||Math.hypot(x-585,z-210)<58||x>645&&z>50)continue;const angle=(row%3===0?-8:43),w=12+(coln%4)*2.2,d=12+(row%3)*2,h=5+((row+coln)%5)*2.1;if(Math.hypot(x-32,z-130)<310)building(619+x/.85,460+z/.85,w,d,h,angle,false);else districtBlock(x,z,w,d,h,angle)}

// Compile meshes once. Each era stays in memory for instant camera-preserving switching.
for(const b of buckets.values()){const mesh=new pc.Mesh(device);mesh.setPositions(b.p);mesh.setNormals(b.n);mesh.setUvs(0,b.u);mesh.setIndices(b.i);mesh.update(pc.PRIMITIVE_TRIANGLES);const ent=new pc.Entity(b.material.name);ent.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,b.material)],castShadows:!['water','ripple','grass','paddy','contactAO','pavers','concrete','soil','asphalt','lines'].includes(b.material.name),receiveShadows:true});b.parent.addChild(ent)}buckets.clear();
let era='now',showLabels=true;let yaw=25,pitch=43,distance=285,target=new pc.Vec3(...school.point(0,0,32));let desired={yaw,pitch,distance,x:target.x,z:target.z};
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',2300)}
function setEra(e){setTeleportArmed(false);closeSpeech();era=e;now.enabled=e==='now';old.enabled=e==='old';$('past').classList.toggle('active',e==='old');$('present').classList.toggle('active',e==='now');$('past').setAttribute('aria-pressed',e==='old');$('present').setAttribute('aria-pressed',e==='now');$('eraTitle').textContent=e==='old'?'황새가 찾아오던 한새벌':'오늘날의 우리 동네';$('eraText').innerHTML=e==='old'?'논과 들, 물이 고인 습지와<br>초가가 모여 있는 옛날의 풍경':'학교와 대학, 집과 도로가<br>모여 있는 오늘날의 풍경'}
$('past').onclick=()=>setEra('old');$('present').onclick=()=>setEra('now');const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));function zoom(f){desired.distance=clamp(desired.distance*f,8,2700)}$('zoomIn').onclick=()=>zoom(.78);$('zoomOut').onclick=()=>zoom(1.28);$('home').onclick=()=>Object.assign(desired,{yaw:0,pitch:53,distance:990,x:0,z:65});$('school').onclick=()=>{Object.assign(desired,{x:school.point(0,0,46)[0],z:school.point(0,0,46)[2],distance:240,pitch:43,yaw:25});toast(era==='old'?'지금 우리 학교가 있는 자리입니다':'우리 학교를 가까이 살펴보세요')};$('top').onclick=()=>{desired.pitch=85;desired.yaw=0};$('names').onclick=()=>{showLabels=!showLabels;$('names').textContent=showLabels?'설명 숨김':'설명 보기';$('names').setAttribute('aria-pressed',showLabels)};$('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){toast('전체 화면은 F11 키로도 볼 수 있습니다')}};
let selectedPerson=null,meetingIndex={now:0,old:0};
function closeSpeech(){selectedPerson=null;$('speech').hidden=true}
function openSpeech(p){selectedPerson=p;p.line=0;$('speaker').textContent=p.name;$('speechText').textContent=p.talk[0];$('speech').hidden=false;Object.assign(desired,{x:p.entity.getPosition().x,z:p.entity.getPosition().z,distance:32,pitch:18,yaw:p.era==='now'?schoolAngle:p.angle+155});}
$('speechClose').onclick=closeSpeech;$('speechNext').onclick=()=>{if(!selectedPerson)return;selectedPerson.line=(selectedPerson.line+1)%selectedPerson.talk.length;$('speechText').textContent=selectedPerson.talk[selectedPerson.line]};
$('meetPeople').onclick=()=>{const list=people.filter(p=>p.era===era);openSpeech(list[meetingIndex[era]%list.length]);meetingIndex[era]++};
$('magpies').onclick=()=>{closeSpeech();if(era!=='now')setEra('now');const p=school.point(0,0,28);Object.assign(desired,{x:p[0],z:p[2],distance:36,pitch:30,yaw:0})};
$('college').onclick=()=>{closeSpeech();Object.assign(desired,{x:32,z:180,distance:660,pitch:53,yaw:43})};
$('compare').onclick=()=>$('comparison').showModal();$('closeCompare').onclick=()=>$('comparison').close();

function animatePeople(dt,time){for(let p of people){if(p.era!==era)continue;const t=time+p.phase;const walk=p.activity==='walk',play=p.activity==='play',wave=p.activity==='wave',farm=p.activity==='farm';let step=p.activity==='wade'?Math.sin(t*.7)*8:walk?Math.sin(t*3.3)*22:play?Math.sin(t*3)*12:0;for(let i=0;i<2;i++){p.legs[i].setLocalEulerAngles((i?1:-1)*step,0,0);p.arms[i].setLocalEulerAngles((i?-1:1)*step,0,wave&&i===1?125+Math.sin(t*3)*13:(i?1:-1)*(play?35+Math.sin(t*2)*18:7))}if(p.activity==='wade')p.entity.setPosition(p.x+Math.sin(t*.35)*.12,-.1,p.z+Math.cos(t*.35)*.12);if(walk){p.entity.setPosition(p.x+Math.sin(t*.45)*1.2,0,p.z+Math.cos(t*.45)*.9)}p.group.setLocalEulerAngles(farm?13+Math.sin(t*1.8)*10:0,0,0);p.group.setLocalPosition(0,play?Math.abs(Math.sin(t*2))*.07:0,0)}if(era==='now')ballRoot.setPosition(ballPoint[0]+Math.sin(time*1.3)*1.1,.1+Math.abs(Math.sin(time*2.6))*.45,ballPoint[2])}
const personScreen=new pc.Vec3();
function updatePeoplePins(){const cw=canvas.clientWidth||innerWidth,ch=canvas.clientHeight||innerHeight;for(let p of people){let pos=p.entity.getPosition();p.pos.set(pos.x,pos.y+p.height+.3,pos.z);camera.camera.worldToScreen(p.pos,personScreen);let active=p.era===era&&personScreen.z>0&&personScreen.x>5&&personScreen.x<cw-85&&personScreen.y>150&&personScreen.y<ch-110; // Filter distant clusters to keep the aerial view readable.
if(distance>350){const preferred=era==='now'?[0,5,6,7]:[8,9,13];active=active&&preferred.includes(people.indexOf(p))}if(active){p.pin.style.display='block';p.pin.style.left=personScreen.x+'px';p.pin.style.top=personScreen.y+'px'}else p.pin.style.display='none'}}
// Direct body clicking supplements the explicit speech markers; drags never trigger speech.
let tapStart=null;canvas.addEventListener('pointerdown',e=>{if(e.button===0)tapStart={x:e.clientX,y:e.clientY,id:e.pointerId}});canvas.addEventListener('pointerup',e=>{if(!tapStart||tapStart.id!==e.pointerId||Math.hypot(e.clientX-tapStart.x,e.clientY-tapStart.y)>5){tapStart=null;return}tapStart=null;if(pointers.size>1)return;let nearest=null,best=24;for(let p of people){if(p.era!==era||p.pin.style.display==='none')continue;const pos=p.entity.getPosition();camera.camera.worldToScreen(new pc.Vec3(pos.x,pos.y+p.height*.6,pos.z),personScreen);const d=Math.hypot(personScreen.x-e.clientX,personScreen.y-e.clientY);if(personScreen.z>0&&d<best){nearest=p;best=d}}if(nearest)openSpeech(nearest)});canvas.addEventListener('pointercancel',()=>tapStart=null);

const pointers=new Map();let pinch=0;canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('pointerdown',e=>{canvas.focus();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button});pinch=0});function pan(dx,dy){let a=desired.yaw*Math.PI/180,s=desired.distance*.0011;desired.x=clamp(desired.x+(-dx*Math.cos(a)+dy*Math.sin(a))*s,-1500,1500);desired.z=clamp(desired.z+(dx*Math.sin(a)+dy*Math.cos(a))*s,-1350,1450)}
canvas.addEventListener('pointermove',e=>{let prev=pointers.get(e.pointerId);if(!prev)return;const dx=e.clientX-prev.x,dy=e.clientY-prev.y;let panMode=prev.button===2||e.shiftKey;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:prev.button});if(pointers.size===2){let [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0)zoom(pinch/Math.max(d,1));pinch=d;pan(dx*.5,dy*.5)}else if(panMode)pan(dx,dy);else{desired.yaw-=dx*.25;desired.pitch=clamp(desired.pitch+dy*.19,9,85)}});for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,e=>{pointers.delete(e.pointerId);pinch=0});canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-180,180)*.0015))},{passive:false});const heldKeys=new Set();
const touchKeys=new Set();function setTouchVisible(show){$('touchMove').classList.toggle('shown',show);document.body.classList.toggle('touchControls',show);$('touchToggle').setAttribute('aria-pressed',show);if(!show)touchKeys.clear()}
setTouchVisible(window.matchMedia('(pointer: coarse), (max-width: 1200px)').matches);
$('touchToggle').onclick=()=>setTouchVisible(!$('touchMove').classList.contains('shown'));
for(const button of document.querySelectorAll('[data-move]')){const code=button.dataset.move;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touchKeys.add(code);button.classList.add('pressed')});const stop=()=>{touchKeys.delete(code);button.classList.remove('pressed')};for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,stop)}
window.addEventListener('blur',()=>touchKeys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)touchKeys.clear()});
$('well').onclick=()=>{closeSpeech();Object.assign(desired,{x:wellX,z:wellZ,distance:era==='old'?68:15,pitch:era==='old'?43:27,yaw:0})};
$('dyke').onclick=()=>{closeSpeech();if(era!=='old')setEra('old');Object.assign(desired,{x:dykeX,z:dykeZ,distance:45,pitch:30,yaw:75})};

const moveCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','ShiftLeft','ShiftRight'];
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;if(moveCodes.includes(e.code)){e.preventDefault();heldKeys.add(e.code)}if(e.code==='Equal'||e.code==='NumpadAdd'){e.preventDefault();zoom(.9)}if(e.code==='Minus'||e.code==='NumpadSubtract'){e.preventDefault();zoom(1.1)}});
window.addEventListener('keyup',e=>heldKeys.delete(e.code));window.addEventListener('blur',()=>heldKeys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)heldKeys.clear()});
function keyboardMove(dt){if(document.querySelector('dialog[open]')){heldKeys.clear();touchKeys.clear();return}const down=(...keys)=>keys.some(k=>heldKeys.has(k)||touchKeys.has(k));let forward=Number(down('KeyW','ArrowUp'))-Number(down('KeyS','ArrowDown')),right=Number(down('KeyD','ArrowRight'))-Number(down('KeyA','ArrowLeft'));const len=Math.hypot(forward,right)||1;const speed=clamp(desired.distance*.22,8,150)*(down('ShiftLeft','ShiftRight')?2:1)*Math.min(dt,.05);let angle=desired.yaw*Math.PI/180;if(forward||right){desired.x=clamp(desired.x+(-Math.sin(angle)*forward+Math.cos(angle)*right)/len*speed,-1500,1500);desired.z=clamp(desired.z+(-Math.cos(angle)*forward-Math.sin(angle)*right)/len*speed,-1350,1450)}desired.yaw+=(Number(down('KeyQ'))-Number(down('KeyE')))*60*Math.min(dt,.05)}

let teleportArmed=false;
const teleportGesture=teleportSupport.createGesture(),teleportPointers=new Set();
function setTeleportArmed(active){
 teleportArmed=active;teleportGesture.reset();
 for(const id of teleportPointers){if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}teleportPointers.clear();
 document.body.classList.toggle('teleport-mode',active);$('teleport').setAttribute('aria-pressed',String(active));$('teleport').textContent=active?'이동 취소':'순간 이동';
 if(active){for(const id of pointers.keys()){if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)}pointers.clear();pinch=0;tapStart=null;heldKeys.clear();touchKeys.clear();closeSpeech();toast('이동할 바닥을 클릭하거나 터치하세요. Esc 키로 취소할 수 있어요.')}
}
function teleportToScreen(clientX,clientY){
 const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return false;
 const pixelX=(clientX-rect.left)*device.clientRect.width/rect.width,pixelY=(clientY-rect.top)*device.clientRect.height/rect.height;
 const origin=camera.getPosition().clone(),rayPoint=camera.camera.screenToWorld(pixelX,pixelY,1,new pc.Vec3()),direction=rayPoint.sub(origin).normalize();
 const hit=teleportSupport.pickGround(origin,direction,(x,z)=>Math.max(0,hillHeight(x,z)),camera.camera.farClip);
 if(!hit){toast('이동할 수 있는 바닥을 선택해 주세요.');return false}
 // Commit both the displayed and desired state, bypassing camera easing for this one action.
 closeSpeech();heldKeys.clear();touchKeys.clear();desired.x=hit.x;desired.z=hit.z;desired.yaw=yaw;desired.pitch=pitch;desired.distance=distance;
 target.x=hit.x;target.y=hit.y;target.z=hit.z;
 const a=yaw*Math.PI/180,b=pitch*Math.PI/180;camera.setPosition(target.x+distance*Math.cos(b)*Math.sin(a),target.y+distance*Math.sin(b),target.z+distance*Math.cos(b)*Math.cos(a));camera.lookAt(target);
 setTeleportArmed(false);toast('선택한 곳으로 이동했어요.');return true;
}
$('teleport').onclick=()=>setTeleportArmed(!teleportArmed);
// Capture before ordinary rotation and person-click handlers; one tap produces one move.
canvas.addEventListener('pointerdown',e=>{
 if(!teleportArmed)return;e.preventDefault();e.stopImmediatePropagation();
 if(e.button!==0){setTeleportArmed(false);return}
 canvas.focus();teleportPointers.add(e.pointerId);teleportGesture.down(e.pointerId,e.clientX,e.clientY);canvas.setPointerCapture(e.pointerId);
},{capture:true,passive:false});
canvas.addEventListener('pointermove',e=>{if(!teleportArmed)return;e.preventDefault();e.stopImmediatePropagation();teleportGesture.move(e.pointerId,e.clientX,e.clientY);},{capture:true,passive:false});
canvas.addEventListener('pointerup',e=>{
 if(!teleportArmed)return;e.preventDefault();e.stopImmediatePropagation();
 const valid=teleportGesture.up(e.pointerId,e.clientX,e.clientY);teleportPointers.delete(e.pointerId);
 if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 if(valid)teleportToScreen(e.clientX,e.clientY);
},{capture:true,passive:false});
for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(!teleportArmed)return;teleportGesture.cancel(e.pointerId);teleportPointers.delete(e.pointerId);e.stopImmediatePropagation();},{capture:true});
window.addEventListener('keydown',e=>{if(teleportArmed&&e.code==='Escape'){setTeleportArmed(false);e.preventDefault()}});
window.addEventListener('blur',()=>setTeleportArmed(false));
document.addEventListener('visibilitychange',()=>{if(document.hidden)setTeleportArmed(false)});

const screen=new pc.Vec3();let lastLabels=0;let animationTime=0;app.on('update',dt=>{keyboardMove(dt);animationTime+=dt;animatePeople(dt,animationTime);animateMagpies(animationTime);animateWell(animationTime);let f=1-Math.exp(-dt*10);yaw+=(desired.yaw-yaw)*f;pitch+=(desired.pitch-pitch)*f;distance+=(desired.distance-distance)*f;target.x+=(desired.x-target.x)*f;target.z+=(desired.z-target.z)*f;target.y+=(Math.max(0,hillHeight(target.x,target.z))-target.y)*f;const a=yaw*Math.PI/180,b=pitch*Math.PI/180;camera.setPosition(target.x+distance*Math.cos(b)*Math.sin(a),target.y+distance*Math.sin(b),target.z+distance*Math.cos(b)*Math.cos(a));camera.lookAt(target);$('north').style.transform=`rotate(${-yaw}deg)`;lastLabels+=dt;if(lastLabels>.05){lastLabels=0;updatePeoplePins();const occupied=[];for(let l of [...labels].sort((a,b)=>a.pos.distance(target)-b.pos.distance(target))){camera.camera.worldToScreen(l.pos,screen);const width=Math.min(260,l.el.textContent.length*12+20);let visible=showLabels&&l.era===era&&screen.z>0&&screen.x>width/2+12&&screen.x<innerWidth-width/2-110&&screen.y>190&&screen.y<innerHeight-140&&!occupied.some(r=>Math.abs(r.x-screen.x)<(r.w+width)/2+6&&Math.abs(r.y-screen.y)<36);l.el.style.display=visible?'block':'none';if(visible){occupied.push({x:screen.x,y:screen.y,w:width});l.el.style.left=screen.x+'px';l.el.style.top=screen.y+'px'}}}});
// Useful fixed views make individual buildings inspectable on a touch screen.
const buildingStops=[['학교 앞쪽',school,0,6,110,43],['벽화 쪽',gaenari,0,10,75,133],['파란 건물 쪽',parang,0,10,85,133],['학교 뒤쪽',kkachi,0,21,82,133],['옆 건물 쪽',songjuk,0,10,80,-47],['잔디 마당',school,0,39,160,25],['모래 마당',school,-2,74,110,43]];
const visit=document.createElement('select');visit.id='buildingVisit';visit.setAttribute('aria-label','건물 가까이 보기');visit.innerHTML='<option value="">건물 가까이 보기</option>'+buildingStops.map((v,i)=>`<option value="${i}">${v[0]}</option>`).join('');document.querySelector('.meet').append(visit);visit.onchange=()=>{if(visit.value==='')return;closeSpeech();setEra('now');const [name,f,x,z,d,y]=buildingStops[Number(visit.value)],p=f.point(x,0,z);Object.assign(desired,{x:p[0],z:p[2],distance:d,pitch:25,yaw:y});visit.value='';toast(name+' 외관을 살펴보세요')};
const cityButton=document.createElement('button');cityButton.textContent='도시 전경';cityButton.onclick=()=>{closeSpeech();Object.assign(desired,{x:X(625),z:Z(630),distance:600,pitch:48,yaw:20})};document.querySelector('.tools').insertBefore(cityButton,$('school'));
const daylightButton=document.createElement('button');daylightButton.textContent='빛: 한낮';let evening=false;daylightButton.onclick=()=>{evening=!evening;daylightButton.textContent=evening?'빛: 늦은 오후':'빛: 한낮';sun.light.color=evening?new pc.Color(1,.77,.54):new pc.Color(1,.96,.87);sun.light.intensity=evening?1.65:1.5;sun.setEulerAngles(evening?29:52,-35,0);app.scene.ambientLight=evening?new pc.Color(.42,.46,.53):new pc.Color(.54,.59,.63)};document.querySelector('.tools').append(daylightButton);
const qualityButton=document.createElement('button');let fine=innerWidth>1200&&!matchMedia('(pointer: coarse)').matches;function quality(){device.maxPixelRatio=Math.min(devicePixelRatio,fine?1.8:1.25);sun.light.shadowResolution=fine?4096:2048;app.resizeCanvas();qualityButton.textContent=fine?'화질: 정밀':'화질: 기본'}qualityButton.onclick=()=>{fine=!fine;quality()};document.querySelector('.tools').append(qualityButton);quality();

const nearby=document.createElement('select');nearby.id='nearbyVisit';nearby.setAttribute('aria-label','동네 둘러보기');nearby.innerHTML='<option value="">동네 둘러보기</option><option value="hill">언덕</option><option value="station">역 주변</option><option value="stream">하천</option>';document.querySelector('.meet').append(nearby);nearby.onchange=()=>{const key=nearby.value;if(!key)return;closeSpeech();if(key!=='hill')setEra('now');const p=contextSites[key];Object.assign(desired,{x:p.x,z:p.z,distance:key==='hill'?410:key==='neighbourhood'?280:key==='stream'?380:320,pitch:46,yaw:20});nearby.value=''};
cityButton.onclick=()=>{closeSpeech();Object.assign(desired,{x:180,z:220,distance:1300,pitch:58,yaw:43})};

const campusVisit=document.createElement('select');campusVisit.id='campusVisit';campusVisit.setAttribute('aria-label','대학과 길 자세히 보기');campusVisit.innerHTML='<option value="">대학과 길 자세히 보기</option>'+Object.entries(detailStops).map(([key,p])=>`<option value="${key}">${p.name}</option>`).join('');document.querySelector('.meet').append(campusVisit);campusVisit.onchange=()=>{const stop=detailStops[campusVisit.value];if(!stop)return;closeSpeech();setEra('now');Object.assign(desired,stop);campusVisit.value='';toast(stop.name+'을 살펴보세요')};
app.start();$('loading').classList.add('hidden');window.timeTravel={app,setEra,getState:()=>({era,device:device.deviceType,desired:{...desired},meshes:now.children.length+old.children.length,people:people.length,terrainShared:shared.enabled!==false,schoolLayout:{yard:yardSpec,kkachiFacing:schoolAngle+90,main:school.point(0,0,0),kkachi:kp,parang:bp,songjuk:sp,playground:school.point(0,0,43)},graphicsRevision:'well-homes-and-teleport-r5',teleportArmed,wellHuts,mapAnchors,riverRoute,trainees:trainees.length,universityBuildings,detailStops,campusRoute,textOrientation:'bottom-up RGBA with outward-only faces',contextSites,characterStyle:'block',magpies:magpies.length,wellLocation:{x:wellX,z:wellZ},dykeLocation:{x:dykeX,z:dykeZ},textureUpload:'ImageBitmap'})};
}
