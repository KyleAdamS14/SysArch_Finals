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

  // READ ALL
  app.get("/api/pokemon", wrap(async (req, res) => {
    res.json(await store.list());
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

  return app;
}

module.exports = { createApp, TEAM_LIMIT };
