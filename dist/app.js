import { cloneProject, drawingFields, deriveOpenings, getPath, setPath, openingExtent, openingArea, edgeGap, derivedLoads, pointInsideOpening } from "./model.js";
import { generateMesh, solvePlate, reinforcementDesign, handChecks, runBenchmark } from "./solver.js";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let project=cloneProject(),selectedId="main-900",view="geometry",analysis=null,meshCache=null,stale=false,drag=null;
const svg=$("#slabSvg");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const n=(v,d=0)=>Number(v).toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function markStale(){analysis=null;meshCache=null;stale=true;$("#modelStatus").textContent="Mesh and analysis require update";$("#modelStatus").className="status status-stale";renderAll();}
function markCurrent(){stale=false;$("#modelStatus").textContent="Results current";$("#modelStatus").className="status status-ready";}

function setupStaticControls(){
  $$("[data-path]").forEach(el=>{
    el.value=getPath(project,el.dataset.path);
    el.addEventListener("change",()=>{
      const value=el.tagName==="SELECT"&&el.dataset.path==="mesh.holeSampling"?el.value:Number(el.value);
      setPath(project,el.dataset.path,value);
      if(el.dataset.path==="slab.radius"){project.dimensions.outerRadius=value;project.openings=deriveOpenings(project);}
      markStale();
    });
  });
}

function renderDrawingFields(){
  $("#drawingDimensions").innerHTML=drawingFields.map(([key,label,unit])=>`<label>${label}<span><input data-dimension="${key}" type="number" value="${project.dimensions[key]}" step="1"> ${unit}</span></label>`).join("");
  $$('[data-dimension]').forEach(el=>el.addEventListener("change",()=>{
    project.dimensions[el.dataset.dimension]=Number(el.value);
    project.openings=deriveOpenings(project);selectedId=project.openings.some(o=>o.id===selectedId)?selectedId:project.openings[0].id;
    syncStaticInputs();markStale();
  }));
}

function syncStaticInputs(){ $$('[data-path]').forEach(el=>el.value=getPath(project,el.dataset.path)); }

function openingDescription(o){
  if(o.type==="circle")return `Ø${n(o.diameter)} · x ${n(o.x)} · y ${n(o.y)}`;
  if(o.type==="capsule")return `${n(o.length)} × ${n(o.width)} · ${n(o.rotation)}°`;
  return `R${n(o.innerRadius)}–R${n(o.outerRadius)} · ${n(o.endAngle-o.startAngle,1)}°`;
}

