const test = require("node:test");
const assert = require("node:assert");
const { createApp } = require("../src/app");
const V = require("../src/validate");

// Fake PokeAPI: knows "pikachu" and a short name list, everything else is a 404
const fakeHttp = {
  async get(url) {
    if (url.endsWith("/pokemon/pikachu")) {
      return { data: { name: "pikachu", height: 4, types: [{ type: { name: "electric" } }], abilities: [{ ability: { name: "static" } }] } };
    }
    if (url.includes("limit=2000")) {
      return { data: { results: [{ name: "pikachu" }, { name: "pichu" }, { name: "raichu" }] } };
    }
    const err = new Error("not found");
    err.response = { status: 404 };
    throw err;
  },
};

async function start() {
  const server = await new Promise((resolve) => {
    const s = createApp(fakeHttp).listen(0, () => resolve(s));
    s.unref(); // don't keep the process alive just for this server (tests will exit when done)
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { get: (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() })), close: () => server.close() };
}

test("GET /health returns 200", async () => {
  const s = await start();
  const r = await s.get("/health");
  assert.strictEqual(r.status, 200);
  s.close();
});

test("lookup of a real pokemon returns its types", async () => {
  const s = await start();
  const r = await s.get("/api/lookup?name=Pikachu");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.types, ["electric"]);
  assert.strictEqual(r.body.height, 0.4);
  s.close();
});

test("lookup of a typo returns 404 with suggestions", async () => {
  const s = await start();
  const r = await s.get("/api/lookup?name=pikachuu");
  assert.strictEqual(r.status, 404);
  assert.ok(r.body.suggestions.includes("pikachu"));
  s.close();
});

test("lookup without a name returns 400", async () => {
  const s = await start();
  assert.strictEqual((await s.get("/api/lookup")).status, 400);
  s.close();
});

test("normalizePokemonName handles spaces and dots", () => {
  assert.strictEqual(V.normalizePokemonName("Mr. Mime"), "mr-mime");
});

test("editDistance counts a swapped pair as one edit", () => {
  assert.strictEqual(V.editDistance("fiary", "fairy"), 1);
});

// ---------- extra lookup-service tests ----------
test("lookup normalises 'Mr. Mime' style input before calling PokeAPI", async () => {
  const urls = [];
  const spyHttp = { async get(url) { urls.push(url); const e = new Error("nf"); e.response = { status: 404 }; throw e; } };
  const server = await new Promise((r) => { const s = createApp(spyHttp).listen(0, () => r(s)); });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/lookup?name=${encodeURIComponent("Mr. Mime")}`);
  assert.strictEqual(res.status, 404);
  assert.ok(urls.some((u) => u.endsWith("/pokemon/mr-mime")));
  server.close();
});

test("lookup of an unknown name returns 404 with an empty-or-array suggestions list", async () => {
  const s = await start();
  const r = await s.get("/api/lookup?name=zzzzzzzz");
  assert.strictEqual(r.status, 404);
  assert.ok(Array.isArray(r.body.suggestions));
  assert.match(r.body.error, /No pokemon found/);
  s.close();
});

test("lookup with a blank name returns 400", async () => {
  const s = await start();
  assert.strictEqual((await s.get("/api/lookup?name=%20%20")).status, 400);
  s.close();
});

test("a non-404 PokeAPI failure returns 500", async () => {
  const downHttp = { async get() { throw new Error("network down"); } };
  const server = await new Promise((r) => { const sv = createApp(downHttp).listen(0, () => r(sv)); });
  const orig = console.error; console.error = () => {};
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/lookup?name=pikachu`);
  console.error = orig;
  assert.strictEqual(res.status, 500);
  server.close();
});

test("suggestions still work (as empty list) if the name list cannot be loaded", async () => {
  const flaky = { async get(url) { const e = new Error("x"); e.response = url.includes("limit=2000") ? undefined : { status: 404 }; throw e; } };
  const server = await new Promise((r) => { const sv = createApp(flaky).listen(0, () => r(sv)); });
  const orig = console.error; console.error = () => {};
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/lookup?name=pikachuu`);
  console.error = orig;
  const body = await res.json();
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(body.suggestions, []);
  server.close();
});

test("lookup response includes all abilities and the first as `ability`", async () => {
  const http = { async get() { return { data: { name: "gengar", height: 15, types: [{ type: { name: "ghost" } }, { type: { name: "poison" } }], abilities: [{ ability: { name: "cursed-body" } }, { ability: { name: "levitate" } }] } }; } };
  const server = await new Promise((r) => { const sv = createApp(http).listen(0, () => r(sv)); });
  const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/lookup?name=gengar`)).json();
  assert.strictEqual(body.type, "ghost, poison");
  assert.strictEqual(body.ability, "cursed-body");
  assert.deepStrictEqual(body.abilities, ["cursed-body", "levitate"]);
  assert.strictEqual(body.height, 1.5);
  server.close();
});
