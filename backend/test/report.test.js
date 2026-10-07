const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'isolated-report-test-secret';
process.env.SMTP_HOST = '';
const db = require('../db');
const express = require('express');
const jwt = require('jsonwebtoken');
const JSZip = require('jszip');
let server, base, caseId;
const tokens = {};
before(async () => {
  for (const role of ['SOC_ADMIN', 'SOC_ANALYST', 'IR_ANALYST']) {
    const id = db.prepare('INSERT INTO users(username,password_hash,role) VALUES (?,?,?)').run(role, 'unused', role).lastInsertRowid;
    tokens[role] = jwt.sign({ id }, process.env.JWT_SECRET);
  }
  caseId = db.prepare('INSERT INTO cases(title,summary,source_ip,archived,assigned_to) VALUES (?,?,?,?,?)').run('Report <case> & evidence', 'First line\nSecond line', '["192.0.2.1"]', 1, 2).lastInsertRowid;
  db.prepare('INSERT INTO case_notes(case_id,author_id,body) VALUES (?,?,?)').run(caseId, 2, 'Investigation note');
  db.prepare('INSERT INTO case_history(case_id,action,detail) VALUES (?,?,?)').run(caseId, 'archived', 'Archived for review');
  db.prepare('INSERT INTO iocs(case_id,type,value,documents) VALUES (?,?,?,?)').run(caseId, 'Domain', 'example.invalid', JSON.stringify([{ originalName: 'evidence.docx', size: 123, url: '/api/uploads/file/evidence?token=SECRET' }]));
  const linkedId = db.prepare('INSERT INTO cases(title) VALUES (?)').run('Related incident').lastInsertRowid;
  db.prepare('INSERT INTO case_links(case_id_a,case_id_b) VALUES (?,?)').run(caseId, linkedId);
  const app = express(); app.use(express.json()); app.use('/api/cases', require('../routes/cases'));
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/cases`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
test('all case-reading roles export a valid DOCX snapshot, including archived cases', async () => {
  for (const token of Object.values(tokens)) {
    const response = await fetch(`${base}/${caseId}/report`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /wordprocessingml.document/);
    assert.match(response.headers.get('content-disposition'), /Nib-case-0001-report.docx/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    assert.ok(zip.file('[Content_Types].xml'));
    const xml = await zip.file('word/document.xml').async('string');
    for (const text of ['#0001', 'Report &lt;case&gt; &amp; evidence', 'First line', 'Second line', '192.0.2.1', 'Investigation note', 'Archived for review', 'example.invalid', 'evidence.docx', 'Related incident', 'UTC']) assert.ok(xml.includes(text), text);
    assert.ok(!xml.includes('token=SECRET'));
  }
});
test('reports reject unauthenticated requests, unknown cases and invalid IDs', async () => {
  assert.equal((await fetch(`${base}/${caseId}/report`)).status, 401);
  const headers = { Authorization: `Bearer ${tokens.SOC_ADMIN}` };
  assert.equal((await fetch(`${base}/99999/report`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/invalid/report`, { headers })).status, 400);
});
