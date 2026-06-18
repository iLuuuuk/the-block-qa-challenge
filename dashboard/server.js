const http = require('node:http');
const { exec } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 4000;
const ROOT = path.join(__dirname, '..');

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
      resolve(stdout + stderr);
    });
  });
}

// Parse node:test output — lines like "ok 1 - test name" or "not ok 1 - test name"
function parseAPI(output) {
  return output.split('\n')
    .filter(l => /^(ok|not ok) \d+/.test(l))
    .map(l => ({
      name: l.replace(/^(ok|not ok) \d+ - /, '').trim(),
      pass: l.startsWith('ok')
    }));
}

// Parse Playwright JSON output
function parseE2E(output) {
  try {
    const json = JSON.parse(output);
    return json.suites[0].specs.map(s => ({
      name: s.title,
      pass: s.tests[0].results[0].status === 'passed'
    }));
  } catch {
    return [];
  }
}

http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }

  if (req.url === '/run') {
    const [api, e2e] = await Promise.all([
      run('node --test tests/api.test.js'),
      run('npx playwright test --reporter=json')
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ api: parseAPI(api), e2e: parseE2E(e2e) }));
  }

  res.writeHead(404); res.end();

}).listen(PORT, () => console.log(`Dashboard → http://localhost:${PORT}`));
