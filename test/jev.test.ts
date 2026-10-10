import { strict as assert } from "node:assert";
import { Jev, JevError, Pacer, API_KEY_VARS, DEFAULT_BASE_URL, fromEnv } from "../src/jev.ts";
import { questionId } from "../src/questions.ts";
import type { Question } from "../src/types.ts";
import { configurable } from "./builders.ts";
import { test, testAsync } from "./harness.ts";

await testAsync("jev: no API key is an auth error, not a crash mid-run", async () => {
  const jev = new Jev({ apiKey: "" });
  await assert.rejects(
    () =>
      jev.ask({}, {
        q0000: { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } },
      }),
    (err: unknown) => {
      assert.ok(err instanceof JevError);
      assert.equal((err as JevError).kind, "auth");
      return true;
    },
  );
});

test("jev: a billing refusal is an auth error, since retrying will not help", () => {
  // 402 came back on every one of 69 requests in a run -- 23 batches times 3
  // passes -- because it was classified `other`, and `other` is per batch.
  assert.equal(Jev.classify(402, ""), "auth");
  assert.equal(Jev.classify(401, ""), "auth");
  assert.equal(Jev.classify(403, ""), "auth");
  assert.equal(Jev.classify(400, "max_tokens_exceeded"), "too_big");
  assert.equal(Jev.classify(400, "bad json"), "other");
  assert.equal(Jev.classify(500, ""), "other");
});

test("jev: a 403 whose body is an HTML page is one batch refused by a proxy, not the account", () => {
  // A web application firewall in front of the API answered 403 with its
  // own HTML page for a couple of files, and the run stopped on the first
  // one, leaving most of its subjects without a verdict. The key was fine:
  // every other batch answered.
  const page = '<!DOCTYPE html>\n<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->';
  assert.equal(Jev.classify(403, page), "other");
  assert.equal(Jev.classify(403, "  <html><body>Forbidden</body></html>"), "other");
  assert.equal(Jev.classify(403, '{"error":"forbidden"}'), "auth", "the API's own refusal still stops the run");
});

await testAsync("jev: an HTML 403 reaches the caller as a per-batch failure naming the proxy", async () => {
  const fakeFetch = (async () =>
    new Response("<!DOCTYPE html><html><body>Access denied</body></html>", { status: 403 })) as typeof fetch;
  const jev = new Jev({ apiKey: "k", retries: 0, fetch: fakeFetch });
  await assert.rejects(
    () =>
      jev.ask({}, {
        q0000: { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } },
      }),
    (err: unknown) => {
      assert.ok(err instanceof JevError);
      assert.equal((err as JevError).kind, "other");
      assert.match((err as JevError).message, /not from the API/);
      return true;
    },
  );
});

await testAsync("jev: an empty question set costs nothing and makes no request", async () => {
  let called = false;
  const jev = new Jev({ apiKey: "k", onRequest: () => (called = true) });
  const res = await jev.ask({}, {});
  assert.deepEqual(res.answers, {});
  assert.equal(called, false);
  assert.equal(jev.calls, 0);
});

await testAsync("jev: a too-big request is halved until it fits, and answers merge", async () => {
  const jev = new Jev({ apiKey: "k", retries: 0 });
  const seen: string[][] = [];
  let calls = 0;
  jev.ask = async (_state: unknown, questions: Record<string, Question>) => {
    calls += 1;
    const names = Object.keys(questions);
    // A stand-in server whose limit is two questions: over it, it answers
    // as the real one does to a request over its token limit.
    // jev-lint-ignore-next-line error-message-matches-condition
    if (names.length > 2) {
      throw new JevError("max_tokens_exceeded", { status: 400, kind: "too_big" });
    }
    seen.push(names);
    return {
      answers: Object.fromEntries(names.map((n) => [n, { type: "noul", noul: 0.5 }])),
      usage: { input_tokens: 10 },
    };
  };
  const questions = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      questionId(i),
      { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } },
    ]),
  ) as Record<string, Question>;
  const res = await jev.askSplitting({}, questions);
  assert.equal(Object.keys(res.answers!).length, 8, "every question must come back");
  assert.equal(res.usage!.input_tokens, 40);
  assert.ok(seen.every((s) => s.length <= 2));
  assert.ok(calls > 1);
});

