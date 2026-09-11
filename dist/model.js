export const drawingFields = [
  ["outerRadius", "Outer radius", "mm"],
  ["westSlotLength", "West slot length", "mm"],
  ["westSlotWidth", "West slot width", "mm"],
  ["westSlotEdge", "West slot edge clear", "mm"],
  ["westSlotGap", "Slot to Ø400 gap", "mm"],
  ["topD1", "Top opening 1 Ø", "mm"],
  ["topD1Edge", "Opening 1 edge clear", "mm"],
  ["topGap12", "Ø400 to Ø400 gap", "mm"],
  ["topD2", "Top opening 2 Ø", "mm"],
  ["topD2Edge", "Opening 2 edge clear", "mm"],
  ["topGap23", "Ø400 to Ø300 gap", "mm"],
  ["topD3", "Top opening 3 Ø", "mm"],
  ["topD3Edge", "Ø300 edge clear", "mm"],
  ["mainD", "Main opening Ø", "mm"],
  ["mainEdge", "Main opening edge clear", "mm"],
  ["arcChord", "Curved slot chord", "mm"],
  ["arcDatum", "Left datum to slot", "mm"],
  ["arcInnerR", "Curved slot inner R", "mm"],
  ["arcOuterR", "Curved slot outer R", "mm"],
  ["arcWidth", "Curved slot width", "mm"],
  ["arcEdge", "Curved slot edge clear", "mm"],
];

export const baseProject = {
  name: "West Cover Slab",
  slab: { radius: 1670, thickness: 275, clearDiameter: 3000, bearingWidth: 100 },
  material: { fck: 32, fyk: 500, cover: 50, barDiameter: 16, barSpacing: 200 },
  shearLinks: { diameter: 10, legs: 1, radialSpacing: 150, tangentialSpacing: 150, zoneInner: 600, zoneOuter: 1600, cotTheta: 1.5 },
  loads: { soilDepth: 3.5, soilGamma: 20, surcharge: 20, additionalG: 0, concreteGamma: 25, gammaG: 1.35, gammaQ: 1.5 },
  mesh: { rings: 12, sectors: 60, holeSampling: "centroid", designPercentile: 95 },
  dimensions: {
    outerRadius: 1670, westSlotLength: 797, westSlotWidth: 294, westSlotEdge: 251, westSlotGap: 59,
    topD1: 400, topD1Edge: 170, topGap12: 150, topD2: 400, topD2Edge: 217,
    topGap23: 296, topD3: 300, topD3Edge: 180, mainD: 900, mainEdge: 170,
    arcChord: 1565, arcDatum: 889, arcInnerR: 1232, arcOuterR: 1392, arcWidth: 160, arcEdge: 225,
  },
  openings: [],
};

export function cloneProject() {
  const project = JSON.parse(JSON.stringify(baseProject));
  project.openings = deriveOpenings(project);
  return project;
}

function lawAngle(r1, r2, distance) {
  const c = Math.max(-1, Math.min(1, (r1*r1 + r2*r2 - distance*distance)/(2*r1*r2)));
  return Math.acos(c) * 180 / Math.PI;
}

export function deriveOpenings(project) {
  const d = project.dimensions;
  project.slab.radius = d.outerRadius;
  const R = d.outerRadius;
  const r1 = R - d.topD1/2 - d.topD1Edge;
  const r2 = R - d.topD2/2 - d.topD2Edge;
  const r3 = R - d.topD3/2 - d.topD3Edge;
  const a1 = 104;
  const a2 = a1 - lawAngle(r1, r2, d.topD1/2 + d.topD2/2 + d.topGap12);
  const a3 = a2 - lawAngle(r2, r3, d.topD2/2 + d.topD3/2 + d.topGap23);
  const polar = (r,a) => ({x:r*Math.cos(a*Math.PI/180), y:r*Math.sin(a*Math.PI/180)});
  const c1 = polar(r1,a1), c2 = polar(r2,a2), c3 = polar(r3,a3);
  const reach = d.westSlotLength/2 + d.topD1/2 + d.westSlotGap;
  const halfStraight=Math.max(0,(d.westSlotLength-d.westSlotWidth)/2),targetExtent=R-d.westSlotEdge;
  let slotAngle=45,slot={x:0,y:0},best=Infinity;
  // The drawing supplies both the clear gap to the first circle and the edge
  // clearance. Resolve the slot angle parametrically so both dimensions drive it.
  for(let trial=15;trial<=70;trial+=.1){
    const a=trial*Math.PI/180,x=c1.x-reach*Math.cos(a),y=c1.y-reach*Math.sin(a);
    const ends=[-halfStraight,halfStraight].map(u=>Math.hypot(x+u*Math.cos(a),y+u*Math.sin(a))+d.westSlotWidth/2);
    const error=Math.abs(Math.max(...ends)-targetExtent);
    if(error<best){best=error;slotAngle=trial;slot={x,y};}
  }
  const meanR = (d.arcInnerR+d.arcOuterR)/2;
  const halfSpan = Math.asin(Math.min(.999,d.arcChord/(2*meanR))) * 180/Math.PI;
  const arcCenterY = d.arcEdge + d.arcOuterR - R;
  const arcCenterX = d.arcDatum - R + d.arcChord/2;
  return [
    {id:"west-slot",name:"West rounded slot",type:"capsule",x:slot.x,y:slot.y,length:d.westSlotLength,width:d.westSlotWidth,rotation:slotAngle},
    {id:"top-400-a",name:"Top opening A",type:"circle",x:c1.x,y:c1.y,diameter:d.topD1},
    {id:"top-400-b",name:"Top opening B",type:"circle",x:c2.x,y:c2.y,diameter:d.topD2},
    {id:"top-300",name:"Top opening C",type:"circle",x:c3.x,y:c3.y,diameter:d.topD3},
    {id:"main-900",name:"Main access opening",type:"circle",x:R-d.mainD/2-d.mainEdge,y:0,diameter:d.mainD},
    {id:"curved-slot",name:"Lower curved slot",type:"arcslot",x:arcCenterX,y:arcCenterY,innerRadius:d.arcInnerR,outerRadius:d.arcOuterR,startAngle:-90-halfSpan,endAngle:-90+halfSpan},
  ];
}

