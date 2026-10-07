// One-off correction: split container/count wording out of Pack Size into Pack Format,
// per the plan reviewed and approved by the user (see .scan/packsize_fix_plan.json).
// Writes ONLY packSize/packFormat for each code, matched by exact code equality (same
// safety pattern as spec-apply.js), and re-fetches to verify every write landed correctly.
const fs = require("fs");
const { execSync } = require("child_process");

const API_BASE = "http://192.168.0.50:5001";
const COOKIE_JAR = process.env.COOKIE_JAR || "/tmp/qa_cookies.txt";

function curlGet(url) {
  const out = execSync(`curl -s -b "${COOKIE_JAR}" "${url}"`, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out.toString());
}
function curlPut(url, body) {
  const tmp = "packsize-fix.put-body.json";
  fs.writeFileSync(tmp, JSON.stringify(body));
  const out = execSync(`curl -s -b "${COOKIE_JAR}" -X PUT "${url}" -H "content-type: application/json" --data @"${tmp}" -w "\\n%{http_code}"`, { maxBuffer: 50 * 1024 * 1024 });
  fs.unlinkSync(tmp);
  const text = out.toString();
  const idx = text.lastIndexOf("\n");
  return { body: text.slice(0, idx), status: text.slice(idx + 1).trim() };
}

const planPath = process.argv[2] || "C:\\Dev\\NutriCost\\.scan\\packsize_fix_plan.json";
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const allIngredients = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);

let okCount = 0, failCount = 0;
const failures = [];

for (const item of plan) {
  const matched = allIngredients.find((i) => (i.code || "").trim().toUpperCase() === item.code.trim().toUpperCase());
  if (!matched) {
    console.log(`SKIP ${item.code}: no live match found`);
    failCount++;
    failures.push({ code: item.code, reason: "no live match" });
    continue;
  }
  if (matched.packSize !== item.old_packSize) {
    console.log(`SKIP ${item.code}: live packSize (${JSON.stringify(matched.packSize)}) doesn't match expected old value (${JSON.stringify(item.old_packSize)}) -- may have changed since the plan was built`);
    failCount++;
    failures.push({ code: item.code, reason: "packSize changed since plan built", live: matched.packSize, expected: item.old_packSize });
    continue;
  }
  const updated = { ...matched, packSize: item.new_packSize };
  if (item.new_packFormat !== undefined) updated.packFormat = item.new_packFormat;
  const result = curlPut(`${API_BASE}/api/ingredients/${matched.id}`, updated);
  if (result.status !== "200") {
    console.log(`FAIL ${item.code}: PUT status ${result.status}`);
    failCount++;
    failures.push({ code: item.code, reason: `PUT status ${result.status}` });
    continue;
  }
  okCount++;
  console.log(`OK ${item.code}: packSize ${JSON.stringify(item.old_packSize)} -> ${JSON.stringify(item.new_packSize)}`);
}

console.log(`\n${okCount} succeeded, ${failCount} failed/skipped.`);
if (failures.length) {
  console.log("Failures:", JSON.stringify(failures, null, 2));
}

// Post-write verification pass: re-fetch and confirm every successful write actually landed.
console.log("\n--- Post-write verification ---");
const verifyList = curlGet(`${API_BASE}/api/ingredients?includeUnlinked=true`);
let verifyOk = 0, verifyFail = 0;
for (const item of plan) {
  const live = verifyList.find((i) => (i.code || "").trim().toUpperCase() === item.code.trim().toUpperCase());
  if (!live) continue;
  if (live.packSize === item.new_packSize && (item.new_packFormat === undefined || live.packFormat === item.new_packFormat)) {
    verifyOk++;
  } else if (live.packSize === item.old_packSize) {
    // was skipped/failed, not a verification problem
  } else {
    verifyFail++;
    console.log(`VERIFY MISMATCH ${item.code}: live packSize=${JSON.stringify(live.packSize)} packFormat=${JSON.stringify(live.packFormat)}, expected packSize=${JSON.stringify(item.new_packSize)} packFormat=${JSON.stringify(item.new_packFormat)}`);
  }
}
console.log(`Verified matching: ${verifyOk}, verification mismatches: ${verifyFail}`);