await testAsync("jev: a single question that is still too big is not retried forever", async () => {
  const jev = new Jev({ apiKey: "k" });
  jev.ask = async () => {
    throw new JevError("max_tokens_exceeded", { status: 400, kind: "too_big" });
  };
  await assert.rejects(
    () =>
      jev.askSplitting({}, {
        q0000: { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } },
      }),
    /max_tokens_exceeded/,
  );
});

await testAsync("jev: a 429 is waited out at a lower rate and the request goes again, not lost", async () => {
  // The server rate-limits with a bare 429 -- no retry-after, no ratelimit
  // headers -- on input tokens, not requests. The client mirrors the bucket
  // and paces itself; a 429 means the mirror was optimistic: it empties,
  // the rate drops, and the request that met it waits and goes again. It is
  // not a failure of the request and does not spend the retry budget.
  const pacer = new Pacer(1_000_000, 1_000_000);
  const jev = new Jev({ apiKey: "k", retries: 0, pacer, fetch: fakeFetch, rateLimitWaitMs: 1 });
  let calls = 0;
  async function fakeFetch(): Promise<Response> {
    calls += 1;
    if (calls <= 3) {
      return new Response('{"detail":{"error_type":"api_usage_error","message":"Rate limit exceeded."}}', { status: 429 });
    }
    return new Response(JSON.stringify({ answers: { q0000: { type: "noul", noul: 0.5 } }, usage: { input_tokens: 1 } }), { status: 200 });
  }
  const q = { q0000: { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } } } as Record<string, Question>;
  const res = await jev.askSplitting({}, q);
  assert.ok(res.answers?.q0000, "the verdict came back after the 429s");
  assert.equal(jev.rateLimited, 3, "each refusal is counted");
  assert.equal(jev.retried, 0, "a 429 does not spend the retry budget");
  assert.ok(pacer.rate < 1_000_000 * 0.75 ** 2, `the rate dropped a quarter per 429, got ${pacer.rate}`);
  assert.ok(pacer.available() < 500_000, "the mirror was emptied and has only begun to refill");
});

test("jev: the pacer charges the estimate, refills at its rate, and makes a request wait", () => {
  const t0 = 1_000_000;
  const pacer = new Pacer(100_000, 300_000, t0);
  assert.equal(pacer.delay(250_000, t0), 0, "within the burst: no wait");
  assert.equal(pacer.delay(300_000, t0), 0);
  assert.equal(pacer.delay(2_000_000, t0), 0, "a request larger than the burst goes when the bucket is full, not never");
  // Charge 250k: 50k left; 100k more is 500 ms away at 100k/s. The three
  // instants below must go FORWARDS. This test used to read the clock back
  // from t0+500 to t0+250 and expect 250 ms, which only worked because
  // `refill` subtracted the negative elapsed time -- it was asserting the
  // backwards-clock bug, not the refill rate. Half the wait is now measured
  // by asking half way there.
  pacer.settle(0, 250_000);
  assert.equal(pacer.delay(100_000, t0), 500);
  assert.equal(pacer.delay(100_000, t0 + 250), 250, "half the refill, half the wait");
  assert.equal(pacer.delay(100_000, t0 + 500), 0);
  // The server counted more than the estimate: the difference is charged.
  pacer.settle(1_000, 21_000);
  assert.equal(pacer.delay(100_000, t0 + 500), 200);
  // A 429 empties the mirror and slows the refill.
  pacer.throttled(t0 + 500);
  assert.equal(pacer.rate, 75_000);
  assert.equal(pacer.available(t0 + 500), 0);
  assert.equal(pacer.delay(75_000, t0 + 500), 1000);
});

test("jev: the pacer treats a backwards clock as no elapsed time, not as a debt", () => {
  // `at` comes from `Date.now()` on every call, so an NTP step or a laptop
  // waking from suspend can hand `refill` a `now` that is earlier than the
  // last one. Unclamped, the elapsed term goes negative and SUBTRACTS from
  // the mirror: at the shipped 200,000 tokens/s a one-second step back takes
  // 200,000 tokens out of a bucket the server never touched, and the client
  // waits for a limit that is not being imposed -- silently, since no 429 is
  // involved and `rateLimited` stays zero. Reported from jev-test-filter,
  // which hit it by mixing `take()` against the wall clock with frozen-clock
  // `delay(n, t)` calls.
  const pacer = new Pacer(1000, 1000, 1_000_000);
  assert.equal(pacer.available(999_000), 1000, "a second backwards is not a second's worth of debt");
  // And the clock is still believed: `at` moves to the earlier instant, so a
  // second that passes from THERE refills from there. Refusing to move `at`
  // back would leave it in the future after a permanent step and stall the
  // bucket until the clock caught up.
  pacer.settle(0, 1000);
  assert.equal(pacer.available(999_500), 500, "half a second from the new instant is half the rate");
});