export function getPath(object, path) {
  return path.split(".").reduce((v,k)=>v?.[k],object);
}

export function setPath(object, path, value) {
  const parts=path.split("."); let ref=object;
  for(let i=0;i<parts.length-1;i++) ref=ref[parts[i]];
  ref[parts.at(-1)]=value;
}

export function pointInsideOpening(x,y,o) {
  if(o.type==="circle") return Math.hypot(x-o.x,y-o.y) <= o.diameter/2;
  if(o.type==="capsule") {
    const a=-o.rotation*Math.PI/180, dx=x-o.x, dy=y-o.y;
    const u=dx*Math.cos(a)-dy*Math.sin(a), v=dx*Math.sin(a)+dy*Math.cos(a);
    const halfStraight=Math.max(0,(o.length-o.width)/2);
    const cx=Math.max(-halfStraight,Math.min(halfStraight,u));
    return Math.hypot(u-cx,v)<=o.width/2;
  }
  if(o.type==="arcslot") {
    const dx=x-o.x,dy=y-o.y,r=Math.hypot(dx,dy);
    let a=Math.atan2(dy,dx)*180/Math.PI;
    const start=o.startAngle,end=o.endAngle;
    return r>=o.innerRadius && r<=o.outerRadius && a>=start && a<=end;
  }
  return false;
}

export function openingExtent(o) {
  if(o.type==="circle") return Math.hypot(o.x,o.y)+o.diameter/2;
  if(o.type==="capsule") {
    const a=o.rotation*Math.PI/180, hs=Math.max(0,(o.length-o.width)/2), r=o.width/2;
    const ends=[[-hs,0],[hs,0]].map(([u,v])=>({x:o.x+u*Math.cos(a)-v*Math.sin(a),y:o.y+u*Math.sin(a)+v*Math.cos(a)}));
    return Math.max(...ends.map(p=>Math.hypot(p.x,p.y)+r));
  }
  if(o.type==="arcslot") {
    const samples=[];
    for(let i=0;i<=20;i++){const a=(o.startAngle+(o.endAngle-o.startAngle)*i/20)*Math.PI/180;samples.push(Math.hypot(o.x+o.outerRadius*Math.cos(a),o.y+o.outerRadius*Math.sin(a)));}
    return Math.max(...samples);
  }
  return 0;
}

export function openingArea(o) {
  if(o.type==="circle") return Math.PI*(o.diameter/2)**2;
  if(o.type==="capsule") return Math.PI*(o.width/2)**2 + Math.max(0,o.length-o.width)*o.width;
  if(o.type==="arcslot") return Math.PI*(o.outerRadius**2-o.innerRadius**2)*(o.endAngle-o.startAngle)/360;
  return 0;
}

export function edgeGap(a,b) {
  if(a.type==="circle"&&b.type==="circle") return Math.hypot(a.x-b.x,a.y-b.y)-a.diameter/2-b.diameter/2;
  const samples=[];
  const sampleBoundary=(o)=>{
    if(o.type==="circle") for(let i=0;i<72;i++){const t=2*Math.PI*i/72;samples.push({owner:o,x:o.x+o.diameter/2*Math.cos(t),y:o.y+o.diameter/2*Math.sin(t)});}
    if(o.type==="capsule") {const aa=o.rotation*Math.PI/180,hs=(o.length-o.width)/2,r=o.width/2;for(let e of [-1,1])for(let i=0;i<37;i++){const t=(e===1?-90:90)+i*180/36;const u=e*hs+r*Math.cos(t*Math.PI/180),v=r*Math.sin(t*Math.PI/180);samples.push({owner:o,x:o.x+u*Math.cos(aa)-v*Math.sin(aa),y:o.y+u*Math.sin(aa)+v*Math.cos(aa)});}}
  };
  sampleBoundary(a); const first=samples.length; sampleBoundary(b);
  let min=Infinity;
  for(let i=0;i<first;i++)for(let j=first;j<samples.length;j++)min=Math.min(min,Math.hypot(samples[i].x-samples[j].x,samples[i].y-samples[j].y));
  return min;
}

export function derivedLoads(p) {
  const soil=p.loads.soilDepth*p.loads.soilGamma;
  const self=p.slab.thickness/1000*p.loads.concreteGamma;
  const g=soil+self+p.loads.additionalG;
  const q=p.loads.surcharge;
  return {soil,self,g,q,uls:p.loads.gammaG*g+p.loads.gammaQ*q,sls:g+q};
}
