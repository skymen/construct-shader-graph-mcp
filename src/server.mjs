import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer } from "ws";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRIDGE_PORT = Number(process.env.MCP_BRIDGE_PORT || 6359);
const CONTROL_PORT = Number(process.env.MCP_CONTROL_PORT || BRIDGE_PORT + 1);
const SKILL_PATH = path.resolve(__dirname, "guidance/skill.md");

const sessions = new Map();
let selectedSessionId = null;
let localServer = null;
let bridge = null;
let controlServer = null;
let isPrimaryInstance = false;
let promotionInFlight = null;

function log(message, ...args) {
  console.error(`[construct-shader-graph-mcp] ${message}`, ...args);
}

function nowIso() {
  return new Date().toISOString();
}

function loadSkillText() {
  return fs.readFileSync(SKILL_PATH, "utf8");
}

function loadQuickstartText() {
  return `# Construct Shader Graph MCP Quickstart

Use MCP tools only.

## Core loop

1. Call list_projects.
2. Select the correct project with select_project.
3. Read get_project_manifest if methods or arguments are unclear.
4. Start the task with session.initAIWork.
5. Inspect before mutating.
6. Make one small edit at a time.
7. Re-read affected nodes, ports, wires, or settings.
8. Validate with shader.getGeneratedCode, preview.getErrors, and screenshots when needed.
9. Finish with session.endAIWork.

## Best practices

- Use shader.getInfo metadata to identify the right project.
- Use exact ids returned by the API.
- Inspect ports before wiring.
- Prefer editable input values before adding literal nodes.
- Use nodeTypes.search or nodeTypes.list before guessing type keys.
- Use variables when one output fans out to multiple distant places.

## Important method patterns

- Discover node types: nodeTypes.search, nodeTypes.list, nodeTypes.get
- Inspect graph: nodes.list, nodes.getInfo, nodes.getPorts, wires.getAll, uniforms.list
- Edit node input values: nodes.edit(nodeId, { inputValues: { PortName: value } })
- Wire nodes: wires.create({ from, to }) after inspecting both ports
- Validate: ai.runDebugCheck({ includeScreenshot: true })
`;
}

function getPromptPreamble() {
  return [
    "Use Construct Shader Graph through MCP only.",
    "Start with list_projects and select_project.",
    "Use shader.getInfo metadata to identify the right project.",
    "Use get_project_manifest when capabilities or argument shapes are unclear.",
    "Use exact return values from call_project_method instead of guessing state.",
    "Inspect first, mutate second, and verify after each meaningful edit.",
  ].join("\n");
}

function getSessionSummary(session) {
  return {
    sessionId: session.sessionId,
    projectName: session.project?.name || "Untitled Shader",
    connectedAt: session.connectedAt,
    updatedAt: session.updatedAt,
    manifestVersion: session.manifest?.version || null,
    methodCount: Array.isArray(session.manifest?.methods)
      ? session.manifest.methods.length
      : 0,
    selected: selectedSessionId === session.sessionId,
  };
}

function ensureSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Unknown session '${sessionId}'`);
  }
  return session;
}

function ensureSelectedSession() {
  if (!selectedSessionId) {
    throw new Error("No project selected. Call select_project first.");
  }

  return ensureSession(selectedSessionId);
}

function sendJson(socket, payload) {
  socket.write(`${JSON.stringify(payload)}\n`);
}

function sendWsJson(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function invokeSession(session, method, args = []) {
  return new Promise((resolve, reject) => {
    if (session.socket.readyState !== session.socket.OPEN) {
      reject(new Error(`Session '${session.sessionId}' is not connected`));
      return;
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const timeoutId = setTimeout(() => {
      session.pending.delete(requestId);
      reject(
        new Error(
          `Timed out waiting for '${method}' result from session '${session.sessionId}'`,
        ),
      );
    }, 15000);

    session.pending.set(requestId, {
      resolve,
      reject,
      timeoutId,
      method,
    });

    sendWsJson(session.socket, {
      type: "invoke",
      requestId,
      method,
      args,
    });
  });
}

function createToolDefinitions() {
  return [
    {
      name: "get_skill_guidance",
      config: {
        description:
          "Return the full Construct Shader Graph MCP guidance and best practices.",
        inputSchema: {},
        outputSchema: {
          title: z.string(),
          content: z.string(),
        },
      },
      handler: async () => {
        const result = {
          title: "Construct Shader Graph MCP Guidance",
          content: loadSkillText(),
        };
        return {
          content: [{ type: "text", text: result.content }],
          structuredContent: result,
        };
      },
    },
    {
      name: "list_projects",
      config: {
        description:
          "List connected Construct Shader Graph tabs registered with the local bridge.",
        inputSchema: {},
        outputSchema: {
          projects: z.array(
            z.object({
              sessionId: z.string(),
              projectName: z.string(),
              connectedAt: z.string(),
              updatedAt: z.string(),
              manifestVersion: z.string().nullable(),
              methodCount: z.number(),
              selected: z.boolean(),
            }),
          ),
          selectedSessionId: z.string().nullable(),
        },
      },
      handler: async () => {
        const projects = [...sessions.values()].map(getSessionSummary);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ projects, selectedSessionId }, null, 2),
            },
          ],
          structuredContent: {
            projects,
            selectedSessionId,
          },
        };
      },
    },
    {
      name: "select_project",
      config: {
        description:
          "Choose which connected shader graph tab future MCP calls should target.",
        inputSchema: {
          sessionId: z
            .string()
            .describe("Session id returned by list_projects."),
        },
        outputSchema: {
          sessionId: z.string(),
          projectName: z.string(),
        },
      },
      handler: async ({ sessionId }) => {
        const session = ensureSession(sessionId);
        selectedSessionId = sessionId;
        const result = {
          sessionId,
          projectName: session.project?.name || "Untitled Shader",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      },
    },
    {
      name: "get_project_manifest",
      config: {
        description:
          "Get the machine-readable API manifest for the selected project.",
        inputSchema: {
          sessionId: z
            .string()
            .optional()
            .describe("Optional session id; defaults to the selected project."),
        },
        outputSchema: {
          sessionId: z.string(),
          manifest: z.any(),
        },
      },
      handler: async ({ sessionId }) => {
        const session = sessionId
          ? ensureSession(sessionId)
          : ensureSelectedSession();
        const result = {
          sessionId: session.sessionId,
          manifest: session.manifest,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      },
    },
    {
      name: "call_project_method",
      config: {
        description:
          "Call one method from the selected project's shaderGraphAPI and return its exact result.",
        inputSchema: {
          sessionId: z
            .string()
            .optional()
            .describe("Optional session id; defaults to the selected project."),
          method: z
            .string()
            .describe(
              "Manifest method path, for example nodes.create or shader.getInfo.",
            ),
          args: z
            .array(z.any())
            .optional()
            .describe("Positional arguments to pass to the API method."),
        },
        outputSchema: {
          sessionId: z.string(),
          // project: z.any(),
          method: z.string(),
          args: z.array(z.any()),
          durationMs: z.number(),
          result: z.any(),
        },
      },
      handler: async ({ sessionId, method, args = [] }) => {
        const session = sessionId
          ? ensureSession(sessionId)
          : ensureSelectedSession();
        const response = await invokeSession(session, method, args);
        const result = {
          sessionId: session.sessionId,
          // project: session.project,
          method,
          args,
          durationMs: response.durationMs ?? 0,
          result: response.result,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      },
    },
  ];
}

function registerResources(server) {
  server.registerResource(
    "skill-guidance",
    "construct-shader-graph://guidance/skill",
    {
      title: "Construct Shader Graph MCP Guidance",
      description:
        "Full best-practices guidance for using Construct Shader Graph through MCP.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: loadSkillText(),
        },
      ],
    }),
  );

  server.registerResource(
    "quickstart-guidance",
    "construct-shader-graph://guidance/quickstart",
    {
      title: "Construct Shader Graph MCP Quickstart",
      description: "Short workflow guidance for reliable MCP use.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: loadQuickstartText(),
        },
      ],
    }),
  );
}

function registerPrompts(server) {
  server.registerPrompt(
    "work-with-shader-graph",
    {
      title: "Work With Shader Graph",
      description:
        "General prompt for safely inspecting and editing a Construct Shader Graph project.",
      argsSchema: z.object({
        task: z.string().optional().describe("The user task to accomplish."),
      }),
    },
    ({ task }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getPromptPreamble()}\n\nFollow the full guidance resource if more detail is needed.\n\nTask: ${task || "Inspect the current project, understand its graph state, and proceed safely."}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "inspect-graph",
    {
      title: "Inspect Graph",
      description:
        "Prompt for safely inspecting the current graph before any edits.",
      argsSchema: z.object({
        focus: z
          .string()
          .optional()
          .describe(
            "Optional area to inspect, like uniforms, preview, or node types.",
          ),
      }),
    },
    ({ focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getPromptPreamble()}\n\nInspect the current graph without mutating it. Read nodes, wires, uniforms, shader info, and any relevant settings first. ${focus ? `Focus on: ${focus}.` : ""}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "edit-graph-safely",
    {
      title: "Edit Graph Safely",
      description: "Prompt for making a small validated graph edit with MCP.",
      argsSchema: z.object({
        task: z.string().describe("The graph edit to perform."),
      }),
    },
    ({ task }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getPromptPreamble()}\n\nMake the smallest valid change that satisfies this task: ${task}\n\nBefore wiring, inspect ports. Before choosing a node type, use nodeTypes.search or nodeTypes.list. After each structural edit, re-read affected nodes or ports and validate preview/code if relevant.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "debug-preview-errors",
    {
      title: "Debug Preview Errors",
      description:
        "Prompt for debugging generated code or preview issues in a shader graph project.",
      argsSchema: z.object({
        issue: z
          .string()
          .optional()
          .describe("Optional description of the observed preview issue."),
      }),
    },
    ({ issue }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${getPromptPreamble()}\n\nDebug the current shader graph by inspecting shader.getGeneratedCode, preview.getErrors, preview settings, node preview, and ai.runDebugCheck. ${issue ? `Observed issue: ${issue}` : ""}`,
          },
        },
      ],
    }),
  );
}

