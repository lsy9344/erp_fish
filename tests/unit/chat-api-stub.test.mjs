import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { POST } from "../../src/app/api/test/anthropic-stub/v1/messages/route.ts";
import { startChatApiStub } from "../e2e/_helpers/chat-api-stub.ts";

const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  process.env.NODE_ENV = "test";
});
afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("loopback provider fixture preserves the existing Anthropic stub responses", async (t) => {
  const stub = await startChatApiStub(0);
  t.after(stub.close);
  assert.match(stub.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  for (const content of ["6월 20일 매출 얼마야", "오늘 매출 분석해줘"]) {
    const body = JSON.stringify({ messages: [{ role: "user", content }] });
    const options = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    };
    const actual = await fetch(`${stub.url}/v1/messages`, options);
    const expected = await POST(
      new Request("http://localhost/v1/messages", options),
    );
    assert.equal(actual.status, 200);
    assert.deepEqual(await actual.json(), await expected.json());
  }
});

test("provider fixture rejects other paths and methods", async (t) => {
  const stub = await startChatApiStub(0);
  t.after(stub.close);
  assert.equal(
    (await fetch(`${stub.url}/unknown`, { method: "POST" })).status,
    404,
  );
  assert.equal((await fetch(`${stub.url}/v1/messages`)).status, 404);
});

test("the app's test API stays unavailable in production", async () => {
  process.env.NODE_ENV = "production";
  const response = await POST(
    new Request("http://localhost/v1/messages", { method: "POST" }),
  );
  assert.equal(response.status, 404);
});
