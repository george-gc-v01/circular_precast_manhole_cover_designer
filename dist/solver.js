import { pointInsideOpening, derivedLoads } from "./model.js";

const zeros=(r,c)=>Array.from({length:r},()=>Array(c).fill(0));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const percentile=(arr,p)=>{const a=[...arr].filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return 0;const i=(a.length-1)*p/100,l=Math.floor(i),h=Math.ceil(i);return a[l]+(a[h]-a[l])*(i-l)};

export function generateMesh(project, override={}) {
  const R=project.slab.radius, rings=override.rings??project.mesh.rings, sectors=override.sectors??project.mesh.sectors;
  const openings=override.noOpenings?[]:project.openings;
  const nodes=[{x:0,y:0,r:0,a:0}];
  for(let i=1;i<=rings;i++) for(let j=0;j<sectors;j++) {
    const r=R*i/rings,a=2*Math.PI*j/sectors;
    nodes.push({x:r*Math.cos(a),y:r*Math.sin(a),r,a});
  }
  const id=(ring,sector)=>1+(ring-1)*sectors+((sector%sectors)+sectors)%sectors;
  const raw=[];
  for(let j=0;j<sectors;j++) raw.push([0,id(1,j),id(1,j+1)]);
  for(let i=1;i<rings;i++) for(let j=0;j<sectors;j++) {
    const a=id(i,j),b=id(i,j+1),c=id(i+1,j),d=id(i+1,j+1);
    raw.push([a,c,d],[a,d,b]);
  }
  const inside=(p)=>openings.some(o=>pointInsideOpening(p.x,p.y,o));
  const strict=project.mesh.holeSampling==="strict";
  const elements=raw.filter(e=>{
    const p=e.map(i=>nodes[i]);
    const samples=[{x:(p[0].x+p[1].x+p[2].x)/3,y:(p[0].y+p[1].y+p[2].y)/3}];
    if(strict) samples.push(...p,{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2},{x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2},{x:(p[2].x+p[0].x)/2,y:(p[2].y+p[0].y)/2});
    return !samples.some(inside);
  });
  const used=new Set(elements.flat());
  const map=new Map(),active=[];
  [...used].sort((a,b)=>a-b).forEach(old=>{map.set(old,active.length);active.push({...nodes[old],old});});
  const remapped=elements.map(e=>e.map(n=>map.get(n)));
  return {nodes:active,elements:remapped,rings,sectors};
}

function elementMatrices(coords,t,E,nu,q) {
  const [p1,p2,p3]=coords;
  const det=(p2.x-p1.x)*(p3.y-p1.y)-(p3.x-p1.x)*(p2.y-p1.y);
  const A=Math.abs(det)/2;
  if(A<1e-10) return null;
  const dNx=[(p2.y-p3.y)/det,(p3.y-p1.y)/det,(p1.y-p2.y)/det];
  const dNy=[(p3.x-p2.x)/det,(p1.x-p3.x)/det,(p2.x-p1.x)/det];
  const DbScale=E*t**3/(12*(1-nu**2));
  const Db=[[DbScale,nu*DbScale,0],[nu*DbScale,DbScale,0],[0,0,DbScale*(1-nu)/2]];
  const G=E/(2*(1+nu)),DsScale=(5/6)*G*t;
  const Ds=[[DsScale,0],[0,DsScale]];
  const Bb=zeros(3,9);
  for(let i=0;i<3;i++){
    Bb[0][3*i+1]=dNx[i]; Bb[1][3*i+2]=dNy[i];
    Bb[2][3*i+1]=dNy[i]; Bb[2][3*i+2]=dNx[i];
  }
  const k=zeros(9,9);
  const addBTDB=(B,D,w)=>{for(let i=0;i<9;i++)for(let j=0;j<9;j++){let s=0;for(let a=0;a<D.length;a++)for(let b=0;b<D.length;b++)s+=B[a][i]*D[a][b]*B[b][j];k[i][j]+=s*w;}};
  addBTDB(Bb,Db,A);
  const gauss=[[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]];
  for(const N of gauss){const Bs=zeros(2,9);for(let i=0;i<3;i++){Bs[0][3*i]=dNx[i];Bs[0][3*i+1]=-N[i];Bs[1][3*i]=dNy[i];Bs[1][3*i+2]=-N[i];}addBTDB(Bs,Ds,A/3);}
  // Downward pressure is negative in the plate's transverse axis so sagging
  // moments report as positive bottom-face design moments.
  const f=Array(9).fill(0);for(let i=0;i<3;i++)f[3*i]=-q*A/3;
  return {k,f,A,dNx,dNy,Db,Ds};
}

