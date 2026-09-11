# Circular Precast Manhole Cover Designer

Interactive preliminary finite-element analysis and Eurocode 2 sizing tool for buried circular reinforced-concrete cover slabs containing multiple openings.

**Live application:** [Circular Cover Slab Designer](https://circular-cover-slab-designer.georgeculache.chatgpt.site)

## Purpose

The application was developed around a Cambridge enquiry for a precast cover over an approximately 3 m wide manhole. The irregular arrangement of access holes and service penetrations makes a simple one-way slab strip an imperfect representation, so the tool combines an editable radial plate model with transparent hand-calculation checks.

It is intended for concept development, option comparison and preliminary reinforcement sizing. It is not a replacement for independently validated structural-analysis software or a project-specific engineering design.

## Built-in Cambridge example

The preset model gives engineers a realistic starting point rather than an empty screen.

| Item | Preset value |
|---|---:|
| Overall slab diameter | 3,340 mm |
| Clear manhole diameter | 3,000 mm |
| Annular bearing width | 100 mm |
| Adopted preliminary slab thickness | 275 mm |
| Main access opening | Ø900 mm |
| Upper circular openings | 2 × Ø400 mm and 1 × Ø300 mm |
| West rounded slot | approximately 797 × 294 mm |
| Soil depth | 3.5 m |
| Soil unit weight | 20 kN/m³ |
| Surface surcharge | 20 kN/m² |
| Concrete | C32/40 |
| Nominal cover | 50 mm |

The slab self-weight is derived automatically from its current thickness using a default concrete unit weight of 25 kN/m³. The preset ULS combination is `1.35Gk + 1.50Qk`.

## Reviewed preliminary baseline

- H16 bars at 200 mm centres, top and bottom in each direction: 1,005 mm²/m provided per layer and direction.
- Single-leg H10 shear-link positions at 150 mm radial and 150 mm tangential spacing.
- Shear-link zone between radii 600 mm and 1,600 mm.
- Default FE mesh of 12 radial rings by 60 sectors: 683 active nodes and 1,198 plate elements for the supplied geometry.
- A refined 16-ring by 84-sector model is used in the automated engineering comparison.
- A 260 mm numerical lower bound passed only narrowly on the refined mesh, with flexural utilisation approximately 0.99; 275 mm was therefore retained as the more practical preliminary baseline.

A 16-case link study checks every combination of 100, 125, 150 and 175 mm radial/tangential spacing. At the adopted depth, 150/150 mm is the least-dense option passing the implemented resistance, minimum-reinforcement and `0.75d` spacing screens.

## Engineering capabilities

- Parametric circular slab and annular support geometry.
- Editable circular, capsule and curved annular-slot openings.
- Inputs corresponding to the principal dimensions arrowed on the reference drawing.
- Concentric radial mesh with three-node Mindlin–Reissner triangular plate elements.
- Linear-elastic ULS plate analysis with transverse displacement and two rotations per node.
- Deflection, Wood–Armer bottom moment and resultant plate-shear contour maps with legends.
- Editable concrete, steel, cover, slab thickness, loading and mesh parameters.
- Preliminary EC2 flexural reinforcement, concrete shear and shear-link checks.
- Link resistance, concrete-strut limit, minimum link ratio and spacing screens.
- Solid circular-plate and conservative one-way-strip comparison calculations.
- JSON project save and reopen functionality.

## Analysis approach

The radial background mesh is generated from concentric rings and angular sectors. Elements whose sampling points fall inside an opening are removed. The default support is an annular vertical restraint located at the manhole bearing radius.

Each plate node has three degrees of freedom:

- transverse displacement `w`;
- rotation `θx`;
- rotation `θy`.

Bending stiffness is integrated over each triangular element. Transverse shear stiffness uses three-point triangular integration with a `5/6` shear-correction factor. The sparse global system is solved using a diagonally preconditioned conjugate-gradient solver.

The solid-plate benchmark uses the classical simply supported circular-plate expressions:

```text
D = E t³ / [12(1 − ν²)]
wmax = q a⁴(5 + ν) / [64D(1 + ν)]
Mcentre = q a²(3 + ν) / 16
```

For the preset 275 mm model, the benchmark errors are approximately 2% for both central deflection and central moment at the default benchmark mesh.

## Interpreting the results

The displayed design values use the selected result percentile, which defaults to the 95th percentile. Raw peaks remain available for comparison because point values around polygonal opening boundaries can be mesh-sensitive.

The circular-plate hand check is useful for checking the general magnitude of the FE moments. The displayed one-way `qL²/8` result is an intentionally conservative comparison and does not govern the preset circular FE baseline.

An uncracked elastic SLS deflection is displayed as a screening result. Cracking, creep, shrinkage, soil–structure interaction and nonlinear bearing behaviour are not represented.

## Running locally

No build step or third-party JavaScript package is required. Serve the `dist` directory through a local HTTP server; opening the HTML directly from the filesystem may prevent ES modules from loading.

Using Python:

```bash
python -m http.server 8000 --directory dist
```

Then open [http://localhost:8000](http://localhost:8000).

Using VS Code, the `dist/index.html` file can also be opened with a local-server extension such as Live Server.

## Tests

Node.js 18 or later is recommended. The tests use only built-in Node functionality.

```bash
npm test
```

The test suite covers:

- reconstruction of the supplied drawing dimensions;
- load derivation and baseline design checks;
- FE solver convergence;
- comparison of the default and refined meshes;
- the solid circular-plate benchmark;
- the 16-case H10 shear-link spacing study;
- consistency between the user interface and project data model.

## Repository structure

```text
dist/
  index.html       User interface
  app.js           Interaction, SVG drawing and result presentation
  model.js         Geometry, openings, dimensions and load model
  solver.js        Mesh generation, plate FEA and preliminary EC2 checks
  styles.css       Main interface styles
  extras.css       Calculation, contour, link and responsive styles
tests/
  engineering-check.mjs
  link-optimisation-check.mjs
  ui-check.mjs
package.json
```

## Important engineering limitations

This software is for preliminary engineering exploration only. It has not been certified or independently validated for production design.

Opening boundaries are approximated by removing elements from a radial background mesh. The engineer must carry out appropriate convergence studies and independently verify global and local actions. The following remain outside the automated design scope:

- local trimming and torsional reinforcement around openings;
- anchorage and physical detailing of single-leg shear links or studs;
- punching, discontinuity-region and strut-and-tie checks;
- bearing stresses and support eccentricity;
- precast lifting, handling, storage and transport conditions;
- joints, tolerances and erection sequence;
- fatigue, accidental actions and robustness;
- durability, crack-width and fire design;
- groundwater, buoyancy and construction-stage loading;
- geotechnical stiffness and soil–structure interaction.

Final design remains the responsibility of a suitably qualified structural engineer using project-specific information and validated analysis methods.

## Licence

This project is released under the [MIT License](LICENSE).
