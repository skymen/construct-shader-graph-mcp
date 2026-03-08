# Construct Shader Graph MCP Guidance

Use this guidance when controlling Construct Shader Graph through the MCP bridge.

This document is intentionally focused on best practices, workflow, and domain knowledge. All execution should happen through MCP tools.

## Purpose

- Use MCP as the only execution surface.
- Inspect the current graph, make targeted edits, validate the result, and report progress clearly.
- Treat the graph as the source of truth for shader logic.
- Use preview tools only to inspect, debug, or visually validate the graph.

## MCP tool contract

Use these MCP tools for all work:

- `list_projects`
- `select_project`
- `get_project_manifest`
- `call_project_method`

Execution rules:

- Always begin with `list_projects`.
- Always choose the active project using `shader.getInfo()` metadata, especially `name` and `version`.
- Always use exact return values from MCP calls; never guess state.
- Always inspect the manifest if available methods, method names, or argument shapes are unclear.
- If a call returns an id, use that id for follow-up operations instead of searching by labels.

## Operating contract

- Preserve existing user work unless the task clearly requires replacing it.
- Identify the correct connected project before mutating anything.
- Inspect first, mutate second.
- Make the smallest valid change that satisfies the request.
- Verify after every structural edit such as creating nodes, deleting nodes, rewiring ports, or changing preview settings.
- Use stable ids from API results; do not rely on labels, visual position, or selection alone.
- Do not open arbitrary local files or save project files autonomously.
- Built-in examples are safe to open.
- Export is allowed because it triggers a download rather than silently overwriting a project.

## Execution priorities

1. Preserve the current graph and user intent.
2. Select the correct project.
3. Inspect graph state before editing.
4. Prefer existing nodes and helper nodes over rebuilding standard shader math.
5. Prefer small, reversible edits over large speculative rewrites.
6. Verify graph integrity and preview behavior after each important edit.
7. End with a short recap.

## Hard rules

- Always start by calling `list_projects`.
- If more than one project is connected, select the correct one before doing anything else.
- Always call `session.initAIWork()` when starting a task.
- Always call `session.endAIWork()` when finishing a task.
- Use `session.updateAIWork()` only for short phase updates.
- Always inspect preview errors after meaningful shader edits.
- Always use preview and screenshots for non-trivial visual validation.
- Prefer setting editable input port values directly before adding constant/vector nodes.
- Never assume a node id, port index, or wire id without reading it first.
- Never connect ports without checking the actual node ports.
- Never replace an output connection blindly; inspect the affected ports first.
- Never use startup scripts as a substitute for graph logic.
- Never assume renderer-specific branching is needed; the tool already generates WebGL 1, WebGL 2, and WebGPU from one graph.
- Never create or edit custom node definitions unless the user explicitly asks for advanced custom node authoring.

## Preferred workflow

Use this loop for most tasks:

1. Call `list_projects`.
2. Select the correct project with `select_project`.
3. Read `get_project_manifest` once per task or when capabilities are unclear.
4. Start the session.
5. Inspect current graph state.
6. Identify exact node ids, port refs, uniform ids, or settings keys.
7. Apply one atomic edit or one tightly related batch.
8. Re-read the affected nodes, ports, wires, or settings.
9. Check preview or generated code if relevant.
10. Repeat only if needed.
11. End the session with a recap.

## Status update guidance

- Keep progress messages to about 4 to 10 words.
- Update only when changing phase or completing a meaningful step.
- Good examples:
  - `"Inspecting graph"`
  - `"Finding output node"`
  - `"Adding variable nodes"`
  - `"Rewiring preview path"`
  - `"Verifying generated code"`
- Avoid noisy or repetitive updates.

## Environment assumptions

- The graph has nodes, ports, wires, uniforms, shader settings, preview settings, and camera state.
- The tool compiles one graph to three targets: WebGL 1, WebGL 2, and WebGPU.
- The preview normally uses the `Output` node unless node preview is enabled.
- Project identity comes from `shader.getInfo()` metadata.

