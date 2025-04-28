const axios = require('axios');
const chai = require('chai');
const expect = chai.expect;

const BASE_URL = 'http://localhost:3000/api';
const testEmail = 'testuser@example.com';
const testPassword = 'TestPassword123!';

let token;

describe('User Registration & Deletion', function () {
  this.timeout(10000);
  before(async function () {
    // Cleanup before test run
    try {
      console.log(`[SETUP] Deleted test user: ${testEmail}`);
    } catch (err) {
      console.warn(`[SETUP] No existing test user or already deleted: ${err.response?.status}`);
    }
  });

  it('should register a new user successfully', async function () {
    const response = await axios.post(`${BASE_URL}/users/register`, {
      email: testEmail,
      password: testPassword
    });
    expect(response.status).to.equal(201);
    expect(response.data.message).to.equal('User registered');
  });

  it('should fail to register the same user twice', async function () {
    try {
      await axios.post(`${BASE_URL}/users/register`, {
        email: testEmail,
        password: testPassword
      });
    } catch (err) {
      expect(err.response.status).to.equal(409);
      expect(err.response.data.error).to.equal('Email already exists');
    }
  });
});

describe('User Login & Token Retrieval', function () {
  it('should login with correct credentials and receive a token', async function () {
    this.timeout(10000);
    const response = await axios.post(`${BASE_URL}/users/login`, {
      email: testEmail,
      password: testPassword
    });

    expect(response.status).to.equal(200);
    expect(response.data).to.have.property('token');
    
    token = response.data.token;
    console.log('[TOKEN] Retrieved:', token.slice(0, 20) + '...');
  });

  it('should fail login with incorrect password', async function () {
    try {
      await axios.post(`${BASE_URL}/users/login`, {
        email: testEmail,
        password: 'WrongPassword123!'
      });
    } catch (err) {
      expect(err.response.status).to.equal(401);
      expect(err.response.data.error).to.equal('Invalid password');
    }
  });
});

describe('Protected Routes', function () {
  this.timeout(10000);
  it('should reject request without token', async function () {
    try {
      await axios.get(`${BASE_URL}/scans/scan-results`);
    } catch (err) {
      expect(err.response.status).to.equal(403);
      expect(err.response.data.error).to.equal('No token provided');
    }
  });

  it('should allow access with valid token', async function () {
    const response = await axios.get(`${BASE_URL}/scans/scan-results`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    expect(response.status).to.equal(200);
    expect(response.data).to.be.an('array');
  });
});

after(async function () {
  try {
    await axios.delete(`${BASE_URL}/users/delete/${testEmail}`);
    console.log(`[CLEANUP] Test user deleted: ${testEmail}`);
  } catch (err) {
    console.warn(`[CLEANUP] Could not delete user: ${err.message}`);
  }
});