function createLocalServer() {
  const server = new McpServer({
    name: "construct-shader-graph",
    version: "0.1.0",
  });

  registerResources(server);
  registerPrompts(server);
  createToolDefinitions().forEach((tool) => {
    server.registerTool(tool.name, tool.config, tool.handler);
  });

  return server;
}

async function startPrimaryBackend() {
  localServer = createLocalServer();

  bridge = new WebSocketServer({ noServer: true });
  const httpServer = http.createServer();

  httpServer.on("upgrade", (request, socket, head) => {
    bridge.handleUpgrade(request, socket, head, (ws) => {
      bridge.emit("connection", ws, request);
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(BRIDGE_PORT, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  bridge.on("connection", (socket) => {
    let activeSessionId = null;

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "register") {
        const sessionId = String(message.sessionId || "").trim();
        if (!sessionId) {
          sendWsJson(socket, { type: "error", message: "Missing sessionId" });
          return;
        }

        const session = {
          sessionId,
          socket,
          project: message.project || {
            name: "Untitled Shader",
            version: "0.0.0.0",
          },
          manifest: message.manifest || null,
          connectedAt: nowIso(),
          updatedAt: nowIso(),
          pending: new Map(),
        };

        sessions.set(sessionId, session);
        activeSessionId = sessionId;
        if (!selectedSessionId) {
          selectedSessionId = sessionId;
        }

        log(
          `registered ${sessionId} (${session.project?.name || "Untitled Shader"})`,
        );
        sendWsJson(socket, {
          type: "registered",
          sessionId,
          selected: selectedSessionId === sessionId,
        });
        return;
      }

      if (!activeSessionId) {
        return;
      }

      const session = sessions.get(activeSessionId);
      if (!session) {
        return;
      }

      session.updatedAt = nowIso();

      if (message.type === "project-updated") {
        session.project = message.project || session.project;
        session.manifest = message.manifest || session.manifest;
        return;
      }

      if (message.type === "result") {
        const pending = session.pending.get(message.requestId);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        session.pending.delete(message.requestId);

        if (message.ok) {
          pending.resolve(message);
        } else {
          const error = new Error(
            message.error?.message || `Call '${pending.method}' failed`,
          );
          error.stack = message.error?.stack || error.stack;
          pending.reject(error);
        }
      }
    });

    socket.on("close", () => {
      if (!activeSessionId) {
        return;
      }

      const session = sessions.get(activeSessionId);
      if (!session) {
        return;
      }

      for (const pending of session.pending.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(`Session '${activeSessionId}' disconnected`));
      }

      sessions.delete(activeSessionId);
      if (selectedSessionId === activeSessionId) {
        selectedSessionId = sessions.keys().next().value || null;
      }

      log(`disconnected ${activeSessionId}`);
    });
  });

  log(`bridge listening on ws://127.0.0.1:${BRIDGE_PORT}`);

  controlServer = net.createServer((socket) => {
    const rl = readline.createInterface({ input: socket });

    rl.on("line", async (line) => {
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        sendJson(socket, { ok: false, error: "Invalid JSON request" });
        return;
      }

      if (!request || request.type !== "rpc") {
        sendJson(socket, { ok: false, error: "Invalid control request" });
        return;
      }

      const tool = createToolDefinitions().find(
        (entry) => entry.name === request.tool,
      );
      if (!tool) {
        sendJson(socket, {
          id: request.id,
          ok: false,
          error: `Unknown tool '${request.tool}'`,
        });
        return;
      }

      try {
        const response = await tool.handler(request.input || {});
        sendJson(socket, { id: request.id, ok: true, response });
      } catch (error) {
        sendJson(socket, {
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  try {
    await new Promise((resolve, reject) => {
      controlServer.once("error", reject);
      controlServer.listen(CONTROL_PORT, "127.0.0.1", () => {
        controlServer.off("error", reject);
        resolve();
      });
    });
  } catch (err) {
    httpServer.close();
    bridge.close();
    throw err;
  }

  // Permanent error handlers to prevent unhandled error crashes
  httpServer.on("error", (err) => log("bridge http error:", err.message));
  controlServer.on("error", (err) => log("control server error:", err.message));

  isPrimaryInstance = true;
  log(`control listening on tcp://127.0.0.1:${CONTROL_PORT}`);
}

function createProxyServer() {
  const server = new McpServer({
    name: "construct-shader-graph",
    version: "0.1.0",
  });

  registerResources(server);
  registerPrompts(server);
  createToolDefinitions().forEach((tool) => {
    server.registerTool(tool.name, tool.config, async (input = {}) => {
      return callPrimaryTool(tool.name, input);
    });
  });

  return server;
}

function callPrimaryToolDirect(tool, input) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: CONTROL_PORT,
    });
    const requestId = `rpc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const rl = readline.createInterface({ input: socket });

    socket.on("error", (error) => {
      reject(error);
    });

    rl.on("line", (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        reject(new Error("Invalid control response"));
        socket.destroy();
        return;
      }

      if (response.id !== requestId) {
        return;
      }

      rl.close();
      socket.end();
      if (response.ok) {
        resolve(response.response);
      } else {
        reject(new Error(response.error || "Primary MCP request failed"));
      }
    });

    sendJson(socket, {
      type: "rpc",
      id: requestId,
      tool,
      input,
    });
  });
}

async function tryPromoteToPrimary() {
  if (isPrimaryInstance) return true;

  // Deduplicate concurrent promotion attempts
  if (promotionInFlight) return promotionInFlight;

  promotionInFlight = (async () => {
    try {
      await startPrimaryBackend();
      log("promoted to primary instance");
      return true;
    } catch (err) {
      if (err?.code === "EADDRINUSE") {
        log("promotion failed: another primary appeared");
      } else {
        log("promotion failed:", err.message);
      }
      // Reset partial state
      isPrimaryInstance = false;
      localServer = null;
      bridge = null;
      controlServer = null;
      return false;
    } finally {
      promotionInFlight = null;
    }
  })();

  return promotionInFlight;
}

function executeToolLocally(toolName, input) {
  const tool = createToolDefinitions().find((t) => t.name === toolName);
  if (!tool) throw new Error(`Unknown tool '${toolName}'`);
  return tool.handler(input || {});
}

async function callPrimaryTool(toolName, input) {
  // If we're already promoted, go local
  if (isPrimaryInstance) {
    return executeToolLocally(toolName, input);
  }

  try {
    return await callPrimaryToolDirect(toolName, input);
  } catch (error) {
    // If connection refused, the primary is gone — try to take over
    if (error?.code === "ECONNREFUSED") {
      log("primary unreachable, attempting promotion...");
      const promoted = await tryPromoteToPrimary();
      if (promoted) {
        return executeToolLocally(toolName, input);
      }
      // Another primary appeared while we promoted — retry via proxy
      return callPrimaryToolDirect(toolName, input);
    }
    throw error;
  }
}

async function ensureBackend() {
  try {
    await startPrimaryBackend();
  } catch (error) {
    if (error?.code !== "EADDRINUSE") {
      throw error;
    }

    // Clean up any partially created resources
    isPrimaryInstance = false;
    localServer = null;
    bridge = null;
    controlServer = null;

    log(`bridge already running on ${BRIDGE_PORT}; starting follower proxy`);
  }
}

await ensureBackend();

const server = isPrimaryInstance ? localServer : createProxyServer();
const transport = new StdioServerTransport();
await server.connect(transport);