## Method mapping

Use `call_project_method` with method names from the manifest.

Examples:

- `call_project_method({ method: "shader.getInfo", args: [] })`
- `call_project_method({ method: "nodes.create", args: [{ ... }] })`
- `call_project_method({ method: "wires.create", args: [{ ... }] })`
- `call_project_method({ method: "session.initAIWork", args: [{ ... }] })`

The method names match the public API names; MCP only changes the transport.

## Safe vs side-effecting calls

Read-only calls:

- `help`
- `getProjectIdentity`
- `getManifest`
- `nodes.list`
- `nodes.get`
- `nodes.getInfo`
- `nodes.getPorts`
- `nodes.search`
- `nodeTypes.list`
- `nodeTypes.search`
- `nodeTypes.get`
- `ports.get`
- `ports.listConnections`
- `wires.get`
- `wires.getAll`
- `uniforms.list`
- `uniforms.get`
- `uniforms.getNodeTypes`
- `shader.getInfo`
- `shader.getGeneratedCode`
- `preview.getSettings`
- `preview.getConsoleEntries`
- `preview.getErrors`
- `preview.getNodePreview`
- `preview.getStartupScriptInfo`
- `camera.getState`
- `projects.listExamples`
- `customNodes.list`
- `customNodes.get`
- `ai.getWarnings`
- `ai.runDebugCheck`

Side-effecting calls:

- `session.initAIWork`
- `session.updateAIWork`
- `session.endAIWork`
- `runCommands`
- `nodes.create`
- `nodes.edit`
- `nodes.delete`
- `wires.create`
- `wires.delete`
- `uniforms.create`
- `uniforms.createNode`
- `uniforms.edit`
- `uniforms.reorder`
- `uniforms.delete`
- `shader.updateInfo`
- `preview.updateSettings`
- `preview.clearConsole`
- `preview.resetSettings`
- `preview.setNodePreview`
- `preview.toggleNodePreview`
- `preview.screenshot`
- `layout.autoArrange`
- `camera.center`
- `camera.zoomToFit`
- `camera.setPosition`
- `camera.setZoom`
- `projects.openExample`
- `projects.exportAddon`

## Discovery guidance

When the model does not know which node type to use:

- Prefer `nodeTypes.search(query)` to search by concept.
- Use `nodeTypes.list()` only for lightweight discovery of available names/categories/tags.
- Use `nodeTypes.get(typeKey)` to inspect one exact type in full before creating it.
- Use `nodes.search(query)` as a convenience alias for node type search.
- Use `uniforms.getNodeTypes()` to discover generated uniform-backed node types.
- Use `customNodes.list()` to discover reusable custom node definitions already in the project.

Good search queries:

- `"depth"`
- `"uv"`
- `"gradient"`
- `"noise"`
- `"premultiply"`
- `"light"`

Use discovery before guessing a `typeKey`.

## Node and port discipline

- Always inspect ports before creating wires.
- Use explicit port refs: `{ nodeId, kind, index }`.
- Prefer `index` over `name` for automation stability.
- Use `declaredType` and `resolvedType` to understand generic or dynamic nodes.
- If an input port is editable and unconnected, prefer setting its value directly instead of creating a separate constant node.
- This applies to editable floats, vec2, vec3, and vec4 values when the input is intended to be a local literal.

Port reference examples:

- `{ nodeId: 12, kind: "input", index: 0 }`
- `{ nodeId: 12, kind: "output", index: 1 }`

## Editing node input values

This is one of the most important workflows.

To change a node's editable input values:

1. Read the node with `nodes.getInfo(nodeId)`.
2. Inspect `editableInputValues` to see which inputs are editable and currently unconnected.
3. Edit with `nodes.edit(nodeId, { inputValues: ... })`.

Rules:

