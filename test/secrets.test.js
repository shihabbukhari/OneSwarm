import assert from 'node:assert/strict';
import test from 'node:test';
import { findSecret } from '../src/secrets.js';

test('ordinary talk about passwords is not treated as a secret', () => {
  assert.equal(findSecret('How do I hash a password in Node?'), null);
  assert.equal(findSecret('The password is required before the form submits.'), null);
  assert.equal(findSecret('api_key is missing from the environment'), null);
  assert.equal(findSecret('Set the token to a placeholder like changeme.'), null);
});

test('real credentials are recognized without returning the value', () => {
  assert.equal(findSecret('password: hunter2'), 'secret');
  assert.equal(findSecret('my api_key is sk-live-not-a-real-key'), 'api key');
  assert.equal(findSecret('mysql://app:s3cret-pass@db.example:3306/app'), 'connection string');
  assert.equal(findSecret('-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'), 'private key');
  assert.equal(findSecret('use os_live_abcdefghijklmnopqrstuvwxyz'), 'agent key');
  assert.equal(findSecret('ghp_abcdefghijklmnopqrstuvwxyz123456'), 'token');
  assert.equal(findSecret('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.signature'), 'token');
});
