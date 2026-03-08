# Construct Shader Graph MCP

Standalone MCP server for controlling Construct Shader Graph through its browser bridge.

## What it provides

- MCP tools for project discovery and method execution
- a local WebSocket bridge on `ws://127.0.0.1:6359`
- built-in guidance for best practices when editing shader graphs

## MCP tools

- `get_skill_guidance`
- `list_projects`
- `select_project`
- `get_project_manifest`
- `call_project_method`

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Optional environment variable:

- `MCP_BRIDGE_PORT` to change the bridge port from `6359`

## Claude Desktop example

```json
{
  "mcpServers": {
    "construct-shader-graph": {
      "command": "node",
      "args": [
        "/Users/ossama/Documents/construct-shader-graph-mcp/bin/construct-shader-graph-mcp.js"
      ]
    }
  }
}
```

## Browser app side

The Construct Shader Graph app should connect to the bridge with:

- default URL: `ws://127.0.0.1:6359`
- register itself with project metadata from `shader.getInfo()`
- answer `invoke` messages with exact method return values

## Repo layout

- `src/server.mjs` - MCP server and bridge
- `src/guidance/skill.md` - AI guidance and best practices
- `bin/construct-shader-graph-mcp.js` - CLI entrypoint
