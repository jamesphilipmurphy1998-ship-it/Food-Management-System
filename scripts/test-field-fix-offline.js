// End-to-end OFFLINE test of scripts/field-fix-apply.js against a pretend server (nothing live is touched):
//   node scripts/test-field-fix-offline.js
// Checks: a dry run changes nothing; --apply changes ONLY the planned fields of ONLY the planned ingredient (including the allergen ticks
// LIST); every other ingredient and every older version stays byte-identical; the "why" note is appended without overwriting; the spec file
// name is carried forward onto the new version; a stale plan (live value differs from "old") is REFUSED and writes nothing.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "field-fix-apply.js");
const mk = (id, code, allergens) => ({ id, code, name: "Item " + code, kj: 100, kcal: 24, allergens, allergenNotes: null, supplier: "S", cost: 1, updatedAt: "t0" });
const store = { ingredients: [mk("a", "100001", ["Cereals containing gluten"]), mk("b", "100002", ["Soya"]), mk("c", "100003", [])], versions: {} };
store.versions.a = [{ versionNumber: 1, comment: "Spec upload: 100001 Thing - RM Spec V1.xlsx" }, { versionNumber: 2, comment: "Pack size corrected" }];
store.versions.b = [{ versionNumber: 1, comment: "Spec upload: 100002 Other.xlsx" }];
store.versions.c = [{ versionNumber: 1, comment: null }];
const snapshot = JSON.stringify(store);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const m = req.url.match(/^\/api\/ingredients\/([^/]+)(\/.*)?$/);
    if (req.method === "GET" && req.url.startsWith("/api/ingredients?")) return send(200, store.ingredients);
    if (req.method === "PUT" && m && !m[2]) {
      const i = store.ingredients.findIndex((x) => x.id === m[1]);
      const next = JSON.parse(body);
      const changed = JSON.stringify(Object.assign({}, store.ingredients[i], { updatedAt: 0 })) !== JSON.stringify(Object.assign({}, next, { updatedAt: 0 }));
      store.ingredients[i] = Object.assign({}, next, { updatedAt: "t" + Date.now() });
      if (changed) store.versions[m[1]].push({ versionNumber: store.versions[m[1]].length + 1, comment: null });
      return send(200, store.ingredients[i]);
    }
    if (req.method === "GET" && m && m[2] === "/versions") return send(200, store.versions[m[1]]);
    if (req.method === "POST" && m && m[2] === "/latest-version-comment") {
      const v = store.versions[m[1]];
      v[v.length - 1].comment = JSON.parse(body).comment;
      return send(200, { comment: v[v.length - 1].comment });
    }
    send(404, {});
  });
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fftest-"));
  const jar = path.join(dir, "jar.txt");
  fs.writeFileSync(jar, "");
  const plan = path.join(dir, "plan.json");
  // The pretend server lives in THIS process, so the script must run without blocking it (spawn, not execFileSync).
  const run = (args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, plan].concat(args), { cwd: dir, env: Object.assign({}, process.env, { NUTRICOST_API_BASE: "http://127.0.0.1:" + port, COOKIE_JAR: jar }) });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ out, code }));
  });
  const NOTE = "Barley: Malt vinegar made from barley (supplier spec); gluten not ticked.";
  fs.writeFileSync(plan, JSON.stringify([{ code: "100001", changes: { allergens: { old: ["Cereals containing gluten"], new: [] }, allergenNotes: { old: null, new: NOTE } }, comment: "Allergen decision 2026-10-12 (test)" }]));

  // 1. dry run changes nothing
  let r = await run([]);
  assert.strictEqual(JSON.stringify(store), snapshot, "a dry run changed something");
  console.log("PASS dry run changed nothing");

  // 2. stale plan is refused and writes nothing
  fs.writeFileSync(plan, JSON.stringify([{ code: "100001", changes: { allergens: { old: ["Soya"], new: [] } }, comment: "x" }]));
  r = await run(["--apply"]);
  assert(/REFUSED/.test(r.out) && r.code !== 0, "stale plan was not refused: " + r.out);
  assert.strictEqual(JSON.stringify(store), snapshot, "a refused plan changed something");
  console.log("PASS a plan whose 'old' list differs from live is REFUSED and writes nothing");

  // 3. real apply
  fs.writeFileSync(plan, JSON.stringify([{ code: "100001", changes: { allergens: { old: ["Cereals containing gluten"], new: [] }, allergenNotes: { old: null, new: NOTE } }, comment: "Allergen decision 2026-10-12 (test)" }]));
  r = await run(["--apply"]);
  assert.strictEqual(r.code, 0, "apply failed: " + r.out);
  const before = JSON.parse(snapshot);
  const a = store.ingredients.find((x) => x.id === "a");
  assert.deepStrictEqual(a.allergens, [], "ticks list not changed");
  assert.strictEqual(a.allergenNotes, NOTE, "note not written");
  const strip = (o) => { const c = Object.assign({}, o); delete c.updatedAt; delete c.allergens; delete c.allergenNotes; return JSON.stringify(c); };
  assert.strictEqual(strip(a), strip(before.ingredients[0]), "another field of the target changed");
  assert.strictEqual(JSON.stringify(store.ingredients[1]), JSON.stringify(before.ingredients[1]), "another ingredient (b) changed");
  assert.strictEqual(JSON.stringify(store.ingredients[2]), JSON.stringify(before.ingredients[2]), "another ingredient (c) changed");
  assert.strictEqual(JSON.stringify(store.versions.b), JSON.stringify(before.versions.b), "versions of b changed");
  assert.strictEqual(JSON.stringify(store.versions.c), JSON.stringify(before.versions.c), "versions of c changed");
  assert.strictEqual(JSON.stringify(store.versions.a.slice(0, 2)), JSON.stringify(before.versions.a), "OLDER versions of a changed");
  assert.strictEqual(store.versions.a.length, 3, "exactly one new version expected");
  const c3 = store.versions.a[2].comment;
  assert(c3.startsWith("Allergen decision 2026-10-12 (test)") && c3.endsWith("| Source spec: 100001 Thing - RM Spec V1.xlsx"), "comment wrong: " + c3);
  console.log("PASS apply changed ONLY the planned ticks list and note on ONLY the planned ingredient; all other ingredients and older versions identical");
  console.log("PASS one new version, comment = why-note + spec file carried forward: " + c3);
  console.log("\nAll offline checks passed; nothing live was touched.");
  server.close();
});
