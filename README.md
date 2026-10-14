# Integrative_API-finals

Pokemon Team Tracker: a small CRUD app (Node + Express) with PokeAPI integration.

## Run it

```
npm install
npm start
```

Then open http://localhost:3000

## Files

| File | What it does |
| --- | --- |
| `server.js` | Express server: the REST API (`/api/pokemon`), the PokeAPI proxy (`/api/lookup`), and static file hosting |
| `db.js` | Flat-file "database" helper that reads/writes `pokemonteam.json` |
| `pokemonteam.json` | The saved team records (created automatically if missing) |
| `index.html` | Main page: PokeAPI search, add form, team table, and the Kalos map / encounter locator |
| `edit.html` | Page for editing one pokemon record |
| `style.css` | Shared styles for both pages (colours are set once at the top in `:root`) |
| `validate.js` | Input rules (valid types, name formats, typo suggestions) used by both the browser and `server.js` |
| `form-check.js` | Live error checking on the Add and Edit forms, as you type |
| `data.json` | Clickable hotspot shapes (positions on the map) used by the Kalos map |
| `kalos-map.png` | Map image the hotspots sit on top of |
| `package.json` | Project info, dependencies and the `npm start` script |