function sparseCG(rows,b,maxIter=1400,tol=1e-8){
  const n=b.length,x=new Float64Array(n),r=Float64Array.from(b),z=new Float64Array(n),p=new Float64Array(n),diag=new Float64Array(n);
  for(let i=0;i<n;i++){diag[i]=Math.abs(rows[i].get(i)||1);z[i]=r[i]/diag[i];p[i]=z[i];}
  const dot=(a,c)=>{let s=0;for(let i=0;i<n;i++)s+=a[i]*c[i];return s;};
  const mul=(v)=>{const out=new Float64Array(n);for(let i=0;i<n;i++){let s=0;for(const [j,val] of rows[i])s+=val*v[j];out[i]=s;}return out;};
  let rz=dot(r,z),norm0=Math.sqrt(dot(r,r))||1,iter=0,converged=false;
  for(;iter<maxIter;iter++){
    const Ap=mul(p),den=dot(p,Ap);if(Math.abs(den)<1e-30)break;
    const alpha=rz/den;for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*Ap[i];}
    const norm=Math.sqrt(dot(r,r));if(norm/norm0<tol){converged=true;break;}
    for(let i=0;i<n;i++)z[i]=r[i]/diag[i];const next=dot(r,z),beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
  }
  return {x,iterations:iter+1,converged,residual:Math.sqrt(dot(r,r))/norm0};
}

