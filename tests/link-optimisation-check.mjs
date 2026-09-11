import assert from "node:assert/strict";
import { cloneProject } from "../dist/model.js";
import { solvePlate, reinforcementDesign } from "../dist/solver.js";

const project=cloneProject();
const analysis=solvePlate(project);
const spacings=[100,125,150,175];
const cases=[];

for(const radialSpacing of spacings) for(const tangentialSpacing of spacings){
  const candidate=structuredClone(project);
  candidate.shearLinks.radialSpacing=radialSpacing;
  candidate.shearLinks.tangentialSpacing=tangentialSpacing;
  const design=reinforcementDesign(candidate,analysis.summary.designBottom,analysis.summary.designShearInside);
  const spacingOk=radialSpacing<=design.radialSpacingLimit&&tangentialSpacing<=design.tangentialSpacingLimit;
  const pass=design.util<=1&&design.rhoW>=design.rhoWMin&&spacingOk&&design.vrds<=design.vrdmax;
  cases.push({radialSpacing,tangentialSpacing,utilisation:design.util,vrds:design.vrds,rhoW:design.rhoW,spacingOk,pass,density:1/(radialSpacing*tangentialSpacing)});
}

assert.equal(cases.length,16);
const passing=cases.filter(c=>c.pass).sort((a,b)=>a.density-b.density);
assert.ok(passing.length>0);
const selected=passing[0];
assert.deepEqual([selected.radialSpacing,selected.tangentialSpacing],[project.shearLinks.radialSpacing,project.shearLinks.tangentialSpacing]);

console.log(JSON.stringify({status:"passed",casesReviewed:cases.length,selected,cases:cases.map(c=>({...c,utilisation:+c.utilisation.toFixed(3),vrds:+c.vrds.toFixed(1),rhoW:+c.rhoW.toFixed(5)}))},null,2));
