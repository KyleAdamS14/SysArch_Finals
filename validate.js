// validate.js - the input-checking rules for a pokemon record, in ONE place.
//
// This file is used by BOTH sides of the app:
//   - the browser (index.html and edit.html load it with a <script> tag, and
//     it shows up there as window.PokemonValidate)
//   - the server (server.js does require("./validate"))
// Sharing one file means the browser and the server can never disagree about
// what counts as a valid record. The browser check gives instant feedback; the
// server check is the safety net in case someone skips the website entirely.
//
// Every validateXxx() function returns "" when the value is fine, or a
// human-readable error message when it is not.

(function (root) {
  // The 18 real pokemon types, in the capitalization we store them in
  const POKEMON_TYPES = [
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground",
    "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
  ];

  // ================= SMALL TEXT HELPERS =================

  // escapeHtml(str) - makes text safe to paste into innerHTML, so a nickname
  // like <b>hi</b> shows up as text instead of being treated as real HTML.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // titleCase("shadow-tag") -> "Shadow Tag" (dashes become spaces, each word capitalized)
  function titleCase(str) {
    return String(str)
      .trim()
      .replace(/[-\s]+/g, " ")
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ");
  }

  // normalizePokemonName("Mr. Mime") -> "mr-mime"
  // PokeAPI (and the sprite site) want lowercase names with dashes instead of
  // spaces and no dots/apostrophes, so we convert what a person types into that form.
  function normalizePokemonName(raw) {
    return String(raw)
      .trim()
      .toLowerCase()
      .replace(/♀/g, "-f")
      .replace(/♂/g, "-m")
      .replace(/[.'’:]/g, "")
      .replace(/\s+/g, "-");
  }

  // ================= TYPO HELPERS ("did you mean...?") =================

  // editDistance("fiary", "fairy") -> 1
  // Counts how many single-letter edits (insert / delete / change / swap two
  // neighbouring letters) turn one word into the other. A small number means
  // "probably a typo of that word".
  function editDistance(a, b) {
    let prev2 = null; // the row from two steps ago (needed to detect swapped letters)
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          cur[j] = Math.min(cur[j], prev2[j - 2] + 1); // two letters swapped = 1 edit
        }
      }
      prev2 = prev;
      prev = cur;
    }
    return prev[b.length];
  }

  // closestMatches(input, candidates) - returns up to `limit` words from
  // `candidates` that look like a typo of (or start with) `input`, best first.
  function closestMatches(input, candidates, limit = 3, maxDistance = 2) {
    const q = String(input).toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const c of candidates) {
      const lc = c.toLowerCase();
      let d;
      if (q.length >= 3 && lc.startsWith(q)) {
        d = 1; // typed only the beginning of a name, e.g. "pika" -> "pikachu"
      } else if (Math.abs(lc.length - q.length) > maxDistance) {
        continue; // lengths too different to be a small typo, skip the maths
      } else {
        d = editDistance(q, lc);
      }
      if (d <= maxDistance) scored.push({ c, d });
    }
    scored.sort((x, y) => x.d - y.d);
    return scored.slice(0, limit).map((x) => x.c);
  }

  function closestMatch(input, candidates, maxDistance = 2) {
    return closestMatches(input, candidates, 1, maxDistance)[0] || null;
  }

  // ================= TYPES =================

  // parseTypes("Psychic, fairy") -> ["Psychic", "fairy"]  (commas or slashes separate types)
  function parseTypes(raw) {
    return String(raw)
      .split(/[,/]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // normalizeTypes("psychic / FAIRY") -> "Psychic, Fairy"  (the form we store)
  function normalizeTypes(raw) {
    return parseTypes(raw)
      .map((t) => POKEMON_TYPES.find((x) => x.toLowerCase() === t.toLowerCase()) || t)
      .join(", ");
  }

  // ================= FIELD VALIDATORS =================

  function validateTeam(raw) {
    const v = String(raw).trim();
    if (!v) return "Team name is required.";
    if (v.length > 20) return "Team name must be 20 characters or fewer.";
    if (!/^[\p{L}\p{N} _'-]+$/u.test(v)) {
      return "Team name can only use letters, numbers, spaces, - _ and '.";
    }
    return "";
  }

  function validateNickname(raw) {
    const v = String(raw).trim();
    if (!v) return "Nickname is required.";
    if (v.length > 20) return "Nickname must be 20 characters or fewer.";
    if (!/^[\p{L}\p{N} _.!?'-]+$/u.test(v)) {
      return "Nickname can only use letters, numbers, spaces and . ! ? - _ '";
    }
    return "";
  }

  // Only checks the SHAPE of the name. Whether it is a real pokemon is checked
  // separately against PokeAPI (see /api/lookup in server.js).
  function validatePokemonName(raw) {
    const v = String(raw).trim();
    if (!v) return "Pokemon name is required.";
    if (v.length < 2) return "That name is too short.";
    if (v.length > 30) return "Pokemon name must be 30 characters or fewer.";
    if (!/^[\p{L}\p{N} .'’:♀♂-]+$/u.test(v) || !/\p{L}/u.test(v)) {
      return "Pokemon name can only use letters, numbers, spaces and . ' : -";
    }
    return "";
  }

  function validateTypes(raw) {
    const list = parseTypes(raw);
    if (!list.length) return "Type is required.";
    if (list.length > 2) return "A pokemon has at most 2 types (e.g. Water, Flying).";

    const seen = [];
    for (const t of list) {
      const match = POKEMON_TYPES.find((x) => x.toLowerCase() === t.toLowerCase());
      if (!match) {
        const guess = closestMatch(t, POKEMON_TYPES);
        return guess
          ? `"${t}" isn't a valid type. Did you mean ${guess}?`
          : `"${t}" isn't a valid type. Valid types: ${POKEMON_TYPES.join(", ")}.`;
      }
      if (seen.includes(match)) return `The type "${match}" is listed twice.`;
      seen.push(match);
    }
    return "";
  }

  function validateAbility(raw) {
    const v = String(raw).trim();
    if (!v) return "Ability is required.";
    if (v.length < 2) return "That ability name is too short.";
    if (v.length > 30) return "Ability must be 30 characters or fewer.";
    if (!/^[\p{L}\p{N} '-]+$/u.test(v)) {
      return "Ability can only use letters, numbers, spaces, - and '.";
    }
    return "";
  }

  // ================= WHOLE-RECORD HELPERS (used by server.js) =================

  // validateRecord(rec) -> { fieldName: "error message", ... }  ({} means all good)
  function validateRecord(rec) {
    const r = rec || {};
    const s = (v) => (typeof v === "string" ? v : ""); // anything that isn't text counts as empty
    const checks = {
      team: validateTeam(s(r.team)),
      nickname: validateNickname(s(r.nickname)),
      pokemon: validatePokemonName(s(r.pokemon)),
      type: validateTypes(s(r.type)),
      ability: validateAbility(s(r.ability)),
    };
    const errors = {};
    for (const key in checks) if (checks[key]) errors[key] = checks[key];
    return errors;
  }

  // cleanRecord(rec) - the tidy version that actually gets saved: extra spaces
  // trimmed, types capitalized + comma-separated, ability in Title Case.
  function cleanRecord(rec) {
    return {
      team: rec.team.trim(),
      nickname: rec.nickname.trim(),
      pokemon: rec.pokemon.trim(),
      type: normalizeTypes(rec.type),
      ability: titleCase(rec.ability),
    };
  }

  const api = {
    POKEMON_TYPES, escapeHtml, titleCase, normalizePokemonName, editDistance,
    closestMatches, closestMatch, parseTypes, normalizeTypes,
    validateTeam, validateNickname, validatePokemonName, validateTypes, validateAbility,
    validateRecord, cleanRecord,
  };

  // In Node (server.js) export it; in a browser hang it on window.
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokemonValidate = api;
})(typeof window !== "undefined" ? window : this);
