#!/usr/bin/env node
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { createMockAgent } from "./agent";

// Speak ACP over stdio, like any agent the bridge starts.
const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
);
const connection = createMockAgent().connect(stream);
await connection.closed;
