// db.js - PostgreSQL store. Connection settings come from environment variables
// (set in docker-compose.yml from the .env file).
const { Pool } = require("pg");

function createPgStore(pool) {
  pool = pool || new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "pokemonteam",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  const cols = "id, team, nickname, pokemon, type, ability";

  return {
    async list() {
      const { rows } = await pool.query(`SELECT ${cols} FROM pokemon ORDER BY id`);
      return rows;
    },
    async get(id) {
      if (!/^\d+$/.test(String(id))) return null; // non-numeric id can't exist
      const { rows } = await pool.query(`SELECT ${cols} FROM pokemon WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    async create(r) {
      const { rows } = await pool.query(
        `INSERT INTO pokemon (team, nickname, pokemon, type, ability)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${cols}`,
        [r.team, r.nickname, r.pokemon, r.type, r.ability]
      );
      return rows[0];
    },
    async update(id, r) {
      const { rows } = await pool.query(
        `UPDATE pokemon SET team=$2, nickname=$3, pokemon=$4, type=$5, ability=$6
         WHERE id = $1 RETURNING ${cols}`,
        [id, r.team, r.nickname, r.pokemon, r.type, r.ability]
      );
      return rows[0] || null;
    },
    async remove(id) {
      if (!/^\d+$/.test(String(id))) return false;
      const { rowCount } = await pool.query("DELETE FROM pokemon WHERE id = $1", [id]);
      return rowCount > 0;
    },
  };
}

module.exports = { createPgStore };
