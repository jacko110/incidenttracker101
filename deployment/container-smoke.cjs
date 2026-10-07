// Run only inside the disposable CI container; it writes fixtures to its volume.
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function request(route, options = {}) {
  const res = await fetch('http://127.0.0.1:4000/api' + route, options);
  assert.ok(res.ok, `${route}: ${res.status}`); return res;
}
(async () => {
  const login = await request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ci-admin', password: 'isolated-ci-admin-password' }) });
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let fixture;
  if (process.argv[2] === 'create') {
    const form = new FormData(); form.append('files', new Blob(['CI persistence evidence'], { type: 'text/plain' }), 'evidence.txt');
    const upload = await request('/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const { files } = await upload.json();
    const incident = await (await request('/cases', { method: 'POST', headers, body: JSON.stringify({ title: 'Production persistence check', iocs: [{ type: 'Domain', value: 'ci.invalid', documents: files }] }) })).json();
    fixture = { id: incident.id, url: files[0].url };
    fs.writeFileSync('/app/data/smoke.json', JSON.stringify(fixture));
  } else fixture = JSON.parse(fs.readFileSync('/app/data/smoke.json', 'utf8'));
  const incident = await (await request(`/cases/${fixture.id}`, { headers })).json();
  assert.equal(incident.title, 'Production persistence check');
  const file = await request(fixture.url.replace('/api', ''), { headers });
  assert.equal(await file.text(), 'CI persistence evidence');
  const report = await request(`/cases/${fixture.id}/report`, { headers });
  assert.match(report.headers.get('content-type'), /wordprocessingml.document/);
  console.log('Production case, evidence and report checks passed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
