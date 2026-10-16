const axios = require("axios");
const { createApp } = require("./app");

const app = createApp(axios);
app.listen(4000, () => console.log("lookup-service listening on port 4000"));
