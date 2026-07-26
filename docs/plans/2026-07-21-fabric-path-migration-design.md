# Fabric Path Migration Design

The maze renderer draws straight wall and passage-debug segments with Fabric.js `Path` objects. Each segment will be represented by a two-command SVG path: an absolute move (`M`) to the start coordinate followed by an absolute line (`L`) to the end coordinate.

This retains the former `Line` geometry and existing stroke options while satisfying Fabric v7's `TComplexPathData` constructor type. Regression coverage will render a minimal maze against a canvas test double and assert that all generated path objects contain `M` and `L` commands.
