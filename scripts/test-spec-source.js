// Offline test of scripts/lib/spec-source.js against a pretend server. Writes NOTHING anywhere: run `node scripts/test-spec-source.js`.
const assert = require("assert");
const S = require("./lib/spec-source.js");

function fake(versions, opts) {
  opts = opts || {};
  const v = versions.map((x) => Object.assign({}, x));
  return {
    state: v,
    calls: [],
    get() { return JSON.parse(JSON.stringify(v)); },
    post(url, body) {
      this.calls.push(body.comment);
      if (opts.postStatus) return { status: opts.postStatus, body: null };
      if (!opts.dropWrite) v.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0].comment = body.comment;  // like the real endpoint: latest version only
      return { status: "200", body: {} };
    },
  };
}
const run = (versions, extra, opts) => {
  const before = JSON.parse(JSON.stringify(versions));
  const http = fake(versions, opts);
  const r = S.ensureSpecSource(Object.assign({ apiBase: "x", id: "i1", code: "100001", http }, extra || {}));
  // NOTHING ELSE MAY CHANGE: same number of versions, same numbers, every older version byte-identical, and on the
  // newest version only the comment may differ (and only when the call succeeded).
  assert.strictEqual(http.state.length, before.length, "version count changed");
  const newestNum = Math.max.apply(null, before.map((x) => x.versionNumber));
  before.forEach((b) => {
    const a = http.state.find((x) => x.versionNumber === b.versionNumber);
    assert(a, "a version disappeared");
    const strip = (o) => { const c = Object.assign({}, o); delete c.comment; return JSON.stringify(c); };
    assert.strictEqual(strip(a), strip(b), "a field other than the comment changed");
    if (b.versionNumber !== newestNum) assert.strictEqual(a.comment, b.comment, "an OLDER version's comment changed");
    if (!r.ok && !opts) assert.strictEqual(a.comment, b.comment, "a failed run still changed a comment");
  });
  return { r, http };
};
const F = "100001 (1) Thing - RM Spec V1.xlsx";
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("PASS " + name); };

t("empty latest comment -> 'Spec upload: <file>'", () => {
  const { r, http } = run([{ versionNumber: 1, comment: null }, { versionNumber: 2, comment: "" }], { specFile: F });
  assert(r.ok && r.action === "set" && http.state[1].comment === "Spec upload: " + F);
});
t("existing note is KEPT word for word and the file is appended", () => {
  const { r, http } = run([{ versionNumber: 1, comment: "Weight per each set from Pack Size (user-approved)" }], { specFile: F });
  assert(r.ok && r.action === "appended" && http.state[0].comment === "Weight per each set from Pack Size (user-approved) | Source spec: " + F);
});
t("latest already names THIS spec file -> nothing written", () => {
  const { r, http } = run([{ versionNumber: 3, comment: "Spec upload: " + F }], { specFile: F });
  assert(r.ok && r.action === "already" && http.calls.length === 0);
});
t("latest names a spec file and none is given (carry-forward case) -> nothing written", () => {
  const { r, http } = run([{ versionNumber: 3, comment: "Spec upload: " + F }]);
  assert(r.ok && r.action === "already" && http.calls.length === 0);
});
t("a NEWER spec file for the same ingredient is appended, the old name kept", () => {
  const { r, http } = run([{ versionNumber: 3, comment: "Spec upload: " + F }], { specFile: "100001 (1) Thing - RM Spec V2.xlsx" });
  assert(r.ok && r.action === "appended" && http.state[0].comment === "Spec upload: " + F + " | Source spec: 100001 (1) Thing - RM Spec V2.xlsx");
});
t("appendNote: empty -> note; existing kept and note appended; already there -> nothing", () => {
  const mk = (c) => fake([{ versionNumber: 1, comment: c }]);
  let h = mk(null); assert(S.appendNote({ apiBase: "x", id: "i", note: "why", http: h }).ok && h.state[0].comment === "why");
  h = mk("Spec upload: a.xlsx"); assert(S.appendNote({ apiBase: "x", id: "i", note: "why", http: h }).ok && h.state[0].comment === "Spec upload: a.xlsx | why");
  h = mk("x | why"); assert(S.appendNote({ apiBase: "x", id: "i", note: "why", http: h }).action === "already" && h.calls.length === 0);
  h = fake([{ versionNumber: 1, comment: null }], { postStatus: "500" }); assert(!S.appendNote({ apiBase: "x", id: "i", note: "why", http: h }).ok);
});
t("carry forward: no file given, an older version names it, the latest is empty", () => {
  const { r, http } = run([{ versionNumber: 1, comment: "Spec upload: " + F }, { versionNumber: 2, comment: null }, { versionNumber: 3, comment: null }]);
  assert(r.ok && r.file === F && http.state[2].comment === "Spec upload: " + F && http.state[0].comment === "Spec upload: " + F);
});
t("carry forward keeps the latest note and appends", () => {
  const { r, http } = run([{ versionNumber: 1, comment: "Spec upload: " + F }, { versionNumber: 2, comment: "Pack size corrected" }]);
  assert(r.ok && http.state[1].comment === "Pack size corrected | Source spec: " + F);
});
t("a spec file inside a ' | ' part is recognised", () => {
  assert.strictEqual(S.specFileInComment("note | Source spec: " + F), F);
  assert.strictEqual(S.specFileInComment("Reapplied from spec-data archive: " + F), F);
  assert.strictEqual(S.specFileInComment("Shelf-life backfill 2026-09-29 (spec-extract.py did not parse this field until today)"), null);
});
t("no file known anywhere -> FAILS loudly, writes nothing", () => {
  const { r, http } = run([{ versionNumber: 1, comment: "Shelf-life backfill" }]);
  assert(!r.ok && /no real spec file name/.test(r.reason) && http.calls.length === 0);
});
t("placeholder / path / non-file names are refused", () => {
  assert(!S.isRealSpecFileName("baseline snapshot from live DB (original extraction JSON not kept).xlsx"));
  assert(!S.isRealSpecFileName("C:\\Users\\x\\Temp\\copy.xlsx"));
  assert(!S.isRealSpecFileName("notes.txt"));
  assert(!S.isRealSpecFileName(null));
  assert(S.isRealSpecFileName(F));
  const { r } = run([{ versionNumber: 1, comment: "x" }], { specFile: "baseline snapshot.xlsx" });
  assert(!r.ok);
});
t("the comment call returning an error status -> FAILS", () => {
  const { r } = run([{ versionNumber: 1, comment: null }], { specFile: F }, { postStatus: "401" });
  assert(!r.ok && /status 401/.test(r.reason));
});
t("write that did not land (verification by re-reading) -> FAILS", () => {
  const { r } = run([{ versionNumber: 1, comment: null }], { specFile: F }, { dropWrite: true });
  assert(!r.ok && /verification failed/.test(r.reason));
});
t("no version history -> FAILS", () => {
  const { r } = run([], { specFile: F });
  assert(!r.ok);
});
console.log(`\n${n} tests passed, nothing was written anywhere.`);
