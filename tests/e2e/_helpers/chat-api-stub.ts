import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { POST } from "../../../src/app/api/test/anthropic-stub/v1/messages/route.ts";

// Reuse the same provider fixture, including tool calls, outside the compiled app.
// Only the Playwright process serves it; the production app's test route stays 404.
async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method !== "POST" || request.url !== "/v1/messages") {
    request.resume();
    response.writeHead(404).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
      else if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      else throw new Error("Unexpected request body chunk");
    }
    const result = await POST(
      new Request("http://127.0.0.1/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: Buffer.concat(chunks),
      }),
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500).end();
  }
}

export async function startChatApiStub(port: number) {
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing stub address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