- Only editable, unconnected input ports can be changed this way.
- If a port is already wired, disconnect or rewire it before editing its direct value.
- Prefer editing the input value directly when the value is local and used once.
- Prefer adding nodes or variables when the value needs to be reused elsewhere.

Example workflow:

- call `nodes.getInfo(nodeId)`
- inspect `editableInputValues`
- call `nodes.edit(nodeId, { inputValues: { B: [0, 0, 0, 1] } })`
- re-read the node with `nodes.getInfo(nodeId)`

Name-based example:

- `nodes.edit(42, { inputValues: { B: [0, 0, 0, 1] } })`

Index-based example:

- `nodes.edit(42, { inputValues: { 0: 1.25 } })`

Prefer this over adding a `Vec4` or `Float` node when the value is just a local literal used once.

## Node editing guidance

`nodes.edit(nodeId, patch)` is used for targeted edits to an existing node.

Common patch fields:

- `x`
- `y`
- `position: { x, y }`
- `operation`
- `customInput`
- `selectedVariable`
- `inputValues`
- `gradientStops`
- `data`

Examples:

- move a node: `nodes.edit(nodeId, { position: { x: 400, y: 220 } })`
- change an operation dropdown: `nodes.edit(nodeId, { operation: "multiply" })`
- rename a variable node: `nodes.edit(nodeId, { customInput: "baseMask" })`
- set editable inputs: `nodes.edit(nodeId, { inputValues: { Strength: 0.5 } })`

Do not send empty patches.

## Wires

Before wiring:

- inspect both sides with `nodes.getPorts(nodeId)`
- confirm output vs input direction
- confirm `resolvedType` compatibility

Rules:

- A wire should connect one output port to one input port.
- Reconnecting an already-connected input may replace the current connection.
- Recreating the exact same connection should be treated as idempotent.
- After wiring, verify with `ports.listConnections(portRef)` or `wires.getAll()`.

Recommended wiring loop:

1. inspect source node ports
2. inspect target node ports
3. create wire
4. re-read connections on the source or target port

## Variables

Use variable nodes to reduce wire clutter.

- `Set Variable` stores a computed value once.
- `Get Variable` reads it back in multiple places.
- The `Get Variable` output type is inferred from the matching `Set Variable` input.

Preferred rule:

- If one output would feed many distant nodes, prefer a variable instead of many long wires.
- This makes `autoArrange()` cleaner and keeps the graph easier to inspect.

AI-specific warning system:

- Use `ai.getWarnings` during verification.
- The multi-output warning only matters when one output fans out to multiple different target nodes.
- If multiple wires from one output all go into the same node, that warning does not apply.
- If it reports that an output port fans out multiple times:
  - use `Set Variable` and `Get Variable` if the value represents a larger computed tree or reusable branch
  - duplicate small local nodes if the output is just a simple leaf value and duplication is cleaner
- Treat these warnings as layout and maintainability guidance, not as compile errors.

Good variable cases:

- reused UV transforms
- reused masks
- reused sampled colors
- reused lighting terms
- any value with 3 or more downstream uses

## Existing custom nodes

Existing custom nodes are part of the project and can be inspected and used.

- It is safe to inspect existing custom node definitions.
- It is safe to place existing custom nodes in the graph if they already exist in the project.
- Creating a new custom node definition is the advanced escape hatch and should be avoided unless the user explicitly asks for it.
- Prefer built-in nodes first, but if a project already contains a custom node designed for a task, using it is acceptable.

Inspect existing custom nodes with:

- `customNodes.list()`
- `customNodes.get(id)`
- `nodeTypes.get("custom_<id>")`

When a custom node already exists:

- inspect its ports and code first
- treat it like a project-specific reusable node
- understand it before placing or wiring it

## Uniform workflows

Uniform workflow usually looks like this:

1. `uniforms.create(...)`
2. `uniforms.createNode(uniformId, ...)`
3. inspect the created node with `nodes.getPorts(nodeId)`
4. wire it into the graph

Use uniforms for exposed user-facing values that should exist outside a single node.

