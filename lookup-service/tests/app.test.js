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
