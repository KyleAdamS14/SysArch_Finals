// A fake in-memory store so tests don't need a real database.
module.exports = function createMemoryStore(initial = []) {
  let rows = initial.map((r) => ({ ...r }));
  let nextId = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  return {
    async list() { return rows.map((r) => ({ ...r })); },
    async get(id) { const r = rows.find((x) => String(x.id) === String(id)); return r ? { ...r } : null; },
    async create(r) { const rec = { id: nextId++, ...r }; rows.push(rec); return { ...rec }; },
    async update(id, r) {
      const i = rows.findIndex((x) => String(x.id) === String(id));
      if (i < 0) return null;
      rows[i] = { id: rows[i].id, ...r };
      return { ...rows[i] };
    },
    async remove(id) {
      const before = rows.length;
      rows = rows.filter((x) => String(x.id) !== String(id));
      return rows.length < before;
    },
  };
};
