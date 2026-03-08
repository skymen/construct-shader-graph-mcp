<p align="center">
  <img src="./caw-icon-512.png" alt="Construct Shader Graph MCP icon" width="128" height="128">
</p>

# Construct Shader Graph MCP

Standalone MCP server for controlling Construct Shader Graph through its browser bridge.

It exposes project discovery, manifest inspection, and exact method execution for the live app, while also bundling the guidance the model needs to work well with the tool.

Construct Shader Graph is a visual editor for building Construct effect shaders as node graphs. You can find the app here:

- `https://skymen.github.io/construct-shader-graph/`

## Features

- MCP tools for project discovery and method execution
- local WebSocket bridge on `ws://127.0.0.1:6359` by default
- built-in skill guidance available directly from the MCP
- works with hosts like Claude Desktop and OpenCode

## MCP tools

- `get_skill_guidance`
- `list_projects`
- `select_project`
- `get_project_manifest`
- `call_project_method`

## MCP resources

- `construct-shader-graph://guidance/skill`
- `construct-shader-graph://guidance/quickstart`

## MCP prompts

- `work-with-shader-graph`
- `inspect-graph`
- `edit-graph-safely`
- `debug-preview-errors`

## Install as a package

Global install:

```bash
npm install -g construct-shader-graph-mcp
```

Run after installing globally:

```bash
construct-shader-graph-mcp
```

Or run without installing globally:

```bash
npx -y construct-shader-graph-mcp
```

## Local development

Clone the repo and install dependencies:

```bash
git clone https://github.com/skymen/construct-shader-graph-mcp.git
cd construct-shader-graph-mcp
npm install
```

Run locally:

```bash
npm start
```

## Configuration

Optional environment variable:

- `MCP_BRIDGE_PORT` to change the browser bridge port from `6359`

Example:

```bash
MCP_BRIDGE_PORT=6360 construct-shader-graph-mcp
```

## How it works

There are two sides to the integration:

1. The MCP host launches this package over stdio.
2. The Construct Shader Graph page connects to the local WebSocket bridge.

The page should:

- connect to `ws://127.0.0.1:6359` by default
- register itself with project metadata from `shader.getInfo()`
- answer `invoke` messages with exact API return values

## Claude Desktop setup

If installed globally:

```json
{
  "mcpServers": {
    "construct-shader-graph": {
      "command": "construct-shader-graph-mcp"
    }
  }
}
```

If using `npx`:

```json
{
  "mcpServers": {
    "construct-shader-graph": {
      "command": "npx",
      "args": ["-y", "construct-shader-graph-mcp"]
    }
  }
}
```

## OpenCode setup

Use the same command shape in your MCP configuration.

Global install example:

```json
{
  "mcpServers": {
    "construct-shader-graph": {
      "command": "construct-shader-graph-mcp"
    }
  }
}
```

`npx` example:

```json
{
  "mcpServers": {
    "construct-shader-graph": {
      "command": "npx",
      "args": ["-y", "construct-shader-graph-mcp"]
    }
  }
}
```

## Typical usage flow

1. Start the MCP server from your host.
2. Open Construct Shader Graph.
3. In the app, connect to the MCP bridge from the Help menu.
4. The host can now:
   - call `list_projects`
   - select the right project with `select_project`
   - inspect available methods with `get_project_manifest`
   - execute API calls with `call_project_method`

For better AI guidance, the host can also:

- read the built-in guidance resources
- use the built-in workflow prompts for common tasks

## Publish notes

This package is configured for npm publishing with:

- package name: `construct-shader-graph-mcp`
- CLI binary: `construct-shader-graph-mcp`
- limited published files through the `files` field

Check package contents before publishing:

```bash
npm run pack:check
```

Publish publicly:

```bash
npm publish
```

## Repo layout

- `src/server.mjs` - MCP server and bridge
- `src/guidance/skill.md` - bundled AI guidance and best practices
- `bin/construct-shader-graph-mcp.js` - CLI entrypoint
- `caw-icon.png` - package/readme icon
