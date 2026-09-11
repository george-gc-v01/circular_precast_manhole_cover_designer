import assert from "node:assert/strict";
import { cloneProject, derivedLoads, edgeGap, openingExtent } from "../dist/model.js";
import { solvePlate, runBenchmark, handChecks, reinforcementDesign } from "../dist/solver.js";

const p=cloneProject(),by=id=>p.openings.find(o=>o.id===id),loads=derivedLoads(p);
assert.equal(loads.soil,70);
assert.equal(loads.self,6.875000000000001);
assert.equal(loads.uls,133.78125);
assert.equal(p.slab.thickness,275);
assert.equal(p.material.barDiameter,16);
assert.equal(p.material.barSpacing,200);
assert.deepEqual([p.mesh.rings,p.mesh.sectors],[12,60]);
assert.ok(Math.abs(edgeGap(by("west-slot"),by("top-400-a"))-59)<1);
assert.ok(Math.abs(p.slab.radius-openingExtent(by("west-slot"))-251)<1);
assert.ok(Math.abs(edgeGap(by("top-400-a"),by("top-400-b"))-150)<0.01);
assert.ok(Math.abs(edgeGap(by("top-400-b"),by("top-300"))-296)<0.01);
assert.ok(Math.abs(p.slab.radius-openingExtent(by("main-900"))-170)<0.01);
assert.ok(Math.abs(p.slab.radius-openingExtent(by("curved-slot"))-225)<0.01);

const analysis=solvePlate(p);
assert.equal(analysis.summary.converged,true);
assert.ok(analysis.summary.elements>1000);
assert.ok(analysis.summary.designBottom>0);
assert.ok(analysis.summary.maxDeflection>0);
const bottom=reinforcementDesign(p,analysis.summary.designBottom,analysis.summary.designShearInside);
const top=reinforcementDesign(p,analysis.summary.designTop,analysis.summary.designShearInside);
assert.ok(bottom.flexuralUtil<1);
assert.ok(top.flexuralUtil<1);
assert.ok(bottom.util<1);
assert.ok(analysis.summary.designShearOutside/bottom.shearResistance<1);

const refined=cloneProject();refined.mesh.rings=16;refined.mesh.sectors=84;
const refinedAnalysis=solvePlate(refined);
const relative=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(b),1e-9);
assert.ok(relative(analysis.summary.designBottom,refinedAnalysis.summary.designBottom)<.15);
assert.ok(relative(analysis.summary.designShearInside,refinedAnalysis.summary.designShearInside)<.15);
const lowerBound=cloneProject();lowerBound.slab.thickness=260;lowerBound.mesh.rings=16;lowerBound.mesh.sectors=84;
const lowerBoundAnalysis=solvePlate(lowerBound),lowerBoundDesign=reinforcementDesign(lowerBound,lowerBoundAnalysis.summary.designBottom,lowerBoundAnalysis.summary.designShearInside);
assert.ok(lowerBoundDesign.flexuralUtil<1&&lowerBoundDesign.flexuralUtil>.98);
const belowBound=cloneProject();belowBound.slab.thickness=255;belowBound.mesh.rings=16;belowBound.mesh.sectors=84;
const belowBoundAnalysis=solvePlate(belowBound),belowBoundDesign=reinforcementDesign(belowBound,belowBoundAnalysis.summary.designBottom,belowBoundAnalysis.summary.designShearInside);
assert.ok(belowBoundDesign.flexuralUtil>1);

const benchmark=runBenchmark(p);
assert.ok(Math.abs(benchmark.wError)<8,`deflection benchmark error ${benchmark.wError}%`);
assert.ok(Math.abs(benchmark.mError)<5,`moment benchmark error ${benchmark.mError}%`);

const hand=handChecks(p);
assert.ok(Math.abs(hand.moment-150.50390625)<0.001);
assert.ok(hand.design.util<1);
assert.ok(hand.design.vrds>hand.shear);
assert.ok(hand.design.vrdmax>hand.design.vrds);
assert.ok(hand.design.rhoW>hand.design.rhoWMin);
assert.ok(p.shearLinks.radialSpacing<=hand.design.radialSpacingLimit);
assert.ok(p.shearLinks.tangentialSpacing<=hand.design.tangentialSpacingLimit);
console.log(JSON.stringify({status:"passed",loads,analysis:analysis.summary,refined:refinedAnalysis.summary,numericalLowerBound:{thickness:260,flexuralUtilisation:lowerBoundDesign.flexuralUtil},belowBound:{thickness:255,flexuralUtilisation:belowBoundDesign.flexuralUtil},benchmark,bottomFlexuralUtilisation:bottom.flexuralUtil,topFlexuralUtilisation:top.flexuralUtil,linkZoneUtilisation:bottom.util,outsideZoneUtilisation:analysis.summary.designShearOutside/bottom.shearResistance,handMoment:hand.moment,handShear:hand.shear,handReinforcement:hand.plateDesign.label,shearLinks:bottom.linkLabel,linkResistance:bottom.vrds},null,2));