Prefer direct editable input values for local literals and uniforms for reusable effect controls.

## Preview guidance

- Default preview compiles from `Output`.
- Node preview compiles from one selected intermediate node instead.
- Use node preview for masks, UVs, gradients, lighting terms, and intermediate color values.
- A node can only be previewed if it resolves to `float`, `vec2`, `vec3`, or `vec4` on one output.
- Use the preview console as part of the normal debug loop.
- Use screenshots to confirm that the visual result actually matches the intent.

Recommended debug loop:

1. inspect graph state
2. make one structural change or one tight batch
3. verify affected nodes and wires
4. call `shader.getGeneratedCode`
5. clear preview console and inspect `preview.getErrors`
6. use node preview for intermediate values if needed
7. take a screenshot with `preview.screenshot` for visual verification
8. inspect `ai.getWarnings` for layout and reuse issues
9. adjust and repeat only if needed

You can also use the bundled helper:

- `ai.runDebugCheck()`
- `ai.runDebugCheck({ includeScreenshot: true })`
- `ai.runDebugCheck({ takeScreenshot: true })`

`ai.runDebugCheck()` bundles:

- generated code validation
- preview error collection
- AI graph warnings
- optional screenshot capture

## Renderer guidance

- Normally build one graph and let the tool generate all targets.
- Only branch behavior when absolutely necessary.
- If renderer-specific logic is needed, prefer the shader test node.
- Use preview `shaderLanguage` switching to test generated targets.

## Scale-aware values

- Do not rely on tiny arbitrary constants for widths, offsets, blur radii, distortion amounts, or outline thickness.
- Prefer `pixelSize` for screen-space scaling.
- Prefer `texelSize` for texture or world-sampling offsets.
- If an effect looks too subtle or too tiny, first check whether it should be scaled by `pixelSize` or `texelSize` instead of increasing magic constants.

Rule of thumb:

- screen-relative effect -> `pixelSize`
- texture/sample offset effect -> `texelSize`

## Construct shader guidance

Construct Shader Graph is a Construct effect authoring tool, so the AI should understand a few Construct-specific ideas.

- Important shader settings include `blendsBackground`, `usesDepth`, `crossSampling`, `animated`, `mustPredraw`, `supports3DDirectRendering`, `extendBoxH`, and `extendBoxV`.
- Background sampling only makes sense when `blendsBackground` is enabled.
- Depth sampling only makes sense when `usesDepth` is enabled.
- Construct uses premultiplied alpha, so many color workflows should use `unpremultiply` before edits and `premultiply` before output.

Official references:

- `https://www.construct.net/en/make-games/manuals/addon-sdk/guide/configuring-effects`
- `https://www.construct.net/en/make-games/manuals/addon-sdk/guide/configuring-effects/webgl-shaders`
- `https://www.construct.net/en/make-games/manuals/addon-sdk/guide/configuring-effects/webgpu-shaders`
- `https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/objects/effects`
- `https://www.construct.net/en/make-games/manuals/construct-3/scripting/scripting-reference/object-interfaces/ieffectinstance`

## Prefer existing Construct helper nodes

Many common Construct shader calculations are already implemented as nodes. Prefer these over rebuilding the math manually.

