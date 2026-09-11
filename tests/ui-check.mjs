import assert from "node:assert/strict";
import fs from "node:fs";
import { cloneProject, getPath } from "../dist/model.js";

const html=fs.readFileSync(new URL("../dist/index.html",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
for(const asset of ["styles.css","extras.css","app.js","model.js","solver.js"])assert.ok(fs.existsSync(new URL(`../dist/${asset}`,import.meta.url)),`Missing ${asset}`);
const ids=[...app.matchAll(/\$\("#([^"]+)"\)/g)].map(m=>m[1]);
for(const id of new Set(ids))assert.ok(html.includes(`id="${id}"`)||app.includes(`id="${id}"`),`Missing element #${id}`);
const p=cloneProject(),paths=[...html.matchAll(/data-path="([^"]+)"/g)].map(m=>m[1]);
for(const path of paths)assert.notEqual(getPath(p,path),undefined,`Missing project value ${path}`);
assert.ok(html.includes('data-view="shear"'));
assert.ok(app.includes("r.Q"));
assert.ok(app.includes("shearLinksSvg"));
assert.ok(html.includes("Reviewed baseline"));
assert.ok(html.includes("16 link cases"));
console.log(`UI check passed: ${new Set(ids).size} element references, ${paths.length} editable project controls.`);