export function solvePlate(project, options={}) {
  const mesh=generateMesh(project,options),{nodes,elements}=mesh;
  const t=project.slab.thickness/1000,nu=.2,fck=project.material.fck;
  const E=22*((fck+8)/10)**.3*1e6;
  const load=options.unitLoad??derivedLoads(project).uls;
  const supportR=options.supportAtEdge?project.slab.radius:project.slab.clearDiameter/2+project.slab.bearingWidth/2;
  const dr=project.slab.radius/mesh.rings;
  let supportNodes=nodes.map((n,i)=>({i,d:Math.abs(n.r-supportR)})).filter(v=>v.d<=dr*.52);
  if(!supportNodes.length){const min=Math.min(...nodes.map(n=>Math.abs(n.r-supportR)));supportNodes=nodes.map((n,i)=>({i,d:Math.abs(n.r-supportR)})).filter(v=>v.d<=min+1e-6);}
  const fixed=new Set(supportNodes.map(v=>3*v.i));
  const fullDofs=nodes.length*3,free=[],freeMap=new Int32Array(fullDofs).fill(-1);
  for(let i=0;i<fullDofs;i++)if(!fixed.has(i)){freeMap[i]=free.length;free.push(i);}
  const rows=Array.from({length:free.length},()=>new Map()),b=new Float64Array(free.length),elementData=[];
  const add=(i,j,v)=>rows[i].set(j,(rows[i].get(j)||0)+v);
  for(const e of elements){
    const coords=e.map(i=>({x:nodes[i].x/1000,y:nodes[i].y/1000}));
    const em=elementMatrices(coords,t,E,nu,load);if(!em)continue;elementData.push(em);
    const dofs=e.flatMap(i=>[3*i,3*i+1,3*i+2]);
    for(let a=0;a<9;a++){const ia=freeMap[dofs[a]];if(ia<0)continue;b[ia]+=em.f[a];for(let c=0;c<9;c++){const ic=freeMap[dofs[c]];if(ic>=0)add(ia,ic,em.k[a][c]);}}
  }
  for(let i=0;i<rows.length;i++)if(!rows[i].has(i))rows[i].set(i,1e-12);
  const solved=sparseCG(rows,b),u=new Float64Array(fullDofs);for(let i=0;i<free.length;i++)u[free[i]]=solved.x[i];
  const results=[];
  elements.forEach((e,ei)=>{
    const em=elementData[ei];if(!em)return;const ue=e.flatMap(n=>[u[3*n],u[3*n+1],u[3*n+2]]);
    const kappa=[0,0,0];
    for(let i=0;i<3;i++){kappa[0]+=em.dNx[i]*ue[3*i+1];kappa[1]+=em.dNy[i]*ue[3*i+2];kappa[2]+=em.dNy[i]*ue[3*i+1]+em.dNx[i]*ue[3*i+2];}
    const M=em.Db.map(row=>row.reduce((s,v,j)=>s+v*kappa[j],0));
    const N=[1/3,1/3,1/3],gamma=[0,0];for(let i=0;i<3;i++){gamma[0]+=em.dNx[i]*ue[3*i]-N[i]*ue[3*i+1];gamma[1]+=em.dNy[i]*ue[3*i]-N[i]*ue[3*i+2];}
    const Q=em.Ds.map(row=>row.reduce((s,v,j)=>s+v*gamma[j],0));
    const c={x:e.reduce((s,n)=>s+nodes[n].x,0)/3,y:e.reduce((s,n)=>s+nodes[n].y,0)/3};const a=Math.atan2(c.y,c.x),co=Math.cos(a),si=Math.sin(a);
    const Mr=M[0]*co*co+M[1]*si*si+2*M[2]*si*co, Mt=M[0]*si*si+M[1]*co*co-2*M[2]*si*co;
    const woodBottom=Math.max(0,M[0]+Math.abs(M[2]),M[1]+Math.abs(M[2]));
    const woodTop=Math.max(0,-M[0]+Math.abs(M[2]),-M[1]+Math.abs(M[2]));
    results.push({e,centroid:c,Mx:M[0],My:M[1],Mxy:M[2],Mr,Mt,Qx:Q[0],Qy:Q[1],Q:Math.hypot(...Q),woodBottom,woodTop,w:e.reduce((s,n)=>s+u[3*n],0)/3});
  });
  const p=Number(project.mesh.designPercentile);
  const summary={
    maxDeflection:Math.max(...Array.from({length:nodes.length},(_,i)=>Math.abs(u[3*i])))*1000,
    designBottom:percentile(results.map(r=>r.woodBottom),p),designTop:percentile(results.map(r=>r.woodTop),p),
    rawBottom:Math.max(...results.map(r=>r.woodBottom)),rawTop:Math.max(...results.map(r=>r.woodTop)),
    designShear:percentile(results.map(r=>r.Q),p),rawShear:Math.max(...results.map(r=>r.Q)),
    designShearInside:percentile(results.filter(r=>{const rr=Math.hypot(r.centroid.x,r.centroid.y);return rr>=project.shearLinks.zoneInner&&rr<=project.shearLinks.zoneOuter}).map(r=>r.Q),p),
    designShearOutside:percentile(results.filter(r=>{const rr=Math.hypot(r.centroid.x,r.centroid.y);return rr<project.shearLinks.zoneInner||rr>project.shearLinks.zoneOuter}).map(r=>r.Q),p),
    nodes:nodes.length,elements:elements.length,supportNodes:supportNodes.length,iterations:solved.iterations,converged:solved.converged,residual:solved.residual,E
  };
  return {mesh,u,results,summary,load};
}

