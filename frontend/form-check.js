// form-check.js - live "error check while typing" for the pokemon form.
// Used by BOTH index.html (Add form) and edit.html (Edit form), so the two
// forms behave identically. Needs validate.js to be loaded first.
//
// What it does for each field:
//   - shows a red message under the field when the value is wrong
//     (e.g. a misspelled type, with a "Did you mean...?" button)
//   - checks the pokemon name against the real PokeAPI (via /api/lookup) and
//     offers spelling suggestions when it isn't found
//   - shows a yellow WARNING (which does not block saving) if the type or
//     ability doesn't match what that pokemon normally has
//   - shows a green border/message when the field looks good
//
// Usage:  const form = setupFormValidation({ team: 'team', nickname: 'nickname', ... });
//         const result = await form.validateAll();   // { ok, values }

function setupFormValidation(ids) {
  const V = window.PokemonValidate;
  const KEYS = ['team', 'nickname', 'pokemon', 'type', 'ability'];

  const els = {};      // the <input> for each field
  const msgs = {};     // the message <div> created under each input
  const touched = {};  // has the person interacted with this field yet? (errors only show after they have)

  KEYS.forEach((key) => {
    els[key] = document.getElementById(ids[key]);
    touched[key] = false;
    const box = document.createElement('div');
    box.className = 'field-msg';
    box.setAttribute('aria-live', 'polite'); // screen readers announce changes
    els[key].insertAdjacentElement('afterend', box);
    msgs[key] = box;
  });

  let pokemonInfo = null;      // PokeAPI data for the pokemon currently typed, once verified
  const lookupCache = new Map(); // normalized name -> lookup result, so we never ask twice
  let lookupSeq = 0;           // used to ignore out-of-date answers if the person keeps typing
  let debounceTimer = null;    // waits until typing pauses before calling the server

  // ---------- small display helpers ----------

  // "gengar" -> "Gengar", "porygon-z" -> "Porygon-Z"
  const prettyPokemon = (name) => name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

  // show(key, kind, content) - sets the message and border colour of one field.
  //   kind: 'error' | 'warn' | 'ok' | 'info' | '' (nothing)
  //   content: plain text, or a DOM node (used when the message has buttons in it)
  function show(key, kind, content) {
    const box = msgs[key];
    const input = els[key];
    box.className = 'field-msg' + (kind ? ' ' + kind : '');
    box.replaceChildren();
    if (content) box.append(content);

    input.classList.remove('input-error', 'input-warn', 'input-ok');
    if (kind === 'error') input.classList.add('input-error');
    if (kind === 'warn') input.classList.add('input-warn');
    if (kind === 'ok') input.classList.add('input-ok');
    input.setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
  }

  // message(text, suggestions, onPick) - builds "text  Did you mean [A] [B]?"
  // where each suggestion is a small button that calls onPick(suggestion).
  function message(text, suggestions, onPick, label = (s) => s) {
    const span = document.createElement('span');
    span.append(text);
    if (suggestions && suggestions.length) {
      span.append(' Did you mean ');
      suggestions.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'suggest-btn';
        b.textContent = label(s);
        // Without this, pressing the button makes the text box lose focus first, which
        // redraws this message and swallows the click. preventDefault keeps the focus put.
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => onPick(s));
        span.append(b);
      });
      span.append('?');
    }
    return span;
  }

  // ---------- pokemon name: checked against PokeAPI ----------

  // verifyPokemon() - asks our server (which asks PokeAPI) whether the typed
  // name is a real pokemon. Returns true when it's fine to continue.
  async function verifyPokemon() {
    clearTimeout(debounceTimer);
    const key = V.normalizePokemonName(els.pokemon.value);
    const seq = ++lookupSeq;
    show('pokemon', 'info', 'Checking with PokeAPI...');

    let result;
    if (lookupCache.has(key)) {
      result = lookupCache.get(key);
    } else {
      try {
        const res = await fetch('/api/lookup?name=' + encodeURIComponent(key));
        const body = await res.json().catch(() => ({}));
        result = { ok: res.ok, status: res.status, body };
        if (res.ok || res.status === 404) lookupCache.set(key, result); // don't cache server hiccups
      } catch {
        result = { ok: false, status: 0, body: {} }; // server unreachable
      }
    }

    if (seq !== lookupSeq) return false; // the person typed something newer; drop this answer

    if (result.ok) {
      pokemonInfo = result.body;
      const types = result.body.types.map(cap).join(' / ');
      show('pokemon', 'ok', `Found: ${prettyPokemon(result.body.name)} (${types})`);
      refreshDependents();
      return true;
    }

    pokemonInfo = null;
    if (result.status === 404) {
      show('pokemon', 'error', message(
        `"${els.pokemon.value.trim()}" isn't a real pokemon.`,
        result.body.suggestions,
        (s) => { els.pokemon.value = prettyPokemon(s); touched.pokemon = true; verifyPokemon(); },
        prettyPokemon
      ));
      refreshDependents();
      return false;
    }

    // Couldn't verify (PokeAPI down / no internet). Warn, but don't block saving.
    show('pokemon', 'warn', "Couldn't reach PokeAPI to verify this name right now.");
    refreshDependents();
    return true;
  }

  // ---------- type / ability / team / nickname ----------

  const rules = {
    team: () => V.validateTeam(els.team.value),
    nickname: () => V.validateNickname(els.nickname.value),
    type: () => V.validateTypes(els.type.value),
    ability: () => V.validateAbility(els.ability.value),
  };

  // softWarning(key) - for type and ability only. If we know the real pokemon
  // and what was typed doesn't match it, return a warning (or null if fine).
  function softWarning(key) {
    if (!pokemonInfo) return null;
    const who = prettyPokemon(pokemonInfo.name);

    if (key === 'type') {
      const actual = pokemonInfo.types;
      const typed = V.parseTypes(els.type.value).map((t) => t.toLowerCase());
      if (typed.some((t) => !actual.includes(t))) {
        return `${who} is normally ${actual.map(cap).join(' / ')} type. Double-check this.`;
      }
    }

    if (key === 'ability') {
      const typed = V.titleCase(els.ability.value).toLowerCase().replace(/ /g, '-');
      const known = pokemonInfo.abilities;
      if (known.length && !known.includes(typed)) {
        const guess = V.closestMatch(typed, known);
        const list = known.map(V.titleCase).join(', ');
        return message(
          `${who} usually has: ${list}.`,
          guess ? [guess] : [],
          (s) => { els.ability.value = V.titleCase(s); checkSimple('ability'); },
          V.titleCase
        );
      }
    }
    return null;
  }

  // checkSimple(key) - validates one non-pokemon field and updates its message.
  function checkSimple(key) {
    const err = rules[key]();
    if (err) {
      // Don't nag about a field the person hasn't touched yet
      if (touched[key]) show(key, 'error', err); else show(key, '', '');
      return false;
    }
    const warning = softWarning(key);
    if (warning) show(key, 'warn', warning); else show(key, 'ok', '');
    return true;
  }

  // Type and ability warnings depend on which pokemon was typed, so re-run them
  // whenever the pokemon changes.
  function refreshDependents() {
    ['type', 'ability'].forEach((k) => { if (els[k].value.trim()) checkSimple(k); });
  }

  // checkPokemonFormat() - quick offline check of the name's shape; the real
  // PokeAPI check happens in verifyPokemon().
  function checkPokemonFormat() {
    const err = V.validatePokemonName(els.pokemon.value);
    if (err) {
      pokemonInfo = null;
      if (touched.pokemon) show('pokemon', 'error', err); else show('pokemon', '', '');
      refreshDependents();
    }
    return !err;
  }

  // ---------- events ----------

  KEYS.forEach((key) => {
    // While typing
    els[key].addEventListener('input', () => {
      touched[key] = true;
      if (!els[key].value.trim()) { show(key, '', ''); if (key === 'pokemon') { pokemonInfo = null; refreshDependents(); } return; }
      if (key === 'pokemon') {
        lookupSeq++; // invalidate any lookup still in flight
        pokemonInfo = null;
        clearTimeout(debounceTimer);
        if (checkPokemonFormat()) {
          show('pokemon', '', '');
          debounceTimer = setTimeout(verifyPokemon, 500); // wait for a pause in typing
        }
      } else {
        checkSimple(key);
      }
    });

    // When leaving the field: empty fields now count as an error too
    els[key].addEventListener('blur', () => {
      touched[key] = true;
      if (key === 'pokemon') { if (checkPokemonFormat()) verifyPokemon(); }
      else checkSimple(key);
    });
  });

  // ---------- public functions ----------

  // validateAll() - full check, used when the person presses Add / Save.
  // Returns { ok: false } (and focuses the first bad field) or
  // { ok: true, values } where values are the cleaned-up strings to send to the server.
  async function validateAll() {
    KEYS.forEach((k) => { touched[k] = true; });

    let pokemonOk;
    if (V.validatePokemonName(els.pokemon.value)) { checkPokemonFormat(); pokemonOk = false; }
    else pokemonOk = await verifyPokemon();

    const ok = {
      team: checkSimple('team'),
      nickname: checkSimple('nickname'),
      pokemon: pokemonOk,
      type: checkSimple('type'),
      ability: checkSimple('ability'),
    };

    const firstBad = KEYS.find((k) => !ok[k]);
    if (firstBad) { els[firstBad].focus(); return { ok: false }; }

    // Tidy the values the same way the server will
    const clean = V.cleanRecord({
      team: els.team.value, nickname: els.nickname.value,
      pokemon: pokemonInfo ? prettyPokemon(pokemonInfo.name) : els.pokemon.value,
      type: els.type.value, ability: els.ability.value,
    });
    return { ok: true, values: clean };
  }

  // checkAll() - check whatever is already in the fields (used after they are
  // filled in by code, e.g. loading the edit page or "Use in Add Form").
  function checkAll() {
    KEYS.forEach((k) => { if (els[k].value.trim()) touched[k] = true; });
    ['team', 'nickname', 'type', 'ability'].forEach(checkSimple);
    if (els.pokemon.value.trim() && checkPokemonFormat()) verifyPokemon();
  }

  // reset() - clear all messages and colours (after a successful save)
  function reset() {
    lookupSeq++;
    clearTimeout(debounceTimer);
    pokemonInfo = null;
    KEYS.forEach((k) => { touched[k] = false; show(k, '', ''); });
  }

  return { validateAll, checkAll, reset };
}
