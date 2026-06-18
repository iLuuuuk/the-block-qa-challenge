const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server/index.js');

// ─── Server lifecycle ─────────────────────────────────────────────────────────
// These variables hold the server and base URL for all tests
let server;
let BASE_URL;

// before() runs ONE TIME before any test starts
test.before(async () => {
  server = createAppServer();

  await new Promise((resolve) => {
    // Port 0 = Node picks a free port automatically
    // This way it doesn't conflict with the server already running on 3000
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  BASE_URL = `http://127.0.0.1:${port}`;

  console.log(`Test server running at ${BASE_URL}`);
});

// after() runs ONE TIME after all tests finish
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  console.log('Test server closed');
});

// ─── Tests ────────────────────────────────────────────────────────────────────
test('health check returns 200 with ok: true', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

test('vehicle list returns 200 with array', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0);
});

test('existing vehicle returns 200', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.id, 'v1')
});

test('non existing vehicle returns 404', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/nohay`);
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, 'Vehicle not found')
});

// ─── Bids ─────────────────────────────────────────────────────────────────────

// Non existing vehicle → 404
test('bid on non existing vehicle returns 404', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/noexiste/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 99999, bidder: 'Lucas' })
  });
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, 'Vehicle not found')
});

// invalid payload → 400
test('bid with invalid payload returns 400', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: "test nojson"
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error, 'Invalid JSON payload')
});

// bid amount not finite → 422
test('bid with non finite amount returns 422', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Infinity, bidder: 'Lucas' })
  });
  const body = await res.json();

  assert.equal(res.status, 422);
  assert.equal(body.error, 'amount must be a positive number')
});

// bid amount negative → 422
test('bid with negative amount returns 422', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: -11, bidder: 'Lucas' })
  });
  const body = await res.json();

  assert.equal(res.status, 422);
  assert.equal(body.error, 'amount must be a positive number')
});

// bid without bidder → 422
test('bid without bidder returns 422', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 9999999 })
  });
  const body = await res.json();

  assert.equal(res.status, 422);
  assert.equal(body.error, 'bidder is required')
});

// bug: should reject minimum increments but it doesn't
test('bug: bid with $1 increment is accepted', async () => {
  // get currentBid of v1
  const detail = await fetch(`${BASE_URL}/api/vehicles/v1`);
  const { data } = await detail.json();

  // raise only $1
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: data.currentBid + 1, bidder: 'Lucas' })
  });

  assert.equal(res.status, 201);
});

test('bid lower than current returns 409', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 1, bidder: 'Lucas' })
  });
  const body = await res.json();

  assert.equal(res.status, 409);
  assert.ok(body.error.includes('current bid'));
});

test('bug: bids endpoint fails randomly with 503', async () => {
  let count503 = 0;
  const ATTEMPTS = 50;

  for (let i = 0; i < ATTEMPTS; i++) {
    const res = await fetch(`${BASE_URL}/api/vehicles/v2/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 99999, bidder: 'Lucas' })
    });
    if (res.status === 503) count503++;
  }

  // log 503s received to have context when running the test
  console.log(`BUG: 503s received: ${count503}/${ATTEMPTS}`);
  // check the rate doesn't go over 40% (code says ~15%)
  assert.ok(count503 < ATTEMPTS * 0.4, `Too many 503s: ${count503}`);
});

// valid bid → 201 with correct data
test('valid bid returns 201', async () => {
  const detail = await fetch(`${BASE_URL}/api/vehicles/v1`);
  const { data } = await detail.json();

  let res, body;
  for (let i = 0; i < 10; i++) {
    res = await fetch(`${BASE_URL}/api/vehicles/v1/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: data.currentBid + 500, bidder: 'Lucas' })
    });
    body = await res.json();
    if (res.status !== 503) break;
  }

  assert.equal(res.status, 201);
});

// List vehicles ________________________________________________________________
test('bug: search is case-sensitive, "toyota" does not find Toyota', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles?q=toyota`);
  const body = await res.json();

  assert.equal(res.status, 200);         // server responds ok
  assert.equal(body.data.length, 0);     // but returns nothing
});

test('search with q=Toyota returns results', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles?q=Toyota`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.data.length > 0);
});

test('filter by bodyStyle returns only matching vehicles', async () => {
  const res = await fetch(`${BASE_URL}/api/vehicles?bodyStyle=SUV`);
  const body = await res.json();

  assert.equal(res.status, 200);         // server responds ok
  assert.ok(body.data.every(v => v.bodyStyle === 'SUV'));
});

test('bug: sort bid-desc uses string comparison instead of numeric', async () => {
  const detail = await fetch(`${BASE_URL}/api/vehicles?sort=bid-desc`);
  const { data } = await detail.json();
  let isSortedOk = true;
  for (let i = data.length - 1; i > 0; i--) {
    if (data[i].currentBid > data[i - 1].currentBid) {
      isSortedOk = false;
      break;
    }
  }

  assert.equal(isSortedOk, true);
});