- Sampling and UV nodes: `frontUV`, `backUV`, `depthUV`, `textureFront`, `textureBack`, `textureDepth`, `samplerFront`, `samplerBack`, `samplerDepth`, `textureSample`, `textureSampleLOD`, `textureSampleGrad`, `texelFetch`
- Built-in Construct values: `builtinSrcStart`, `builtinSrcEnd`, `builtinSrcSize`, `builtinSrcCenter`, `builtinSrcOriginStart`, `builtinSrcOriginEnd`, `builtinSrcOriginSize`, `builtinSrcOriginCenter`, `builtinLayoutStart`, `builtinLayoutEnd`, `builtinLayoutCenter`, `builtinLayoutSize`, `builtinDestStart`, `builtinDestEnd`, `builtinDestCenter`, `builtinDestSize`, `builtinDevicePixelRatio`, `builtinLayerScale`, `builtinLayerAngle`, `builtinSeconds`, `builtinZNear`, `builtinZFar`
- Coordinate helpers: `pixelSize`, `texelSize`, `layoutPixelSize`, `srcOriginToNorm`, `srcToNorm`, `normToSrc`, `normToSrcOrigin`, `srcToDest`, `clampToSrc`, `clampToSrcOrigin`, `clampToDest`, `getLayoutPos`
- Color and depth helpers: `premultiply`, `unpremultiply`, `linearizeDepth`, `normalFromDepth`, `grayscale`, `rgbToHsl`, `hslToRgb`
- Higher-level helpers: `gradientMap`, `blendMode`, `directionalLight`, `rimLight`, `hemisphereLight`, `specularLight`, `matcap`

## Startup script guidance

The startup script is optional and exists only to make preview testing easier.

- Use it for preview interactivity, not shader logic.
- Good uses: camera setup, object rotation, layout tweaks, quick runtime animation.
- Keep it short and preview-focused.
- Do not depend on it for exported shader behavior.

Available startup script variables:

- `runtime`
- `sprite`
- `shape3D`
- `background`
- `background3d`
- `camera`
- `layout`
- `layer`

Construct scripting reference:

- `https://www.construct.net/en/make-games/manuals/construct-3/scripting/scripting-reference`

## Projects and session workflow

Use the session API for start, progress, and finish through `call_project_method`.

Project rules:

- Use `projects.listExamples` and `projects.openExample` for built-in examples.
- Do not assume the AI should open arbitrary local files.
- Do not assume the AI should save project files on its own.
- Use `projects.exportAddon` when the user wants a downloadable export.

## Good vs bad behavior

Good:

- Inspect ids before editing.
- Inspect ports before wiring.
- Use `runCommands` for a tightly related group of edits when batching helps.
- Re-read affected nodes and ports after structural changes.
- Prefer helper nodes and variable nodes.
- Reuse an existing custom node when it is clearly the project-specific tool for the job.
- Use preview errors, node preview, and screenshots as part of verification.
- Scale visible effects with `pixelSize` or `texelSize` instead of tiny magic constants.

Bad:

- Guess node ids from names.
- Rebuild a whole graph for a tiny fix.
- Create many long wires from one output when variables would do.
- Use startup scripts to simulate graph logic.
- Split the graph by renderer without a real need.
- Create new custom nodes casually instead of composing the graph from existing nodes.

## Troubleshooting

- `No projects listed`
  - Make sure the page is connected to the MCP bridge.
  - Re-run `list_projects`.
- `Wrong project selected`
  - Re-check `shader.getInfo()` metadata from the selected project.
  - Pick the correct session with `select_project`.
- `Node not found`
  - Re-run `nodes.list` and resolve the correct id.
- `Unknown node type`
  - Use `nodeTypes.search` or `nodeTypes.list` before guessing a `typeKey`.
  - Inspect `nodeTypes.get(typeKey)` before creating a node.
- `Wire creation failed`
  - Inspect both nodes with `nodes.getPorts`.
  - Check port direction and `resolvedType`.
- `Generated code failed`
  - Make sure an `Output` node exists.
  - Re-check required connections.
- `Preview looks wrong`
  - Inspect `preview.getSettings`.
  - Clear and inspect `preview.getErrors`.
  - Test node preview on intermediate values.
  - Capture a screenshot and inspect the actual visible result.
  - Switch `shaderLanguage` to compare targets.
- `Graph became cluttered`
  - Replace repeated fan-out with `Set Variable` and `Get Variable`.
  - Run `layout.autoArrange` after structural edits.
- `Value is reused too many times`
  - Inspect `ai.getWarnings`.
  - Use a variable for reused computed branches.
  - Duplicate tiny leaf nodes when that is simpler and cleaner.
