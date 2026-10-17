-- Runs automatically the FIRST time the database volume is created.
CREATE TABLE IF NOT EXISTS pokemon (
  id       SERIAL PRIMARY KEY,
  team     VARCHAR(20) NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  pokemon  VARCHAR(30) NOT NULL,
  type     VARCHAR(40) NOT NULL,
  ability  VARCHAR(30) NOT NULL,
  -- Data-integrity rules enforced by the database itself (second line of defence
  -- behind the API validation): no blank values, even if someone bypasses the API.
  CONSTRAINT pokemon_team_not_blank     CHECK (length(trim(team))     > 0),
  CONSTRAINT pokemon_nickname_not_blank CHECK (length(trim(nickname)) > 0),
  CONSTRAINT pokemon_name_not_blank     CHECK (length(trim(pokemon))  > 0)
);

-- Speeds up the team filter / team summary queries (case-insensitive team lookup)
CREATE INDEX IF NOT EXISTS idx_pokemon_team ON pokemon (lower(team));

-- Seed data: the records from the original pokemonteam.json
INSERT INTO pokemon (team, nickname, pokemon, type, ability) VALUES
  ('Team 1', 'deez', 'Gengar', 'Ghost', 'Shadow Tag'),
  ('Team 1', 'bait', 'Gardevoir', 'Psychic, Fairy', 'Trace'),
  ('Team 1', 'fih', 'Gyarados', 'Water, Flying', 'Intimidate'),
  ('Team 1', 'G00N', 'Obstagoon', 'Dark, Normal', 'Reckless'),
  ('Team 1', 'Snek', 'Steelix', 'Steel, Ground', 'Sand Force'),
  ('Team 1', 'The GOAT', 'Haxorus', 'Dragon', 'Unnerve'),
  ('Team 2', 'Bullet', 'Metagross', 'Steel, Psychic', 'Clear Body'),
  ('Team 2', 'Furry', 'Lucario', 'Fighting, Steel', 'Steadfast'),
  ('Team 2', 'Vynes', 'Sceptile', 'Grass', 'Overgrown'),
  ('Team 3', 'CrimSON', 'Charizard', 'Fire, Flying', 'Blaze'),
  ('Team 3', 'bnnuy', 'Lopunny-Mega', 'Normal, Fighting', 'Scrappy'),
  ('Team 3', 'ME', 'Lechonk', 'Normal', 'Gluttony'),
  ('Team 3', 'NOT ME', 'Aegislash-Shield', 'Steel, Ghost', 'Stance Change'),
  ('0', 'NAT', 'Charizard-Mega-X', 'Fire, Dragon', 'Tough Claws');
