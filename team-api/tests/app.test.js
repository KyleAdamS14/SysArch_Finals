const test = require("node:test");
const assert = require("node:assert");
const { createApp, TEAM_LIMIT } = require("../src/app");
const createMemoryStore = require("./memory-store");

// Starts the app on a random free port and returns a tiny request helper
async function start(initial) {
  const app = createApp(createMemoryStore(initial));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, close: () => server.close() };
}

const valid = { team: "Team A", nickname: "Sparky", pokemon: "Pikachu", type: "electric", ability: "static" };

test("GET /health returns 200", async () => {
  const { call, close } = await start();
  const r = await call("GET", "/health");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, "ok");
  close();
});

test("POST creates a cleaned record and GET lists it", async () => {
  const { call, close } = await start();
  const created = await call("POST", "/api/pokemon", valid);
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.type, "Electric"); // capitalised by cleanRecord
  assert.strictEqual(created.body.ability, "Static");
  const list = await call("GET", "/api/pokemon");
  assert.strictEqual(list.body.length, 1);
  close();
});

test("POST rejects an invalid type with 400", async () => {
  const { call, close } = await start();
  const r = await call("POST", "/api/pokemon", { ...valid, type: "banana" });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.fields.type);
  close();
});

test("a team cannot have more than the team limit", async () => {
  const { call, close } = await start();
  for (let i = 0; i < TEAM_LIMIT; i++) {
    const ok = await call("POST", "/api/pokemon", { ...valid, nickname: "N" + i });
    assert.strictEqual(ok.status, 201);
  }
  const over = await call("POST", "/api/pokemon", valid);
  assert.strictEqual(over.status, 400);
  close();
});

test("team name reuses existing capitalisation", async () => {
  const { call, close } = await start();
  await call("POST", "/api/pokemon", valid);
  const r = await call("POST", "/api/pokemon", { ...valid, team: "team a" });
  assert.strictEqual(r.body.team, "Team A");
  close();
});

test("PUT updates and DELETE removes", async () => {
  const { call, close } = await start();
  const created = await call("POST", "/api/pokemon", valid);
  const id = created.body.id;
  const upd = await call("PUT", `/api/pokemon/${id}`, { ...valid, nickname: "Zap" });
  assert.strictEqual(upd.status, 200);
  assert.strictEqual(upd.body.nickname, "Zap");
  const del = await call("DELETE", `/api/pokemon/${id}`);
  assert.strictEqual(del.status, 204);
  const gone = await call("GET", `/api/pokemon/${id}`);
  assert.strictEqual(gone.status, 404);
  close();
});

test("unknown id returns 404 on PUT and DELETE", async () => {
  const { call, close } = await start();
  assert.strictEqual((await call("PUT", "/api/pokemon/999", valid)).status, 404);
  assert.strictEqual((await call("DELETE", "/api/pokemon/999")).status, 404);
  close();
});