export function reinforcementDesign(project,moment,shear) {
  const t=project.slab.thickness,bar=Number(project.material.barDiameter),cover=project.material.cover,d=t-cover-bar/2,z=.9*d;
  const fyd=project.material.fyk/1.15,fctm=.3*project.material.fck**(2/3);
  const asReq=moment*1e6/(fyd*z),asMin=Math.max(.26*fctm/project.material.fyk*1000*d,.0013*1000*d),asDesign=Math.max(asReq,asMin);
  const area=Math.PI*bar**2/4,rawSpacing=1000*area/asDesign,choices=[300,250,225,200,175,150,125,100,75,60,50];
  const suggestedSpacing=choices.find(s=>s<=Math.min(250,rawSpacing))??50,spacing=Number(project.material.barSpacing??suggestedSpacing),asProv=1000*area/spacing,flexuralUtil=asDesign/asProv;
  const rho=Math.min(.02,asProv/(1000*d)),k=Math.min(2,1+Math.sqrt(200/d));
  const vmin=.035*k**1.5*Math.sqrt(project.material.fck),vrdc=Math.max(.12*k*(100*rho*project.material.fck)**(1/3),vmin);
  const shearResistance=vrdc*d,concreteUtil=shear/shearResistance;
  const links=project.shearLinks??{diameter:8,legs:2,radialSpacing:200,tangentialSpacing:200,cotTheta:1.5};
  const linkArea=Math.PI*links.diameter**2/4,aswPerRow=linkArea*links.legs*1000/links.tangentialSpacing;
  const fywd=project.material.fyk/1.15,cotTheta=clamp(links.cotTheta,1,2.5),tanTheta=1/cotTheta;
  const vrds=aswPerRow/links.radialSpacing*z*fywd*cotTheta/1000;
  const fcd=project.material.fck/1.5,nu1=.6*(1-project.material.fck/250),vrdmax=1000*z*nu1*fcd/(cotTheta+tanTheta)/1000;
  const linkResistance=Math.min(vrds,vrdmax),reinforcedResistance=Math.max(shearResistance,linkResistance),util=shear/reinforcedResistance;
  const rhoW=linkArea*links.legs/(links.radialSpacing*links.tangentialSpacing),rhoWMin=.08*Math.sqrt(project.material.fck)/project.material.fyk;
  return {d,z,fyd,fctm,asReq,asMin,asDesign,spacing,suggestedSpacing,asProv,flexuralUtil,vrdc,shearResistance,concreteUtil,linkArea,aswPerRow,fywd,vrds,vrdmax,linkResistance,reinforcedResistance,rhoW,rhoWMin,radialSpacingLimit:.75*d,tangentialSpacingLimit:.75*d,util,label:`H${bar} @ ${spacing} mm`,linkLabel:`${links.legs}-leg H${links.diameter} @ ${links.radialSpacing} mm radial / ${links.tangentialSpacing} mm tangential`};
}

export function handChecks(project) {
  const L=project.slab.clearDiameter/1000,dL=reinforcementDesign(project,0,0).d/1000,loads=derivedLoads(project);
  const moment=loads.uls*L**2/8,shear=loads.uls*Math.max(0,L/2-dL),design=reinforcementDesign(project,moment,shear);
  const R=project.slab.clearDiameter/2000,nu=.2,plateMoment=loads.uls*R**2*(3+nu)/16;
  const plateDesign=reinforcementDesign(project,plateMoment,shear);
  return {L,loads,moment,shear,design,plateMoment,plateDesign};
}

export function runBenchmark(project) {
  const q=10,R=project.slab.radius/1000,nu=.2,t=project.slab.thickness/1000,E=22*((project.material.fck+8)/10)**.3*1e6,D=E*t**3/(12*(1-nu**2));
  const copy=JSON.parse(JSON.stringify(project));copy.mesh.rings=Math.max(10,Math.min(16,project.mesh.rings));copy.mesh.sectors=Math.max(48,Math.min(96,project.mesh.sectors));
  const fe=solvePlate(copy,{noOpenings:true,supportAtEdge:true,unitLoad:q});
  const analyticalW=q*R**4*(5+nu)/(64*D*(1+nu))*1000;
  const analyticalM=q*R**2*(3+nu)/16;
  const feM=percentile(fe.results.filter(r=>Math.hypot(r.centroid.x,r.centroid.y)<project.slab.radius*.2).map(r=>Math.max(Math.abs(r.Mx),Math.abs(r.My))),50);
  return {analyticalW,feW:fe.summary.maxDeflection,wError:100*(fe.summary.maxDeflection-analyticalW)/analyticalW,analyticalM,feM,mError:100*(feM-analyticalM)/analyticalM,converged:fe.summary.converged,nodes:fe.summary.nodes,elements:fe.summary.elements};
}
