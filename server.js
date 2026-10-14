// server.js - the backend for the Pokemon Team Tracker.
// It does three jobs:
//   1. Serves the website files (index.html, edit.html, style.css, images)
//   2. Provides a REST API (/api/pokemon) to create/read/update/delete team records
//   3. Provides /api/lookup, a relay to the real PokeAPI
// Start it with `npm start`, then open http://localhost:3000

const express = require("express"); // web server framework
const cors = require("cors"); // middleware that adds CORS headers to responses
const axios = require("axios"); // used only for the outbound calls to PokeAPI
const db = require("./db"); // our tiny flat-file "database" (reads/writes pokemonteam.json)
const V = require("./validate"); // shared input-checking rules (the browser uses this same file)

const app = express(); // the actual server object; routes below are attached to it
app.use(cors()); // allow requests from other origins (fine for a local school project)
app.use(express.json()); // parses incoming JSON request bodies into req.body
app.use(express.static(__dirname)); // serves index.html, edit.html, css, images, etc. as plain files

const TEAM_LIMIT = 6; // max pokemon allowed per team name

// ================= INPUT CHECKING =================
// readValidRecord(req, res) - runs the shared validation rules on the request
// body. If anything is wrong it sends a 400 response with the first problem
// (plus every problem under `fields`) and returns null, so the calling route
// can simply `return`. If everything is fine it returns the cleaned-up record
// (trimmed text, types like "Water, Flying", ability in Title Case).
function readValidRecord(req, res) {
  const body = req.body || {}; // req.body is undefined if no JSON was sent
  const errors = V.validateRecord(body);
  const firstError = Object.values(errors)[0];

  if (firstError) {
    res.status(400).json({ error: firstError, fields: errors });
    return null;
  }
  return V.cleanRecord(body);
}

// matchExistingTeamName(records, team, ignoreId) - if a team called "team 1"
// is typed but "Team 1" already exists, reuse the existing spelling so the
// same team doesn't get split into two just because of capital letters.
function matchExistingTeamName(records, team, ignoreId) {
  const existing = records.find(
    (r) => r.id !== ignoreId && r.team.toLowerCase() === team.toLowerCase()
  );
  return existing ? existing.team : team;
}

// ================= READ ALL =================
// GET /api/pokemon - returns every saved record, used by index.html on load
// and after every add/edit/delete to refresh the table.
app.get("/api/pokemon", (req, res) => {
  res.json(db.read());
});

// ================= CREATE =================
// POST /api/pokemon - adds a new record, after checking all fields are
// valid and that the target team isn't already full.
app.post("/api/pokemon", (req, res) => {
  const clean = readValidRecord(req, res);
  if (!clean) return; // a 400 error was already sent

  const records = db.read(); // load the current list from pokemonteam.json
  const team = matchExistingTeamName(records, clean.team, null);
  const { nickname, pokemon, type, ability } = clean;

  // Count how many pokemon are already in this specific team
  const teamCount = records.filter((r) => r.team === team).length;
  if (teamCount >= TEAM_LIMIT) {
    return res.status(400).json({
      error: `"${team}" already has ${TEAM_LIMIT} pokemon. Use a different team name or remove one first.`,
    });
  }

  // Date.now() as an id is fine for this app's usage pattern (one person,
  // clicking a button), since two records can't realistically be created
  // in the same millisecond by hand.
  const record = { id: Date.now(), team, nickname, pokemon, type, ability };
  records.push(record); // add to the list in memory
  db.write(records); // save the whole list back to the file
  res.status(201).json(record); // 201 = "created"; send the new record back
});

// ================= READ ONE =================
// GET /api/pokemon/:id - returns a single record by id. This is what
// edit.html calls to pre-fill its form when you click "Edit" on a row.
app.get("/api/pokemon/:id", (req, res) => {
  // req.params.id is a string from the URL; == (not ===) lets it match the numeric id
  const record = db.read().find((r) => r.id == req.params.id);
  if (!record) return res.status(404).json({ error: "Record not found" });
  res.json(record);
});