function renderOpenings(){
  $("#openingList").innerHTML=project.openings.map(o=>`<div class="opening-row ${o.id===selectedId?"active":""}" data-opening-row="${o.id}"><div><strong>${esc(o.name)}</strong><span>${openingDescription(o)}</span></div><button aria-label="Select ${esc(o.name)}">›</button></div>`).join("");
  $$('[data-opening-row]').forEach(row=>row.addEventListener("click",()=>{selectedId=row.dataset.openingRow;renderOpenings();renderSvg();}));
  const o=project.openings.find(v=>v.id===selectedId),box=$("#openingEditor");
  if(!o){box.className="opening-editor empty";box.textContent="Select an opening to edit.";return;}
  const common=`<label>Name<span><input data-op="name" value="${esc(o.name)}"></span></label><label>Type<span><select data-op="type"><option value="circle" ${o.type==="circle"?"selected":""}>Circle</option><option value="capsule" ${o.type==="capsule"?"selected":""}>Rounded slot</option><option value="arcslot" ${o.type==="arcslot"?"selected":""}>Curved slot</option></select></span></label><label>Centre x<span><input data-op="x" type="number" value="${Number(o.x.toFixed(1))}"> mm</span></label><label>Centre y<span><input data-op="y" type="number" value="${Number(o.y.toFixed(1))}"> mm</span></label>`;
  let shape="";
  if(o.type==="circle")shape=`<label>Diameter<span><input data-op="diameter" type="number" value="${o.diameter}"> mm</span></label>`;
  if(o.type==="capsule")shape=`<label>Overall length<span><input data-op="length" type="number" value="${o.length}"> mm</span></label><label>Width<span><input data-op="width" type="number" value="${o.width}"> mm</span></label><label>Rotation<span><input data-op="rotation" type="number" value="${o.rotation}"> deg</span></label>`;
  if(o.type==="arcslot")shape=`<label>Inner radius<span><input data-op="innerRadius" type="number" value="${o.innerRadius}"> mm</span></label><label>Outer radius<span><input data-op="outerRadius" type="number" value="${o.outerRadius}"> mm</span></label><label>Start angle<span><input data-op="startAngle" type="number" value="${Number(o.startAngle.toFixed(1))}"> deg</span></label><label>End angle<span><input data-op="endAngle" type="number" value="${Number(o.endAngle.toFixed(1))}"> deg</span></label>`;
  box.className="opening-editor";box.innerHTML=`<div class="editor-grid">${common}${shape}</div><div class="editor-actions"><button class="delete-button" id="deleteOpening">Delete opening</button></div>`;
  $$('[data-op]').forEach(el=>el.addEventListener("change",()=>{
    const oldType=o.type,value=el.dataset.op==="name"||el.dataset.op==="type"?el.value:Number(el.value);o[el.dataset.op]=value;
    if(el.dataset.op==="type"&&oldType!==value){if(value==="circle")Object.assign(o,{diameter:400});if(value==="capsule")Object.assign(o,{length:700,width:250,rotation:0});if(value==="arcslot")Object.assign(o,{innerRadius:900,outerRadius:1050,startAngle:-120,endAngle:-60});}
    markStale();
  }));
  $("#deleteOpening").addEventListener("click",()=>{project.openings=project.openings.filter(v=>v.id!==o.id);selectedId=project.openings[0]?.id??null;markStale();});
}

function arcPath(o){
  const point=(r,a)=>{const t=a*Math.PI/180;return [o.x+r*Math.cos(t),-(o.y+r*Math.sin(t))]};
  const [a,b,c,d]=[point(o.outerRadius,o.startAngle),point(o.outerRadius,o.endAngle),point(o.innerRadius,o.endAngle),point(o.innerRadius,o.startAngle)];
  const large=Math.abs(o.endAngle-o.startAngle)>180?1:0;
  return `M ${a[0]} ${a[1]} A ${o.outerRadius} ${o.outerRadius} 0 ${large} 0 ${b[0]} ${b[1]} L ${c[0]} ${c[1]} A ${o.innerRadius} ${o.innerRadius} 0 ${large} 1 ${d[0]} ${d[1]} Z`;
}

function openingSvg(o){
  const cls=`opening-shape ${o.id===selectedId?"selected":""} ${openingExtent(o)>project.slab.radius+1?"invalid-geometry":""}`;
  if(o.type==="circle")return `<g data-opening="${o.id}"><circle class="${cls}" cx="${o.x}" cy="${-o.y}" r="${o.diameter/2}"/><text class="opening-label" x="${o.x}" y="${-o.y+16}">Ø${n(o.diameter)}</text></g>`;
  if(o.type==="capsule")return `<g data-opening="${o.id}" transform="translate(${o.x} ${-o.y}) rotate(${-o.rotation})"><rect class="${cls}" x="${-o.length/2}" y="${-o.width/2}" width="${o.length}" height="${o.width}" rx="${o.width/2}"/><text class="opening-label" x="0" y="16">${n(o.length)} × ${n(o.width)}</text></g>`;
  return `<g data-opening="${o.id}"><path class="${cls}" d="${arcPath(o)}"/><text class="opening-label" x="${o.x}" y="${-(o.y+(o.innerRadius+o.outerRadius)/2)+16}">R${n(o.innerRadius)} / R${n(o.outerRadius)}</text></g>`;
}

