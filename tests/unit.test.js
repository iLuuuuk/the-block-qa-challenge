const test = require('node:test');
const assert = require('node:assert/strict');
const { URL } = require('node:url');

const { listVehicles, materializeVehicle } = require('../server/index.js');
const vehicles = require('../data/vehicles.json');

test('materializeVehicle keeps baseline vehicle properties', () => {
  const base = vehicles[0];
  const v = materializeVehicle(base);
  assert.equal(v.id, base.id);
  assert.equal(typeof v.currentBid, 'number');
  assert.equal(typeof v.bidCount, 'number');
});

test('listVehicles filters by bodyStyle', () => {
  const url = new URL('http://localhost/api/vehicles?bodyStyle=SUV');
  const result = listVehicles(url);
  assert.equal(result.length >= 1, true);
  assert.equal(result.every((v) => v.bodyStyle === 'SUV'), true);
});

test('listVehicles returns all items when no filter supplied', () => {
  const url = new URL('http://localhost/api/vehicles');
  const result = listVehicles(url);
  assert.equal(result.length, vehicles.length);
});