// ================= UPDATE =================
// PUT /api/pokemon/:id - edits an existing record by id.
app.put("/api/pokemon/:id", (req, res) => {
  const clean = readValidRecord(req, res);
  if (!clean) return; // a 400 error was already sent

  const records = db.read();
  const record = records.find((r) => r.id == req.params.id);

  if (!record) return res.status(404).json({ error: "Record not found" });

  const team = matchExistingTeamName(records, clean.team, record.id);
  const { nickname, pokemon, type, ability } = clean;

  // Only re-check the team cap if this edit MOVES the pokemon into a
  // different team than it was already in — otherwise editing a full
  // team's own member would incorrectly count itself and block the save.
  if (team !== record.team) {
    const teamCount = records.filter((r) => r.team === team).length;
    if (teamCount >= TEAM_LIMIT) {
      return res.status(400).json({
        error: `"${team}" already has ${TEAM_LIMIT} pokemon. Pick a different team.`,
      });
    }
  }

  // Overwrite the existing record's fields in place (its id stays the same)
  Object.assign(record, { team, nickname, pokemon, type, ability });
  db.write(records);
  res.json(record);
});

// ================= DELETE =================
// DELETE /api/pokemon/:id - removes a record by id.
app.delete("/api/pokemon/:id", (req, res) => {
  const records = db.read();
  // Keep every record EXCEPT the one being deleted
  const filtered = records.filter((r) => r.id != req.params.id);

  if (filtered.length === records.length) {
    // Nothing got filtered out, meaning no record with that id existed
    return res.status(404).json({ error: "Record not found" });
  }

  db.write(filtered);
  res.status(204).send(); // 204 = success, no content to send back
});

// ================= INTEGRATION (PokeAPI) =================

// PokeAPI's list of every pokemon name. Fetched once (the first time someone
// misspells a name) and remembered, so we can suggest "Did you mean...?".
let pokemonNames = null;
async function getPokemonNames() {
  if (pokemonNames) return pokemonNames;
  try {
    const response = await axios.get("https://pokeapi.co/api/v2/pokemon?limit=2000");
    pokemonNames = response.data.results.map((p) => p.name);
  } catch (err) {
    console.error("Could not load the pokemon name list:", err.message);
    return []; // no suggestions this time; we'll try again on the next typo
  }
  return pokemonNames;
}

// GET /api/lookup?name=... - our own proxy in front of the real PokeAPI.
// The frontend never calls pokeapi.co directly for this feature; it calls
// this route, and we relay the request server-side. Used by:
//   - the "Search PokeAPI" box (searchPokemon() in index.html)
//   - the live pokemon-name check in form-check.js (Add and Edit forms)
// On success it returns the pokemon's types and abilities (so the forms can
// warn about mismatches). On a 404 it also returns `suggestions`: the
// closest real pokemon names, for "Did you mean...?" buttons.
app.get("/api/lookup", async (req, res) => {
  // "Mr. Mime" -> "mr-mime": convert what a person types into PokeAPI's format
  const name = V.normalizePokemonName((req.query.name || "").toString());

  if (!name) {
    return res.status(400).json({ error: "Provide a name query, e.g. /api/lookup?name=pikachu" });
  }

  try {
    // Ask the real PokeAPI for this pokemon (axios throws on a 404).
    // encodeURIComponent stops odd characters from changing the URL's path.
    const response = await axios.get(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`);
    const data = response.data;

    // PokeAPI returns types as an array of objects; flatten to ["fire", "flying"] etc.
    const types = data.types.map((t) => t.type.name);
    // Every ability this pokemon can have, e.g. ["static", "lightning-rod"]
    const abilities = data.abilities.map((a) => a.ability.name);

    res.json({
      name: data.name,
      type: types.join(", "), // "fire, flying" (kept for the Search box)
      types, // ["fire", "flying"] (used by the form checks)
      height: data.height / 10, // PokeAPI gives height in decimeters; convert to meters
      ability: abilities[0] || "", // first ability, used by "Use in Add Form"
      abilities,
    });
  } catch (err) {
    // PokeAPI answered 404 = that pokemon name doesn't exist
    if (err.response && err.response.status === 404) {
      const names = await getPokemonNames();
      // Short names only tolerate 1 wrong letter, longer ones tolerate 2
      const suggestions = V.closestMatches(name, names, 3, name.length <= 4 ? 1 : 2);
      return res.status(404).json({ error: `No pokemon found named "${name}"`, suggestions });
    }
    // Anything else (network down, PokeAPI error) is logged and reported as a 500
    console.error(err.message);
    res.status(500).json({ error: "Something went wrong contacting PokeAPI" });
  }
});

// Start listening for requests on port 3000
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});