await testAsync("jev: a 429 that never clears is given up on, with the server's message", async () => {
  const jev = new Jev({ apiKey: "k", retries: 0, fetch: always429, rateLimitWaitMs: 1, rateLimitRetries: 3 });
  let calls = 0;
  async function always429(): Promise<Response> {
    calls += 1;
    return new Response('{"detail":{"message":"Rate limit exceeded."}}', { status: 429 });
  }
  const q = { q0000: { type: "noul", instructions: {}, criteria: { true: "y", false: "n" } } } as Record<string, Question>;
  await assert.rejects(() => jev.ask({}, q), /HTTP 429/);
  assert.equal(calls, 4, "one attempt plus rateLimitRetries");
});

await testAsync("jev: usage is priced at the published input rate", async () => {
  const jev = new Jev({ apiKey: "k" });
  jev.inputTokens = 1_000_000;
  assert.ok(Math.abs(jev.usd - 0.042) < 1e-9);
});

test("jev: the key and the endpoint prefer TYPESAFE_ and fall back to TYPESAFEAI_", () => {
  // The prevailing spelling wins, and an environment that only has the older
  // name keeps working -- an existing setup should not become a config error.
  assert.deepEqual(API_KEY_VARS, ["TYPESAFE_API_KEY", "TYPESAFEAI_API_KEY"]);
  assert.equal(fromEnv(API_KEY_VARS, { TYPESAFEAI_API_KEY: "old" }), "old");
  assert.equal(fromEnv(API_KEY_VARS, { TYPESAFE_API_KEY: "new", TYPESAFEAI_API_KEY: "old" }), "new");
  assert.equal(fromEnv(API_KEY_VARS, { TYPESAFE_API_KEY: "   ", TYPESAFEAI_API_KEY: "old" }), "old",
    "blank is not set");
  assert.equal(fromEnv(API_KEY_VARS, {}), null);
});

test("jev: the endpoint is configurable and a trailing slash does not double up", () => {
  assert.equal(new Jev({ apiKey: "k" }).baseUrl, DEFAULT_BASE_URL);
  assert.equal(new Jev({ apiKey: "k", baseUrl: "https://proxy.example/v1/" }).baseUrl,
    "https://proxy.example/v1", "or the request path would contain //");
});

const gatewayQuestions: Record<string, Question> = {
  q: { type: "noul", instructions: { statement: "Is the supplied evidence inconsistent?" }, criteria: { true: "yes", false: "no" } },
};
const gatewayResult = (answers: unknown = { q: { type: "noul", noul: 0.8 } }) => ({
  success: true, result: { state: "Completed", result: { model: "typesafe/jev", answers, usage: { input_tokens: 10 } } },
});
const gatewayOptions = { transport: "cloudflare" as const, accountId: "a".repeat(32), gatewayId: "gateway", apiKey: "not-a-credential", model: "typesafe/jev" };