function dimLine(x1,y1,x2,y2,label,offset=0){
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;const a=[x1+nx*offset,-(y1+ny*offset)],b=[x2+nx*offset,-(y2+ny*offset)];
  return `<g><line class="dim-line" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" marker-start="url(#arrow)" marker-end="url(#arrow)"/><text class="dim-text" x="${(a[0]+b[0])/2+nx*35}" y="${(a[1]+b[1])/2-ny*35}">${label}</text></g>`;
}

function colorScale(value,min,max){
  const t=max===min?.5:clamp((value-min)/(max-min),0,1);const stops=[[31,88,113],[55,142,166],[230,235,225],[226,154,67],[157,54,55]],p=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),f=p-i;return `rgb(${stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f)).join(",")})`;
}

function updateContourLegend(title,min,max,unit){
  const box=$("#contourLegend");
  if(title){box.classList.remove("hidden");$("#legend").textContent=`${title} (${unit})`;$("#legendMin").textContent=n(min,2);$("#legendMax").textContent=n(max,2);}
  else box.classList.add("hidden");
}

function shearLinksSvg(){
  const s=project.shearLinks,parts=[];
  if(!s||s.radialSpacing<=0||s.tangentialSpacing<=0||s.zoneInner>=s.zoneOuter)return "";
  for(let r=s.zoneInner;r<=Math.min(s.zoneOuter,project.slab.radius);r+=s.radialSpacing){
    parts.push(`<circle class="link-ring" cx="0" cy="0" r="${r}"/>`);
    const count=Math.max(12,Math.ceil(2*Math.PI*r/s.tangentialSpacing));
    for(let i=0;i<count;i++){const a=2*Math.PI*i/count,x=r*Math.cos(a),y=r*Math.sin(a);if(!project.openings.some(o=>pointInsideOpening(x,y,o)))parts.push(`<circle class="link-stud" cx="${x}" cy="${-y}" r="12"><title>${s.legs}-leg H${s.diameter} shear-link position</title></circle>`);}
  }
  return `<g class="shear-link-layout">${parts.join("")}</g>`;
}

function renderSvg(){
  const R=project.slab.radius,supportR=project.slab.clearDiameter/2+project.slab.bearingWidth/2;
  let content=`<defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#87949c"/></marker></defs>`;
  content+=`<circle class="slab-disc" cx="0" cy="0" r="${R}"/><circle class="bearing-ring" cx="0" cy="0" r="${supportR}" style="stroke-width:${project.slab.bearingWidth}"/><circle class="support-line" cx="0" cy="0" r="${supportR}"/><line class="axis-line" x1="${-R}" y1="0" x2="${R}" y2="0"/><line class="axis-line" x1="0" y1="${-R}" x2="0" y2="${R}"/>`;
  const displayMesh=analysis?.mesh??meshCache;
  if((view==="mesh"||view==="deflection"||view==="moment"||view==="shear")&&displayMesh){
    if((view==="deflection"||view==="moment"||view==="shear")&&analysis){
      const vals=analysis.results.map(r=>view==="deflection"?r.w*1000:view==="moment"?r.woodBottom:r.Q),min=Math.min(...vals),max=Math.max(...vals);
      const unit=view==="deflection"?"mm":view==="moment"?"kNm/m":"kN/m",title=view==="deflection"?"Deflection":view==="moment"?"Bottom Wood–Armer moment":"Resultant plate shear";
      analysis.results.forEach((r,i)=>{const pts=r.e.map(id=>`${analysis.mesh.nodes[id].x},${-analysis.mesh.nodes[id].y}`).join(" ");content+=`<polygon class="contour-element" points="${pts}" fill="${colorScale(vals[i],min,max)}"><title>${n(vals[i],view==="deflection"?3:1)} ${unit}</title></polygon>`;});
      updateContourLegend(title,min,max,unit);
    }else{
      displayMesh.elements.forEach(e=>{content+=`<polygon class="mesh-line" points="${e.map(id=>`${displayMesh.nodes[id].x},${-displayMesh.nodes[id].y}`).join(" ")}"/>`;});
      $("#legend").textContent=`${n(displayMesh.nodes.length)} nodes · ${n(displayMesh.elements.length)} triangular plate elements`;
      updateContourLegend(null,0,0,"");
    }
  }else {$("#legend").textContent="Dimensions in millimetres";updateContourLegend(null,0,0,"");}
  if(view==="shear")content+=shearLinksSvg();
  content+=project.openings.map(openingSvg).join("");
  const main=project.openings.find(o=>o.id==="main-900"),a=project.openings.find(o=>o.id==="top-400-a"),b=project.openings.find(o=>o.id==="top-400-b"),c=project.openings.find(o=>o.id==="top-300");
  if(view==="geometry"){
    content+=dimLine(0,0,R,0,`R${n(R)}`,-90);
    if(main)content+=dimLine(main.x-main.diameter/2,main.y,main.x+main.diameter/2,main.y,`Ø${n(main.diameter)}`);
    if(a&&b)content+=dimLine(a.x,a.y,b.x,b.y,`${n(edgeGap(a,b))} clear`,80);
    if(b&&c)content+=dimLine(b.x,b.y,c.x,c.y,`${n(edgeGap(b,c))} clear`,80);
  }
  svg.innerHTML=content;
  $$('[data-opening]').forEach(g=>g.addEventListener("pointerdown",startDrag));
}

