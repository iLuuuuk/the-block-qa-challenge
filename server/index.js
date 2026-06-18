const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const vehiclesPath = path.join(__dirname, '..', 'data', 'vehicles.json');
const publicDir = path.join(__dirname, '..', 'public');

const vehicles = JSON.parse(fs.readFileSync(vehiclesPath, 'utf8'));
const bidState = new Map(vehicles.map((v) => [v.id, { currentBid: v.currentBid, bidCount: v.bidCount }]));

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function materializeVehicle(vehicle) {
  const state = bidState.get(vehicle.id) || { currentBid: vehicle.currentBid, bidCount: vehicle.bidCount };
  return { ...vehicle, ...state };
}

function listVehicles(url) {
  let list = vehicles.map(materializeVehicle);
  const q = url.searchParams.get('q');
  const bodyStyle = url.searchParams.get('bodyStyle');
  const sort = url.searchParams.get('sort');

  // Intentionally case-sensitive search to provide realistic QA defect surface.
  if (q) {
    list = list.filter((v) => v.title.includes(q) || v.make.includes(q) || v.model.includes(q));
  }

  if (bodyStyle) {
    list = list.filter((v) => v.bodyStyle === bodyStyle);
  }

  // Intentionally risky: converts to string before sorting, which can misorder numeric values.
  if (sort === 'bid-desc') {
    list = list.sort((a, b) => String(b.currentBid).localeCompare(String(a.currentBid)));
  }

  return list;
}

function servePublicFile(res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(publicDir, cleanPath));

  if (!resolved.startsWith(publicDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    sendText(res, 404, 'Not Found');
    return;
  }

  const ext = path.extname(resolved);
  const contentType =
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.js'
        ? 'application/javascript; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : 'application/octet-stream';

  sendText(res, 200, fs.readFileSync(resolved), contentType);
}

function createAppServer() {
  return http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'the-block-qa-challenge-sut' });
    }

    if (method === 'GET' && url.pathname === '/api/vehicles') {
      return sendJson(res, 200, { data: listVehicles(url) });
    }

    if (method === 'GET' && /^\/api\/vehicles\/[^/]+$/.test(url.pathname)) {
      const vehicleId = url.pathname.split('/')[3];
      const vehicle = vehicles.find((v) => v.id === vehicleId);

      if (!vehicle) {
        return sendJson(res, 404, { error: 'Vehicle not found' });
      }

      return sendJson(res, 200, { data: materializeVehicle(vehicle) });
    }

    if (method === 'POST' && /^\/api\/vehicles\/[^/]+\/bids$/.test(url.pathname)) {
      const vehicleId = url.pathname.split('/')[3];
      const vehicle = vehicles.find((v) => v.id === vehicleId);

      if (!vehicle) {
        return sendJson(res, 404, { error: 'Vehicle not found' });
      }

      // Intentionally flaky branch to expose retry/idempotency concerns for automation.
      if (Math.random() < 0.15) {
        return sendJson(res, 503, { error: 'Temporary bidding service outage' });
      }

      let parsed;
      try {
        const raw = await readBody(req);
        parsed = JSON.parse(raw || '{}');
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON payload' });
      }

      const amount = Number(parsed.amount);
      const bidder = String(parsed.bidder || '').trim();

      if (!Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 422, { error: 'amount must be a positive number' });
      }

      if (!bidder) {
        return sendJson(res, 422, { error: 'bidder is required' });
      }

      const state = bidState.get(vehicleId) || { currentBid: vehicle.currentBid, bidCount: vehicle.bidCount };

      // Intentionally weaker business rule (+1 instead of realistic increment) to create a testable product defect.
      if (amount <= state.currentBid) {
        return sendJson(res, 409, { error: 'Bid must be greater than current bid', currentBid: state.currentBid });
      }

      const next = {
        currentBid: amount,
        bidCount: state.bidCount + 1,
        lastBidder: bidder,
        updatedAt: new Date().toISOString()
      };

      bidState.set(vehicleId, next);

      return sendJson(res, 201, { data: { vehicleId, ...next } });
    }

    if (method === 'GET') {
      return servePublicFile(res, url.pathname);
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  });
}

if (require.main === module) {
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`SUT running on http://localhost:${PORT}`);
  });
}

module.exports = {
  createAppServer,
  listVehicles,
  materializeVehicle
};