await testAsync("jev: Gateway uses the universal envelope, fixed endpoint, opt-in cache and completed answers", async () => {
  let requests = 0;
  const client = new Jev({ ...gatewayOptions, baseUrl: "https://ignored.invalid", fetch: async (url, init) => {
    requests += 1;
    assert.equal(url, "https://api.cloudflare.com/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/ai/run");
    assert.deepEqual(JSON.parse(String(init!.body)), { model: "typesafe/jev", input: { state: { evidence: "full external state" }, questions: gatewayQuestions } });
    const headers = new Headers(init!.headers);
    assert.equal(headers.get("authorization"), `Bearer ${gatewayOptions.apiKey}`);
    assert.equal(headers.get("cf-aig-gateway-id"), "gateway");
    assert.equal(init!.redirect, "error");
    assert.equal(headers.get("cf-aig-cache-ttl"), "2592000");
    assert.equal(headers.get("cf-aig-skip-cache"), "false");
    assert.match(headers.get("cf-aig-cache-key")!, /^decision-v1-[a-f0-9]{64}$/);
    assert.ok(!headers.get("cf-aig-cache-key")!.includes(gatewayOptions.apiKey));
    return Response.json(gatewayResult());
  } });
  const result = await client.ask({ evidence: "full external state" }, gatewayQuestions);
  assert.equal(requests, 1);
  assert.equal(result.model, "typesafe/jev");
  assert.equal(client.servedModel, "typesafe/jev");
  assert.equal(client.spent.inputTokens, 10);
  assert.match(client.spent.usdSource!, /not Cloudflare billing/);
  assert.equal(client.retries, 0);
  assert.equal(client.rateLimitRetries, 0);
});

await testAsync("jev: Gateway cache equivalence covers model, account, Gateway, credential scope and complete canonical state", async () => {
  const keys: string[] = [];
  const ask = async (state: unknown, overrides = {}) => {
    const client = new Jev({ ...gatewayOptions, ...overrides, fetch: async (_url, init) => {
      keys.push(new Headers(init!.headers).get("cf-aig-cache-key")!);
      return Response.json(gatewayResult());
    } });
    await client.ask(state, gatewayQuestions);
  };
  await ask({ b: "external", a: { content: "one" } });
  await ask({ a: { content: "one" }, b: "external" });
  assert.equal(keys[0], keys[1], "object insertion order does not change equivalence");
  await ask({ a: { content: "two" }, b: "external" });
  for (const overrides of [{ model: "typesafe/another" }, { accountId: "b".repeat(32) }, { gatewayId: "another" }, { apiKey: "different-non-credential" }]) await ask({ b: "external", a: { content: "one" } }, overrides);
  assert.equal(new Set(keys.slice(1)).size, 6);
});

await testAsync("jev: Gateway rejects failed jobs, malformed envelopes, missing answers and invalid typed judgments", async () => {
  const invalid = [null, {}, { success: false }, { success: true, result: { state: "Pending" } },
    { success: true, result: { model: "typesafe/jev", answers: { q: { type: "noul", noul: 0.8 } } } },
    gatewayResult({}), gatewayResult({ q: { type: "noul", noul: 0.8 }, extra: {} }),
    gatewayResult({ q: { type: "noul", noul: 1.2 } }), gatewayResult({ q: { type: "score", score: 0.8 } }),
    gatewayResult({ q: { type: "noul", noul: 0.8, confidence: -1 } }),
    gatewayResult({ q: { type: "noul", noul: 0.8, probabilities: { yes: 0.9, no: 0.9 } } })];
  for (const response of invalid) {
    const client = new Jev({ ...gatewayOptions, fetch: async () => Response.json(response) });
    await assert.rejects(() => client.ask({}, gatewayQuestions), JevError);
    assert.equal(client.calls, 0, "invalid responses are not successful calls");
  }
  const malformed = new Jev({ ...gatewayOptions, fetch: async () => new Response("not JSON") });
  await assert.rejects(() => malformed.ask({}, gatewayQuestions), JevError);
  for (const status of [401, 403, 429, 500]) {
    let requests = 0;
    const client = new Jev({ ...gatewayOptions, fetch: async () => { requests += 1; return new Response("refused", { status }); } });
    await assert.rejects(() => client.ask({}, gatewayQuestions), JevError);
    assert.equal(requests, 1, "failure never changes route or multiplies Gateway retries");
  }
});

await testAsync("jev: missing Gateway configuration fails before transport, even with a direct Typesafe credential", async () => {
  for (const overrides of [{ accountId: "" }, { accountId: "not-32-hex" }, { gatewayId: "bad\nheader" }, { apiKey: "bad\nheader" }, { gatewayId: "" }, { apiKey: "" }, { cacheTtl: 59 }, { cacheTtl: 2592001 }]) {
    const client = new Jev({ ...gatewayOptions, ...overrides, fetch: async () => { throw new Error("transport must not run"); } });
    await assert.rejects(() => client.ask({}, gatewayQuestions), (error: unknown) => error instanceof JevError && error.kind === "auth");
  }
});
