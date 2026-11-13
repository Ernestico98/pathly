import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, csvToExport, mapStatus, splitTimeline } from "../scripts/csvImport";
import { computeAnalytics } from "./analytics";
import { Db } from "./db";
import { exportAll, importAll, migrateExport } from "./exportImport";
import { Repo } from "./repo";

const repo = async () => new Repo(await Db.open(null));

test("splitTimeline: dated bullets, undated follow-ups and wrapped lines", () => {
  const segs = splitTimeline("- 27/07/2026: Entrevista con un founder\ncontinúa aquí\n- Email de rechazo\n- 4/9/26: Onsite");
  assert.equal(segs.length, 3);
  assert.deepEqual([segs[0]!.date, segs[1]!.date, segs[1]!.dateIsApprox, segs[2]!.date], ["2026-07-27", "2026-07-27", true, "2026-09-04"]);
  assert.match(segs[0]!.text, /continúa aquí/);
});

test("classify uses the first mention, not future steps", () => {
  assert.equal(classify("Entrevista con el recruiter, todo fue bien procede con agendar las entrevistas tecnicas.").interviewType, "recruiter_screen");
  assert.equal(classify("Entrevista V2, la de product y system design. Prox es con un hiring manager para una behavioral").interviewType, "system_design");
  assert.equal(classify("El recruiter me escribe con el rechazo.").kind, "email");
  assert.equal(classify("Online assessment -> didn't pass").kind, "assessment");
});

test("csv delimiter is detected (Numbers/Excel ES export uses ;)", () => {
  const semi = csvToExport('Empresa;Description;Stage;Status;\nAcme;"a; b";"- 01/10/2026: Llamada con la recruiter";Ongoing;\n').data;
  assert.equal(semi.processes[0]!.status, "ongoing");
  assert.equal(semi.companies[0]!.notes, "a; b");
});

test("mapStatus", () => {
  assert.equal(mapStatus("Oferta"), "offer");
  assert.equal(mapStatus("Discarded"), "withdrawn");
  assert.equal(mapStatus(""), "wishlist");
});

test("csvToExport builds a valid, importable export", async () => {
  const csv = 'Empresa,Description,Stage,Status,\nAcme,"Based in Barcelona\n- salarios 65k-80k","- 01/10/2026: Llamada con la recruiter\n- 05/10/2026: Email de rechazo",Rejected,\nGlovo????,,,,\n';
  const { data } = csvToExport(csv);
  assert.equal(migrateExport(data).processes.length, 2);
  const acme = data.processes.find((p) => p.status === "rejected")!;
  assert.equal(acme.location, "Barcelona");
  assert.deepEqual([acme.salaryMin, acme.salaryMax, acme.appliedAt, acme.closedAt], [65000, 80000, "2026-10-01", "2026-10-05"]);
  assert.ok(data.companies.some((c) => c.name === "Glovo"));
  const r = await repo();
  importAll(r, data, "replace");
  assert.equal(computeAnalytics(r, "2026-10-10").funnel[0]!.value, 1);
});

test("repo: entry with status change + export/import round trip", async () => {
  const r = await repo();
  const p = r.createProcess({ company: { name: "TestCo" }, status: "applied", role: "SWE" });
  const after = r.addEntry(p.id, {
    entry: { date: "2026-11-01", kind: "interview", rawNotes: "x" },
    status: { to: "offer", reason: "", entryId: null },
    processSummary: "resumen",
  });
  assert.equal(after.status, "offer");
  assert.equal(after.stage, "offer");
  assert.equal(after.summary, "resumen");
  assert.equal(after.statusChanges.find((s) => s.to === "offer")!.entryId, after.entries[0]!.id);

  const dump = exportAll(r);
  const r2 = await repo();
  assert.deepEqual(importAll(r2, dump, "merge"), { inserted: 5, updated: 0, skipped: 0 });
  assert.deepEqual(importAll(r2, dump, "merge"), { inserted: 0, updated: 0, skipped: 5 });
  assert.equal(r2.getProcess(p.id).entries.length, 1);

  r.deleteProcess(p.id);
  assert.equal(r.db.select("entries").length, 0, "entries cascade on delete");
});

test("migrateExport rejects foreign and future files", () => {
  assert.throws(() => migrateExport({ app: "other" }));
  assert.throws(() => migrateExport({ app: "pathly", schemaVersion: 99 }), /más nueva/);
});
