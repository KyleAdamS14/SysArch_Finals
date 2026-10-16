const test = require("node:test");
const assert = require("node:assert");
const V = require("../src/validate");

// ---------- validateTeam ----------
test("validateTeam: accepts normal, accented and numeric names", () => {
  assert.strictEqual(V.validateTeam("Team 1"), "");
  assert.strictEqual(V.validateTeam("Équipe 1"), "");
  assert.strictEqual(V.validateTeam("0"), "");
});
test("validateTeam: rejects empty / whitespace-only", () => {
  assert.match(V.validateTeam("   "), /required/i);
});
test("validateTeam: 20 chars is OK, 21 is not", () => {
  assert.strictEqual(V.validateTeam("a".repeat(20)), "");
  assert.match(V.validateTeam("a".repeat(21)), /20 characters/);
});
test("validateTeam: rejects HTML-looking characters", () => {
  assert.match(V.validateTeam("<script>"), /can only use/);
});

// ---------- validateNickname ----------
test("validateNickname: allows . ! ? - _ ' and digits", () => {
  assert.strictEqual(V.validateNickname("G00N!"), "");
  assert.strictEqual(V.validateNickname("The GOAT"), "");
});
test("validateNickname: rejects @ and over-length", () => {
  assert.match(V.validateNickname("a@b"), /can only use/);
  assert.match(V.validateNickname("n".repeat(21)), /20 characters/);
});

// ---------- validatePokemonName ----------
test("validatePokemonName: accepts dots, apostrophes, gender symbols", () => {
  assert.strictEqual(V.validatePokemonName("Mr. Mime"), "");
  assert.strictEqual(V.validatePokemonName("Farfetch'd"), "");
  assert.strictEqual(V.validatePokemonName("Nidoran♀"), "");
});
test("validatePokemonName: rejects 1 char, digits-only and 31+ chars", () => {
  assert.match(V.validatePokemonName("a"), /too short/);
  assert.match(V.validatePokemonName("123"), /can only use/); // needs at least one letter
  assert.match(V.validatePokemonName("p".repeat(31)), /30 characters/);
});

// ---------- validateTypes ----------
test("validateTypes: accepts 1 or 2 types, any case, comma or slash", () => {
  assert.strictEqual(V.validateTypes("fire"), "");
  assert.strictEqual(V.validateTypes("Water, Flying"), "");
  assert.strictEqual(V.validateTypes("psychic / FAIRY"), "");
});
test("validateTypes: rejects 3 types", () => {
  assert.match(V.validateTypes("fire, water, grass"), /at most 2/);
});
test("validateTypes: rejects duplicate types", () => {
  assert.match(V.validateTypes("fire, FIRE"), /listed twice/);
});
test("validateTypes: typo gets a 'Did you mean' hint", () => {
  assert.match(V.validateTypes("fiary"), /Did you mean Fairy/);
});
test("validateTypes: nonsense lists all valid types", () => {
  assert.match(V.validateTypes("zzzzzz"), /Valid types:/);
});
test("validateTypes: only separators counts as empty", () => {
  assert.match(V.validateTypes(" , "), /required/);
});

// ---------- validateAbility ----------
test("validateAbility: accepts multi-word, rejects 1 char and symbols", () => {
  assert.strictEqual(V.validateAbility("Sand Force"), "");
  assert.match(V.validateAbility("x"), /too short/);
  assert.match(V.validateAbility("a$"), /can only use/);
  assert.match(V.validateAbility("a".repeat(31)), /30 characters/);
});

// ---------- validateRecord ----------
test("validateRecord: valid record gives no errors", () => {
  const rec = { team: "T", nickname: "n", pokemon: "Pikachu", type: "Electric", ability: "Static" };
  assert.deepStrictEqual(V.validateRecord(rec), {});
});
test("validateRecord: empty object reports every field", () => {
  assert.deepStrictEqual(Object.keys(V.validateRecord({})).sort(),
    ["ability", "nickname", "pokemon", "team", "type"]);
});
test("validateRecord: non-string values (numbers, arrays, null) count as empty", () => {
  const errs = V.validateRecord({ team: 1, nickname: null, pokemon: ["x"], type: {}, ability: true });
  assert.strictEqual(Object.keys(errs).length, 5);
});
test("validateRecord: undefined input does not throw", () => {
  assert.strictEqual(Object.keys(V.validateRecord(undefined)).length, 5);
});

// ---------- cleanRecord ----------
test("cleanRecord: trims, capitalises types, title-cases ability", () => {
  const out = V.cleanRecord({
    team: " T ", nickname: " n ", pokemon: " Gengar ", type: "ghost / poison", ability: "shadow-tag",
  });
  assert.deepStrictEqual(out, {
    team: "T", nickname: "n", pokemon: "Gengar", type: "Ghost, Poison", ability: "Shadow Tag",
  });
});

// ---------- helpers ----------
test("normalizePokemonName: dots, apostrophes and gender symbols", () => {
  assert.strictEqual(V.normalizePokemonName("Mr. Mime"), "mr-mime");
  assert.strictEqual(V.normalizePokemonName("Farfetch’d"), "farfetchd");
  assert.strictEqual(V.normalizePokemonName("Nidoran♀"), "nidoran-f");
});
test("escapeHtml: neutralises tags and quotes", () => {
  assert.strictEqual(V.escapeHtml("<b>\"&'"), "&lt;b&gt;&quot;&amp;&#39;");
});
test("editDistance: empty strings and plain substitution", () => {
  assert.strictEqual(V.editDistance("", ""), 0);
  assert.strictEqual(V.editDistance("abc", ""), 3);
  assert.strictEqual(V.editDistance("cat", "cut"), 1);
});
test("closestMatches: prefix match, empty input, limit", () => {
  assert.deepStrictEqual(V.closestMatches("pika", ["pikachu", "pichu"]), ["pikachu"]);
  assert.deepStrictEqual(V.closestMatches("", ["a"]), []);
  assert.strictEqual(V.closestMatches("pi", ["pia", "pib", "pic", "pid"], 2).length, 2);
});
