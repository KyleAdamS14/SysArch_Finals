const test = require("node:test");
const assert = require("node:assert");
const { createApp, TEAM_LIMIT } = require("../src/app");
const createMemoryStore = require("./memory-store");

async function start(store = createMemoryStore()) {
  const server = await new Promise((resolve) => {
    const s = createApp(store).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, raw) => {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };
  return { call, close: () => server.close() };
}

const valid = { team: "Team A", nickname: "Sparky", pokemon: "Pikachu", type: "electric", ability: "static" };

test("GET /api/pokemon on an empty store returns []", async () => {
  const { call, close } = await start();
  const r = await call("GET", "/api/pokemon");
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body, []);
  close();
});

test("GET /api/pokemon/:id returns the record, 404 when missing", async () => {
  const { call, close } = await start();
  const created = await call("POST", "/api/pokemon", valid);
  assert.strictEqual((await call("GET", `/api/pokemon/${created.body.id}`)).status, 200);
  assert.strictEqual((await call("GET", "/api/pokemon/12345")).status, 404);
  close();
});

test("POST with every field missing returns 400 and lists all fields", async () => {
  const { call, close } = await start();
  const r = await call("POST", "/api/pokemon", {});
  assert.strictEqual(r.status, 400);
  assert.strictEqual(Object.keys(r.body.fields).length, 5);
  assert.ok(r.body.error);
  close();
});

test("POST with no body at all returns 400, not a crash", async () => {
  const { call, close } = await start();
  const r = await call("POST", "/api/pokemon");
  assert.strictEqual(r.status, 400);
  close();
});

test("POST with malformed JSON returns a JSON 400 and creates nothing", async () => {
  const { call, close } = await start();
  const bad = await call("POST", "/api/pokemon", null, "{not json");
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.error, "Request body is not valid JSON");
  assert.deepStrictEqual((await call("GET", "/api/pokemon")).body, []);
  close();
});

test("unknown route returns a JSON 404", async () => {
  const { call, close } = await start();
  const r = await call("GET", "/api/nope");
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.body, { error: "Route not found" });
  close();
});

test("POST rejects each invalid field individually", async () => {
  const { call, close } = await start();
  for (const [field, value] of [
    ["team", ""], ["team", "x".repeat(21)], ["nickname", "a@b"],
    ["pokemon", "1"], ["type", "fire, water, grass"], ["ability", "$"],
  ]) {
    const r = await call("POST", "/api/pokemon", { ...valid, [field]: value });
    assert.strictEqual(r.status, 400, `${field}=${value}`);
    assert.ok(r.body.fields[field], `${field} should be flagged`);
  }
  close();
});

