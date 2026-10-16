// server.js - starts the team API on port 3000 using the PostgreSQL store.
const { createApp } = require("./app");
const { createPgStore } = require("./db");

const app = createApp(createPgStore());
app.listen(3000, () => console.log("team-api listening on port 3000"));
