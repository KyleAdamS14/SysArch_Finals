// db.js - a tiny flat-file "database". Instead of a real database, every
// pokemon record is stored as a JSON array inside pokemonteam.json.
// server.js require()s this file and uses db.read() / db.write().

const fs = require("fs"); // Node's built-in file system module

// The file that holds all the saved records (relative to where the server is started)
const FILE = "pokemonteam.json";

// First run: if the file doesn't exist yet, create it containing an empty
// list ("[]") so that reading it later doesn't crash.
if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "[]");

// db.read() - loads the file and turns the JSON text into a JavaScript array
// of record objects. It re-reads the file on every call, so it is always current.
exports.read = () => JSON.parse(fs.readFileSync(FILE));

// db.write(records) - saves the given array back to the file, replacing what
// was there. The (records, null, 2) part pretty-prints the JSON with 2-space
// indentation so the file stays readable if you open it.
exports.write = (records) => fs.writeFileSync(FILE, JSON.stringify(records, null, 2));