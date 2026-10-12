// spec-source.js -- shared by every script that writes ingredients or versions.
//
// RULE (user, 2026-09-29 and restated 2026-10-12): the spec file name is saved on the ingredient's version history and shown as
// "Source: ..." in the ingredient window, and it must NEVER be lost. After any write, call ensureSpecSource():
//   * it looks at the ingredient's LATEST version;
//   * if that comment already names a spec file (.xlsx / .xls) it does nothing;
//   * otherwise it adds the spec file name WITHOUT overwriting anything: an empty comment becomes "<label>: <file>", an
//     existing comment is kept word for word and " | Source spec: <file>" is appended;
//   * the file name is the one passed in (the spec just uploaded) or, when none is given (pack-size fix, field fix...), the
//     most recent spec file name already recorded on an earlier version (carried forward);
//   * it re-reads the versions and VERIFIES the file name is there; if it cannot be recorded or verified it returns ok:false and
//     the calling script must stop loudly (never carry on silently).
// `http` can be injected (get(url) -> parsed JSON, post(url, body) -> {status, body}) so the logic is testable without a server.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const SPEC_FILE_RE = /\.xlsx?\s*$/i;
const LABEL_RE = /^(Spec upload|Source spec|Reapplied from spec-data archive):\s*(.+\.xlsx?)\s*$/i;

// The spec file name recorded in one comment, or null. Comments can hold several parts separated by " | ".
function specFileInComment(comment) {
  if (!comment) return null;
  const parts = String(comment).split(" | ");
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = LABEL_RE.exec(parts[i].trim());
    if (m) return m[2].trim();
  }
  return null;
}

function newestFirst(versions) {
  return versions.slice().sort((a, b) => b.versionNumber - a.versionNumber);
}

// Most recent spec file name recorded on ANY version, or null.
function lastKnownSpecFile(versions) {
  for (const v of newestFirst(versions)) {
    const f = specFileInComment(v.comment);
    if (f) return f;
  }
  return null;
}

// Only a real spec file name may ever be recorded: a bare file name ending .xlsx/.xls, never a path or a placeholder.
function isRealSpecFileName(name) {
  return !!name && SPEC_FILE_RE.test(name) && !/[\\/]/.test(name) && !/baseline snapshot/i.test(name);
}

function composeComment(existing, file, label) {
  const e = (existing || "").trim();
  return e ? `${e} | Source spec: ${file}` : `${label || "Spec upload"}: ${file}`;
}

function curlHttp(apiBase, cookieJar) {
  return {
    get(url) {
      return JSON.parse(execSync(`curl -s -b "${cookieJar}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 }).toString());
    },
    post(url, bodyObj) {
      const tmp = path.join(os.tmpdir(), `.specsource-${process.pid}-${Date.now()}.json`);
      fs.writeFileSync(tmp, JSON.stringify(bodyObj));
      try {
        const out = execSync(`curl -s -w "\\n%{http_code}" -b "${cookieJar}" -X POST "${url}" -H "content-type: application/json" --data @"${tmp}"`).toString();
        const i = out.lastIndexOf("\n");
        let body = null;
        try { body = JSON.parse(out.slice(0, i)); } catch (e) { body = out.slice(0, i); }
        return { status: out.slice(i + 1).trim(), body };
      } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
      }
    },
  };
}

// Returns { ok, action, file, comment, reason }.  action: "already" | "set" | "appended" | "failed".
function ensureSpecSource({ apiBase, cookieJar, id, code, specFile, label, http }) {
  const h = http || curlHttp(apiBase, cookieJar);
  const vUrl = `${apiBase}/api/ingredients/${encodeURIComponent(id)}/versions`;
  let versions;
  try { versions = h.get(vUrl); } catch (e) { return { ok: false, action: "failed", reason: "could not read the version history: " + e.message }; }
  if (!Array.isArray(versions) || versions.length === 0) return { ok: false, action: "failed", reason: "no version history for this ingredient (cannot record a source)" };
  const latest = newestFirst(versions)[0];
  const given = isRealSpecFileName(specFile) ? specFile : null;
  const onLatest = specFileInComment(latest.comment);
  // already recorded: nothing to write (when a specific new file is given, it must be that file)
  if (onLatest && (!given || String(latest.comment).includes(given))) {
    return { ok: true, action: "already", file: given || onLatest, comment: latest.comment };
  }
  const file = given || lastKnownSpecFile(versions);
  if (!file) return { ok: false, action: "failed", reason: `no real spec file name is known for ${code || id} (given: ${JSON.stringify(specFile || null)}; none recorded on any earlier version)` };
  const comment = composeComment(latest.comment, file, label);
  let res;
  try { res = h.post(`${apiBase}/api/ingredients/${encodeURIComponent(id)}/latest-version-comment`, { comment }); } catch (e) { return { ok: false, action: "failed", reason: "comment call failed: " + e.message }; }
  if (String(res.status) !== "200") return { ok: false, action: "failed", reason: `comment call returned status ${res.status}` };
  // verify by re-reading, not by trusting the response
  let after;
  try { after = h.get(vUrl); } catch (e) { return { ok: false, action: "failed", reason: "could not re-read versions to verify: " + e.message }; }
  const newest = newestFirst(after)[0];
  if (!newest || specFileInComment(newest.comment) !== file) return { ok: false, action: "failed", reason: "verification failed: the latest version does not carry the spec file name after the write" };
  return { ok: true, action: (latest.comment || "").trim() ? "appended" : "set", file, comment };
}

// Add a human-written note to the LATEST version without ever overwriting what is there (field-fix-apply uses this for its
// "why" comment). Empty comment -> the note; already contains the note -> nothing; otherwise "<existing> | <note>".
function appendNote({ apiBase, cookieJar, id, note, http }) {
  const h = http || curlHttp(apiBase, cookieJar);
  const vUrl = `${apiBase}/api/ingredients/${encodeURIComponent(id)}/versions`;
  const versions = h.get(vUrl);
  if (!Array.isArray(versions) || versions.length === 0) return { ok: false, reason: "no version history" };
  const latest = newestFirst(versions)[0];
  const existing = (latest.comment || "").trim();
  if (existing.includes(note)) return { ok: true, action: "already" };
  const comment = existing ? `${existing} | ${note}` : note;
  const res = h.post(`${apiBase}/api/ingredients/${encodeURIComponent(id)}/latest-version-comment`, { comment });
  if (String(res.status) !== "200") return { ok: false, reason: `comment call returned status ${res.status}` };
  const after = newestFirst(h.get(vUrl))[0];
  if (!after || (after.comment || "").trim() !== comment) return { ok: false, reason: "verification failed: the note is not on the latest version" };
  return { ok: true, action: existing ? "appended" : "set" };
}

// For scripts: record, print one clear line, and stop the whole run on failure.
function ensureSpecSourceOrExit(opts) {
  const r = ensureSpecSource(opts);
  if (r.ok) {
    console.log(`  SOURCE RECORDED (${r.action}): ${r.file}`);
    return r;
  }
  console.log(`  SOURCE NOT RECORDED for ${opts.code || opts.id}: ${r.reason}`);
  process.exitCode = 1;
  return r;
}

module.exports = { specFileInComment, lastKnownSpecFile, isRealSpecFileName, composeComment, ensureSpecSource, ensureSpecSourceOrExit, appendNote, curlHttp };