function startDrag(e){
  const id=e.currentTarget.dataset.opening,o=project.openings.find(v=>v.id===id);if(!o||o.type==="arcslot")return;
  selectedId=id;drag={id,pointer:e.pointerId};svg.setPointerCapture(e.pointerId);renderOpenings();e.preventDefault();
}
function svgPoint(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const t=p.matrixTransform(svg.getScreenCTM().inverse());return{x:t.x,y:-t.y};}
svg.addEventListener("pointermove",e=>{$("#cursorReadout").textContent=`x ${n(svgPoint(e).x)} mm · y ${n(svgPoint(e).y)} mm`;if(!drag||drag.pointer!==e.pointerId)return;const o=project.openings.find(v=>v.id===drag.id),p=svgPoint(e);o.x=Math.round(p.x/5)*5;o.y=Math.round(p.y/5)*5;analysis=null;meshCache=null;stale=true;renderSvg();});
svg.addEventListener("pointerup",e=>{if(drag?.pointer===e.pointerId){drag=null;renderOpenings();markStale();}});

function dimensionCheckRows(){
  const d=project.dimensions,R=project.slab.radius,by=id=>project.openings.find(o=>o.id===id),a=by("top-400-a"),b=by("top-400-b"),c=by("top-300"),main=by("main-900"),slot=by("west-slot"),arc=by("curved-slot");
  const arcMean=(arc.innerRadius+arc.outerRadius)/2,arcChord=2*arcMean*Math.sin((arc.endAngle-arc.startAngle)*Math.PI/360);
  return [
    ["Outer radius",d.outerRadius,R],["West slot length",d.westSlotLength,slot.length],["West slot width",d.westSlotWidth,slot.width],["West slot edge clear",d.westSlotEdge,R-openingExtent(slot)],
    ["Slot to first Ø400",d.westSlotGap,edgeGap(slot,a)],["Top opening A",d.topD1,a.diameter],["Opening A edge clear",d.topD1Edge,R-openingExtent(a)],["A–B clear gap",d.topGap12,edgeGap(a,b)],
    ["Top opening B",d.topD2,b.diameter],["Opening B edge clear",d.topD2Edge,R-openingExtent(b)],["B–C clear gap",d.topGap23,edgeGap(b,c)],["Top opening C",d.topD3,c.diameter],["Opening C edge clear",d.topD3Edge,R-openingExtent(c)],
    ["Main opening",d.mainD,main.diameter],["Main edge clear",d.mainEdge,R-openingExtent(main)],
    ["Curved slot chord",d.arcChord,arcChord],["Curved slot left datum",d.arcDatum,R+arc.x-arcChord/2],["Curved slot inner radius",d.arcInnerR,arc.innerRadius],["Curved slot outer radius",d.arcOuterR,arc.outerRadius],
    ["Curved slot width",d.arcWidth,arc.outerRadius-arc.innerRadius],["Curved slot edge clear",d.arcEdge,R-openingExtent(arc)],
  ];
}

