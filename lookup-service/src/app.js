// app.js - the PokeAPI lookup service. The HTTP client is passed in so tests
// can use a fake instead of calling the real internet.
const express = require("express");
const cors = require("cors");
const V = require("./validate");

function createApp(http) {
  const app = express();
  app.use(cors());

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "lookup-service" });
  });

  // List of every pokemon name, fetched once, used for "Did you mean...?"
  let pokemonNames = null;
  async function getPokemonNames() {
    if (pokemonNames) return pokemonNames;
    try {
      const response = await http.get("https://pokeapi.co/api/v2/pokemon?limit=2000");
      pokemonNames = response.data.results.map((p) => p.name);
    } catch (err) {
      console.error("Could not load the pokemon name list:", err.message);
      return [];
    }
    return pokemonNames;
  }

  // GET /api/lookup?name=pikachu
  app.get("/api/lookup", async (req, res) => {
    const name = V.normalizePokemonName((req.query.name || "").toString());
    if (!name) {
      return res.status(400).json({ error: "Provide a name query, e.g. /api/lookup?name=pikachu" });
    }
    try {
      const response = await http.get(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(name)}`);
      const data = response.data;
      const types = data.types.map((t) => t.type.name);
      const abilities = data.abilities.map((a) => a.ability.name);
      res.json({
        name: data.name,
        type: types.join(", "),
        types,
        height: data.height / 10,
        ability: abilities[0] || "",
        abilities,
      });
    } catch (err) {
      if (err.response && err.response.status === 404) {
        const names = await getPokemonNames();
        const suggestions = V.closestMatches(name, names, 3, name.length <= 4 ? 1 : 2);
        return res.status(404).json({ error: `No pokemon found named "${name}"`, suggestions });
      }
      console.error(err.message);
      res.status(500).json({ error: "Something went wrong contacting PokeAPI" });
    }
  });

  return app;
}

module.exports = { createApp };
