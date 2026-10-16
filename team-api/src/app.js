// app.js - the team CRUD API. The "store" (where records live) is passed in,
// so the real server uses PostgreSQL and the automated tests use memory.
const express = require("express");
const cors = require("cors");
const V = require("./validate");

const TEAM_LIMIT = 6; // max pokemon per team name

function createApp(store) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health endpoint used by Docker health checks and the Jenkins smoke test
  app.get("/health", async (req, res) => {
    try {
      await store.list(); // proves the database is reachable too
      res.status(200).json({ status: "ok", service: "team-api" });
    } catch (err) {
      res.status(503).json({ status: "error", service: "team-api" });
    }
  });

  // Validates the body; sends a 400 and returns null if invalid
  function readValidRecord(req, res) {
    const errors = V.validateRecord(req.body || {});
    const firstError = Object.values(errors)[0];
    if (firstError) {
      res.status(400).json({ error: firstError, fields: errors });
      return null;
    }
    return V.cleanRecord(req.body);
  }

  // Reuse an existing team's spelling ("team 1" -> "Team 1")
  function matchExistingTeamName(records, team, ignoreId) {
    const existing = records.find(
      (r) => r.id !== ignoreId && r.team.toLowerCase() === team.toLowerCase()
    );
    return existing ? existing.team : team;
  }

  // Wraps async routes so errors become a clean 500 instead of a crash
  const wrap = (fn) => (req, res) =>
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    });

  // READ ALL (optional filter: /api/pokemon?team=Team 1, case-insensitive)
  app.get("/api/pokemon", wrap(async (req, res) => {
    const records = await store.list();
    const team = typeof req.query.team === "string" ? req.query.team.trim() : "";
    if (!team) return res.json(records);
    res.json(records.filter((r) => r.team.toLowerCase() === team.toLowerCase()));
  }));

  // TEAM SUMMARY: one row per team with its size and free slots.
  // Must be declared BEFORE "/api/pokemon/:id", or "teams" would be read as an id.
  app.get("/api/pokemon/teams", wrap(async (req, res) => {
    const records = await store.list();
    const byTeam = new Map(); // lower-case name -> summary (keeps the first spelling seen)
    for (const r of records) {
      const key = r.team.toLowerCase();
      if (!byTeam.has(key)) byTeam.set(key, { team: r.team, count: 0 });
      byTeam.get(key).count++;
    }
    const teams = [...byTeam.values()].map((t) => ({
      ...t,
      limit: TEAM_LIMIT,
      slotsLeft: Math.max(TEAM_LIMIT - t.count, 0),
      full: t.count >= TEAM_LIMIT,
    }));
    res.json(teams);
  }));

  // CREATE
  app.post("/api/pokemon", wrap(async (req, res) => {
    const clean = readValidRecord(req, res);
    if (!clean) return;

    const records = await store.list();
    const team = matchExistingTeamName(records, clean.team, null);
    const count = records.filter((r) => r.team === team).length;
    if (count >= TEAM_LIMIT) {
      return res.status(400).json({
        error: `"${team}" already has ${TEAM_LIMIT} pokemon. Use a different team name or remove one first.`,
      });
    }
    const record = await store.create({ ...clean, team });
    res.status(201).json(record);
  }));

  // READ ONE
  app.get("/api/pokemon/:id", wrap(async (req, res) => {
    const record = await store.get(req.params.id);
    if (!record) return res.status(404).json({ error: "Record not found" });
    res.json(record);
  }));

  // UPDATE
  app.put("/api/pokemon/:id", wrap(async (req, res) => {
    const clean = readValidRecord(req, res);
    if (!clean) return;

    const records = await store.list();
    const record = records.find((r) => String(r.id) === String(req.params.id));
    if (!record) return res.status(404).json({ error: "Record not found" });

    const team = matchExistingTeamName(records, clean.team, record.id);
    if (team !== record.team) {
      const count = records.filter((r) => r.team === team).length;
      if (count >= TEAM_LIMIT) {
        return res.status(400).json({
          error: `"${team}" already has ${TEAM_LIMIT} pokemon. Pick a different team.`,
        });
      }
    }
    res.json(await store.update(record.id, { ...clean, team }));
  }));

  // DELETE
  app.delete("/api/pokemon/:id", wrap(async (req, res) => {
    const removed = await store.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: "Record not found" });
    res.status(204).send();
  }));

  // Unknown route -> JSON 404 (instead of Express's default HTML page)
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // Error handler: bad JSON body -> 400, anything else -> 500, always JSON
  app.use((err, req, res, next) => {
    if (err && err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Request body is not valid JSON" });
    }
    if (err && err.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  });

  return app;
}

module.exports = { createApp, TEAM_LIMIT };
