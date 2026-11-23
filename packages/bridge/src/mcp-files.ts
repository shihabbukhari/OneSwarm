import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * A small MCP server the bridge hands to each agent session. It exposes the
 * channel's files through the OneSwarm API with a short-lived token scoped to
 * one agent and one channel, so the agent only sees files it is allowed to see.
 */
export function createFilesServer(opts: {
  server: string;
  token: string;
  fetchImpl?: typeof fetch;
}) {
  const doFetch = opts.fetchImpl ?? fetch;
  const call = async (path: string, init?: RequestInit) => {
    const res = await doFetch(`${opts.server}/api/agent-api${path}`, {
      ...init,
      headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(body.error ?? `OneSwarm returned ${res.status}`));
    return body;
  };
  const text = (value: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  });

  const server = new McpServer({ name: "oneswarm-files", version: "0.1.0" });

  server.registerTool(
    "list_files",
    { description: "List the files shared in this OneSwarm channel.", inputSchema: {} },
    async () => text((await call("/files")).files),
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a text file shared in this OneSwarm channel, by id or exact name.",
      inputSchema: { file: z.string().describe("File id or exact file name") },
    },
    async ({ file }) => {
      const body = await call(`/files/${encodeURIComponent(file)}`);
      return text(body.text ?? body.note ?? "");
    },
  );

  server.registerTool(
    "search_files",
    {
      description: "Search file names and text contents in this OneSwarm channel.",
      inputSchema: { query: z.string().min(1).describe("Text to look for") },
    },
    async ({ query }) => text((await call(`/search?q=${encodeURIComponent(query)}`)).results),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task in this OneSwarm workspace (only if the agent is allowed to).",
      inputSchema: {
        title: z.string().min(1).max(200),
        description: z.string().max(20_000).optional(),
      },
    },
    async ({ title, description }) => {
      const body = await call("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      });
      const task = body.task as { number: number; title: string };
      return text(`Created OS-${task.number}: ${task.title}`);
    },
  );

  return server;
}

export async function runFilesServer(): Promise<void> {
  const server = process.env.ONESWARM_SERVER;
  const token = process.env.ONESWARM_AGENT_TOKEN;
  if (!server || !token) {
    console.error(
      "oneswarm-files needs ONESWARM_SERVER and ONESWARM_AGENT_TOKEN (the bridge sets them).",
    );
    process.exit(1);
  }
  await createFilesServer({ server, token }).connect(new StdioServerTransport());
}