test("POST trims spaces and normalises two types", async () => {
  const { call, close } = await start();
  const r = await call("POST", "/api/pokemon", {
    ...valid, team: "  Team Z ", pokemon: " Gengar ", type: "ghost/poison", ability: "cursed-body",
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.team, "Team Z");
  assert.strictEqual(r.body.pokemon, "Gengar");
  assert.strictEqual(r.body.type, "Ghost, Poison");
  assert.strictEqual(r.body.ability, "Cursed Body");
  close();
});

test("different teams each get their own limit", async () => {
  const { call, close } = await start();
  for (let i = 0; i < TEAM_LIMIT; i++) {
    await call("POST", "/api/pokemon", { ...valid, nickname: "A" + i });
  }
  const other = await call("POST", "/api/pokemon", { ...valid, team: "Team B" });
  assert.strictEqual(other.status, 201);
  close();
});

test("limit check is case-insensitive ('team a' counts toward 'Team A')", async () => {
  const { call, close } = await start();
  for (let i = 0; i < TEAM_LIMIT; i++) {
    await call("POST", "/api/pokemon", { ...valid, nickname: "A" + i });
  }
  const over = await call("POST", "/api/pokemon", { ...valid, team: "team a" });
  assert.strictEqual(over.status, 400);
  assert.match(over.body.error, /already has/);
  close();
});

test("deleting a member frees a slot in a full team", async () => {
  const { call, close } = await start();
  const ids = [];
  for (let i = 0; i < TEAM_LIMIT; i++) {
    ids.push((await call("POST", "/api/pokemon", { ...valid, nickname: "A" + i })).body.id);
  }
  await call("DELETE", `/api/pokemon/${ids[0]}`);
  assert.strictEqual((await call("POST", "/api/pokemon", valid)).status, 201);
  close();
});

test("PUT with invalid data returns 400 and leaves the record unchanged", async () => {
  const { call, close } = await start();
  const { body: rec } = await call("POST", "/api/pokemon", valid);
  const bad = await call("PUT", `/api/pokemon/${rec.id}`, { ...valid, type: "banana" });
  assert.strictEqual(bad.status, 400);
  assert.strictEqual((await call("GET", `/api/pokemon/${rec.id}`)).body.type, "Electric");
  close();
});

test("PUT cannot move a pokemon into a full team", async () => {
  const { call, close } = await start();
  for (let i = 0; i < TEAM_LIMIT; i++) {
    await call("POST", "/api/pokemon", { ...valid, nickname: "A" + i });
  }
  const { body: other } = await call("POST", "/api/pokemon", { ...valid, team: "Team B" });
  const r = await call("PUT", `/api/pokemon/${other.id}`, { ...valid, team: "Team A" });
  assert.strictEqual(r.status, 400);
  close();
});

test("PUT inside a full team (same team) is allowed", async () => {
  const { call, close } = await start();
  let last;
  for (let i = 0; i < TEAM_LIMIT; i++) {
    last = (await call("POST", "/api/pokemon", { ...valid, nickname: "A" + i })).body;
  }
  const r = await call("PUT", `/api/pokemon/${last.id}`, { ...valid, nickname: "Renamed" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.nickname, "Renamed");
  close();
});

test("DELETE twice: 204 then 404", async () => {
  const { call, close } = await start();
  const { body: rec } = await call("POST", "/api/pokemon", valid);
  assert.strictEqual((await call("DELETE", `/api/pokemon/${rec.id}`)).status, 204);
  assert.strictEqual((await call("DELETE", `/api/pokemon/${rec.id}`)).status, 404);
  close();
});

test("non-numeric id returns 404 (not a 500)", async () => {
  const { call, close } = await start();
  assert.strictEqual((await call("GET", "/api/pokemon/abc")).status, 404);
  assert.strictEqual((await call("DELETE", "/api/pokemon/abc")).status, 404);
  close();
});

// ---- /health and error handling when the store breaks ----
const brokenStore = () => {
  const boom = async () => { throw new Error("db down"); };
  return { list: boom, get: boom, create: boom, update: boom, remove: boom };
};

test("GET /health returns 503 when the database is unreachable", async () => {
  const { call, close } = await start(brokenStore());
  const r = await call("GET", "/health");
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.body.status, "error");
  close();
});

test("a store failure on a CRUD route returns a clean 500", async () => {
  const { call, close } = await start(brokenStore());
  const orig = console.error; console.error = () => {}; // keep test output quiet
  const r = await call("GET", "/api/pokemon");
  console.error = orig;
  assert.strictEqual(r.status, 500);
  assert.deepStrictEqual(r.body, { error: "Server error" });
  close();
});

// ---- team filter + team summary endpoints ----
async function seed(call) {
  await call("POST", "/api/pokemon", { ...valid, team: "Team A", nickname: "a1" });
  await call("POST", "/api/pokemon", { ...valid, team: "Team A", nickname: "a2" });
  await call("POST", "/api/pokemon", { ...valid, team: "Team B", nickname: "b1" });
}

test("GET /api/pokemon?team= filters case-insensitively", async () => {
  const { call, close } = await start();
  await seed(call);
  const r = await call("GET", "/api/pokemon?team=team a");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.length, 2);
  assert.ok(r.body.every((p) => p.team === "Team A"));
  close();
});

test("GET /api/pokemon?team= with an unknown team returns []", async () => {
  const { call, close } = await start();
  await seed(call);
  assert.deepStrictEqual((await call("GET", "/api/pokemon?team=Nope")).body, []);
  close();
});

test("GET /api/pokemon with a blank team filter returns everything", async () => {
  const { call, close } = await start();
  await seed(call);
  assert.strictEqual((await call("GET", "/api/pokemon?team=%20")).body.length, 3);
  close();
});

test("GET /api/pokemon/teams summarises count and free slots per team", async () => {
  const { call, close } = await start();
  await seed(call);
  const r = await call("GET", "/api/pokemon/teams");
  assert.strictEqual(r.status, 200);
  const a = r.body.find((t) => t.team === "Team A");
  assert.deepStrictEqual(a, { team: "Team A", count: 2, limit: TEAM_LIMIT, slotsLeft: TEAM_LIMIT - 2, full: false });
  assert.strictEqual(r.body.length, 2);
  close();
});

test("GET /api/pokemon/teams marks a full team and is not read as an id", async () => {
  const { call, close } = await start();
  for (let i = 0; i < TEAM_LIMIT; i++) {
    await call("POST", "/api/pokemon", { ...valid, nickname: "N" + i });
  }
  const r = await call("GET", "/api/pokemon/teams");
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body[0].full, true);
  assert.strictEqual(r.body[0].slotsLeft, 0);
  close();
});

test("GET /api/pokemon/teams on an empty store returns []", async () => {
  const { call, close } = await start();
  assert.deepStrictEqual((await call("GET", "/api/pokemon/teams")).body, []);
  close();
});