function renderLoadSummary(){const l=derivedLoads(project);$("#loadSummary").innerHTML=`Soil pressure <strong>${n(l.soil,1)} kN/m²</strong><br>Slab self-weight <strong>${n(l.self,1)} kN/m²</strong><br>ULS pressure <strong>${n(l.uls,1)} kN/m²</strong><br>SLS characteristic pressure <strong>${n(l.sls,1)} kN/m²</strong>`;}

function provision(moment,shear){return reinforcementDesign(project,moment,shear)}
function indicativeThickness(){
  for(let h=250;h<=650;h+=10){
    const p=JSON.parse(JSON.stringify(project));p.slab.thickness=h;const c=handChecks(p),d=c.plateDesign;
    if(d.flexuralUtil<=1&&c.design.util<=1&&p.shearLinks.radialSpacing<=d.radialSpacingLimit&&p.shearLinks.tangentialSpacing<=d.tangentialSpacingLimit)return h;
  }
  return null;
}
function renderResults(){
  const hand=handChecks(project),minThickness=indicativeThickness(),A=Math.PI*project.slab.radius**2-project.openings.reduce((s,o)=>s+openingArea(o),0),openPct=100*(1-A/(Math.PI*project.slab.radius**2));
  const s=analysis?.summary,designBottom=analysis?provision(s.designBottom,s.designShearInside):hand.plateDesign,designTop=analysis?provision(s.designTop,s.designShearInside):provision(0,hand.shear);
  const outsideUtil=analysis?s.designShearOutside/designBottom.shearResistance:0;
  const slsDeflection=analysis?s.maxDeflection*hand.loads.sls/hand.loads.uls:0,deflectionLimit=project.slab.clearDiameter/250;
  const cards=analysis?[
    ["ULS pressure",`${n(hand.loads.uls,1)} kN/m²`,"G + Q"],["Uncracked FE deflection",`${n(slsDeflection,2)} mm`,`${n(deflectionLimit,1)} mm span/250 screen`],
    ["Bottom design moment",`${n(s.designBottom,1)} kNm/m`,`${project.mesh.designPercentile}th percentile`],["Top design moment",`${n(s.designTop,1)} kNm/m`,`${project.mesh.designPercentile}th percentile`],
    ["Link-zone shear",`${n(s.designShearInside,1)} kN/m`,`${project.mesh.designPercentile}th percentile`],["Outside-zone shear",`${n(s.designShearOutside,1)} kN/m`,"concrete resistance"],
    ["Bottom flexural utilisation",n(designBottom.flexuralUtil,2),`${designBottom.label}`],["Link-zone utilisation",n(designBottom.util,2),`${designBottom.linkLabel}`],
    ["Outside-zone shear utilisation",n(outsideUtil,2),"concrete resistance only"],["Mesh",`${n(s.elements)} elements`,`${project.mesh.rings} rings × ${project.mesh.sectors} sectors`]
  ]:[
    ["ULS pressure",`${n(hand.loads.uls,1)} kN/m²`,"G + Q"],["Open area",`${n(openPct,1)}%`,"of gross slab"],["Indicative thickness",minThickness?`${n(minThickness)} mm`:"Review", "quick detailing screen"],["Plate hand-check moment",`${n(hand.plateMoment,1)} kNm/m`,"solid circular plate"]
  ];
  $("#resultCards").innerHTML=cards.map(c=>`<div class="result-card"><span>${c[0]}</span><strong>${c[1]}</strong><small>${c[2]}</small></div>`).join("");
  $("#reinforcementSummary").innerHTML=`<div class="reinforcement-row"><span>Bottom, each direction</span><strong>${designBottom.label}</strong></div><div class="reinforcement-row"><span>Top, each direction</span><strong>${designTop.label}</strong></div><div class="reinforcement-row"><span>Provided steel</span><strong>${n(designBottom.asProv)} mm²/m</strong></div><div class="reinforcement-row"><span>Bottom / top flexural utilisation</span><strong>${n(designBottom.flexuralUtil,2)} / ${n(designTop.flexuralUtil,2)}</strong></div><div class="reinforcement-row"><span>Radial shear links</span><strong>${designBottom.linkLabel}</strong></div><div class="reinforcement-row"><span>Link zone</span><strong>r = ${n(project.shearLinks.zoneInner)}–${n(project.shearLinks.zoneOuter)} mm</strong></div><div class="reinforcement-row"><span>Concrete shear resistance</span><strong>${n(designBottom.shearResistance,1)} kN/m</strong></div><div class="reinforcement-row"><span>Link resistance V<sub>Rd,s</sub></span><strong>${n(designBottom.vrds,1)} kN/m</strong></div><div class="reinforcement-row"><span>Strut limit V<sub>Rd,max</sub></span><strong>${n(designBottom.vrdmax,1)} kN/m</strong></div><div class="reinforcement-row"><span>Effective depth</span><strong>${n(designBottom.d)} mm</strong></div>`;
  const util=hand.design.util,cls=util>1?"fail":util>.8?"warn":"";
  $("#handChecks").innerHTML=`
    <div class="hand-check"><div><span>ULS load build-up</span><strong>${n(hand.loads.uls,1)} kN/m²</strong></div><code>1.35 × (${n(hand.loads.soil,1)} soil + ${n(hand.loads.self,1)} self + ${n(project.loads.additionalG,1)} Gk) + 1.50 × ${n(hand.loads.q,1)} surcharge</code></div>
    <div class="hand-check"><div><span>Simply supported plate moment</span><strong>${n(hand.plateMoment,1)} kNm/m</strong></div><code>M = qR²(3 + ν) / 16</code></div>
    <div class="hand-check"><div><span>One-way strip comparison</span><strong>${n(hand.moment,1)} kNm/m</strong></div><code>Upper-bound comparison: qL² / 8. It does not govern the circular FE baseline.</code></div>
    <div class="hand-check"><div><span>Plate-check flexural steel</span><strong>${n(hand.plateDesign.asDesign)} / ${n(hand.plateDesign.asProv)} mm²/m</strong></div><code>Required incl. minimum / provided; H${n(project.material.barDiameter)} @ ${n(project.material.barSpacing)} each direction</code></div>
    <div class="hand-check"><div><span>One-way shear at d</span><strong>${n(hand.shear,1)} kN/m</strong></div><code>VEd = q(L/2 − d); concrete V_Rd,c = ${n(hand.design.shearResistance,1)} kN/m</code></div>
    <div class="hand-check"><div><span>Radial shear-link resistance</span><strong>${n(hand.design.vrds,1)} kN/m</strong></div><code>V_Rd,s = (A_sw / s_r) z f_ywd cotθ; V_Rd,max = ${n(hand.design.vrdmax,1)} kN/m</code><div class="util-bar"><span class="${cls}" style="width:${Math.min(100,util*100)}%"></span></div></div>`;
  const dims=dimensionCheckRows();$("#dimensionChecks").innerHTML=dims.map(([label,given,current])=>{const delta=Math.abs(current-given),ok=delta<=Math.max(2,Math.abs(given)*.015);return `<div class="check-item"><span class="check-dot ${ok?"":"warn"}"></span><span>${label}<br><em>given ${n(given)} mm</em></span><strong>${n(current)} mm</strong></div>`}).join("");
  const warnings=[];
  project.openings.forEach(o=>{const gap=RGap(o);if(gap<0)warnings.push([true,`${o.name} extends ${n(-gap)} mm outside the slab.`]);else if(gap<100)warnings.push([false,`${o.name} has only ${n(gap)} mm edge clearance.`]);});
  if(hand.design.concreteUtil>1&&util<=1)warnings.push([false,`Concrete alone gives shear utilisation ${n(hand.design.concreteUtil,2)}; the selected radial links reduce it to ${n(util,2)} within their zone.`]);
  if(util>1)warnings.push([true,`Conservative one-way shear utilisation with the selected links is ${n(util,2)}. Increase thickness or provide more shear reinforcement.`]);
  if(minThickness&&project.slab.thickness<minThickness)warnings.push([true,`The quick thickness screen indicates at least ${n(minThickness)} mm for the current inputs.`]);
  if(analysis&&designBottom.util>1)warnings.push([true,`FE shear utilisation inside the reinforced zone is ${n(designBottom.util,2)} with the selected radial links.`]);
  if(analysis&&outsideUtil>1)warnings.push([true,`FE shear utilisation outside the link zone is ${n(outsideUtil,2)} using concrete resistance only. Extend the zone or revise the slab.`]);
  if(analysis&&designBottom.flexuralUtil>1)warnings.push([true,`Bottom flexural utilisation is ${n(designBottom.flexuralUtil,2)} for ${designBottom.label}. Increase steel or slab thickness.`]);
  if(analysis&&designTop.flexuralUtil>1)warnings.push([true,`Top flexural utilisation is ${n(designTop.flexuralUtil,2)} for ${designTop.label}. Increase steel or slab thickness.`]);
  if(analysis&&slsDeflection>deflectionLimit)warnings.push([true,`Uncracked SLS deflection ${n(slsDeflection,2)} mm exceeds the span/250 screen of ${n(deflectionLimit,1)} mm.`]);
  if(designBottom.rhoW<designBottom.rhoWMin)warnings.push([true,`Selected shear-link ratio ${n(designBottom.rhoW,5)} is below the EC2 minimum ${n(designBottom.rhoWMin,5)}.`]);
  if(project.shearLinks.radialSpacing>designBottom.radialSpacingLimit)warnings.push([true,`Radial link spacing exceeds the indicative 0.75d limit of ${n(designBottom.radialSpacingLimit)} mm.`]);
  if(project.shearLinks.tangentialSpacing>designBottom.tangentialSpacingLimit)warnings.push([true,`Tangential link spacing exceeds the indicative 0.75d limit of ${n(designBottom.tangentialSpacingLimit)} mm.`]);
  if(analysis&&!s.converged)warnings.push([true,"Iterative FE solution did not meet the target residual. Increase mesh quality or review support connectivity."]);
  if(analysis&&s.rawBottom>1.5*s.designBottom)warnings.push([false,"Raw peak opening moment materially exceeds the smoothed design value. Review local averaging and trimming reinforcement."]);
  warnings.push([false,"The Ø900 opening and narrow ligaments require local reinforcement and anchorage detailing."],[false,"Check precast lifting, handling, bearing, construction and groundwater conditions separately."]);
  $("#warnings").innerHTML=warnings.map(([critical,text])=>`<div class="warning-item ${critical?"critical":""}"><span>${text}</span></div>`).join("");
}
function RGap(o){return project.slab.radius-openingExtent(o)}

