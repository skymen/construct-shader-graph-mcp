# Construct Shader Graph MCP Skill

Use this guidance when working with Construct Shader Graph through the MCP bridge.

## Purpose

- Use the MCP tools as the only execution surface.
- Inspect the current graph, make targeted graph edits, validate the result, and report progress clearly.
- Treat the graph as the source of truth for shader logic. Use preview controls only to inspect or demonstrate the result.

## MCP tool contract

Use these tools for all work:

- `list_projects`
- `select_project`
- `get_project_manifest`
- `call_project_method`

Execution rules:

- Always use MCP tools instead of browser console access.
- Always identify the active project from shader metadata returned by `shader.getInfo()`.
- Always use exact return values from MCP calls; do not guess state.
- Always read the manifest when capabilities or argument shapes are unclear.

## Operating contract

- Preserve existing user work unless the task clearly requires replacing it.
- Identify the correct connected project before mutating anything.
- Inspect first, mutate second.
- Make the smallest valid change that satisfies the request.
- Verify after every structural edit such as creating nodes, deleting nodes, or wiring ports.
- Use stable ids from API results; do not rely on labels, visual position, or selection alone.
- Do not open arbitrary local files or save project files autonomously.
- Built-in examples are safe to open.
- Export is allowed because it triggers a download rather than silently overwriting a project.

## Preferred workflow

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

## Core rules

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
- Never create or edit custom node definitions unless explicitly asked.

## Graph editing guidance

- Always inspect ports before creating wires.
- Use explicit port refs: `{ nodeId, kind, index }`.
- Prefer `index` over `name` for automation stability.
- Use `declaredType` and `resolvedType` to understand generic or dynamic nodes.
- If an input port is editable and unconnected, prefer setting its value directly instead of creating a separate constant node.
- If one output would feed many distant nodes, prefer variables instead of many long wires.

## Preview and verification guidance

- Default preview compiles from `Output`.
- Use node preview for masks, UVs, gradients, lighting terms, and intermediate values.
- Use the preview console as part of the normal debug loop.
- Use screenshots to confirm that the visual result matches the intent.
- Prefer `ai.runDebugCheck()` for combined validation.

## Construct-specific guidance

- Important shader settings include `blendsBackground`, `usesDepth`, `crossSampling`, `animated`, `mustPredraw`, `supports3DDirectRendering`, `extendBoxH`, and `extendBoxV`.
- Background sampling only makes sense when `blendsBackground` is enabled.
- Depth sampling only makes sense when `usesDepth` is enabled.
- Construct uses premultiplied alpha, so many color workflows should use `unpremultiply` before edits and `premultiply` before output.
- Prefer existing Construct helper nodes instead of rebuilding common math manually.

## Troubleshooting

- If no projects are listed, make sure the page is connected to the MCP bridge.
- If the wrong project is selected, compare `shader.getInfo()` metadata and reselect.
- If wire creation fails, inspect both nodes with `nodes.getPorts` and check `resolvedType`.
- If preview looks wrong, inspect preview settings, preview errors, node preview, and screenshots.