function renderAll(){renderDrawingFields();renderOpenings();renderLoadSummary();renderResults();renderSvg();}

async function analyse(){
  const invalid=project.openings.some(o=>openingExtent(o)>project.slab.radius+1);if(invalid){alert("Resolve openings outside the slab before analysis.");return;}
  $("#analysisOverlay").classList.remove("hidden");await new Promise(r=>setTimeout(r,40));
  try{analysis=solvePlate(project);meshCache=analysis.mesh;markCurrent();view="moment";syncViewButtons();renderAll();}
  catch(err){console.error(err);alert(`Analysis could not be completed: ${err.message}`);}
  finally{$("#analysisOverlay").classList.add("hidden");}
}

function syncViewButtons(){$$(".view-button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));}

function saveProject(){const blob=new Blob([JSON.stringify(project,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="west-cover-slab-project.json";a.click();URL.revokeObjectURL(a.href);}
function loadProject(file){const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data.slab||!Array.isArray(data.openings))throw new Error("Not a valid cover slab project");data.shearLinks??=cloneProject().shearLinks;project=data;selectedId=project.openings[0]?.id??null;syncStaticInputs();markStale();}catch(e){alert(e.message)}};reader.readAsText(file);}

setupStaticControls();renderAll();
$$(".tab").forEach(btn=>btn.addEventListener("click",()=>{$$(".tab,.tab-panel").forEach(e=>e.classList.remove("active"));btn.classList.add("active");$("#tab-"+btn.dataset.tab).classList.add("active");}));
$$(".view-button").forEach(btn=>btn.addEventListener("click",()=>{view=btn.dataset.view;if(view==="mesh"&&!meshCache)meshCache=generateMesh(project);syncViewButtons();renderSvg();}));
$("#analyseBtn").addEventListener("click",analyse);$("#saveBtn").addEventListener("click",saveProject);$("#loadInput").addEventListener("change",e=>e.target.files[0]&&loadProject(e.target.files[0]));
$("#resetBtn").addEventListener("click",()=>{project=cloneProject();selectedId="main-900";analysis=null;meshCache=null;syncStaticInputs();markStale();});
$("#addOpeningBtn").addEventListener("click",()=>{const id=`opening-${Date.now()}`;project.openings.push({id,name:"New circular opening",type:"circle",x:0,y:0,diameter:300});selectedId=id;markStale();});
$("#benchmarkBtn").addEventListener("click",async()=>{const box=$("#benchmarkResult");box.textContent="Running benchmark…";await new Promise(r=>setTimeout(r,30));try{const b=runBenchmark(project),ok=Math.abs(b.wError)<15&&Math.abs(b.mError)<20;box.innerHTML=`<strong>${ok?"Benchmark within preliminary tolerance":"Benchmark requires review"}</strong><br>Deflection: FE ${n(b.feW,4)} mm vs analytical ${n(b.analyticalW,4)} mm (${n(b.wError,1)}%)<br>Centre moment: FE ${n(b.feM,2)} vs analytical ${n(b.analyticalM,2)} kNm/m (${n(b.mError,1)}%)<br>${n(b.nodes)} nodes · ${n(b.elements)} elements`;box.className=`calculation-card ${ok?"":""}`;}catch(e){box.textContent=`Benchmark failed: ${e.message}`;}});

function registerWebMCP(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const register=tool=>Promise.resolve(context.registerTool(tool)).catch(()=>{});
  register({name:"set_cover_slab_dimensions",title:"Set slab dimensions",description:"Update the visible cover slab radius, thickness, clear diameter and bearing width.",inputSchema:{type:"object",properties:{radius:{type:"number"},thickness:{type:"number"},clearDiameter:{type:"number"},bearingWidth:{type:"number"}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){for(const k of ["radius","thickness","clearDiameter","bearingWidth"])if(Number.isFinite(input[k]))project.slab[k]=input[k];if(Number.isFinite(input.radius))project.dimensions.outerRadius=input.radius;markStale();return{status:"updated",slab:project.slab};}});
  register({name:"run_cover_slab_analysis",title:"Run cover slab analysis",description:"Generate the current radial mesh and run the preliminary Mindlin plate finite-element analysis.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(){await analyse();return{status:analysis?"completed":"failed",summary:analysis?.summary??null};}});
}
registerWebMCP();
