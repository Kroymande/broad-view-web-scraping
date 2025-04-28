const axios = require('axios');
const chai = require('chai');
const expect = chai.expect;

const BASE_URL = 'http://localhost:3000/api';
const testEmail = 'testuser@example.com';
const testPassword = 'TestPassword123!';
let token;

describe('Scraping API Tests', function () {
  this.timeout(600000); // Longer timeout because scraping takes a few seconds

  before(async function () {
    // Create test user and login
    try {
      await axios.delete(`${BASE_URL}/users/delete/${testEmail}`);
    } catch (err) {
      console.warn(`[SETUP] Test user cleanup: ${err.response?.status}`);
    }

    // Register new user
    await axios.post(`${BASE_URL}/users/register`, {
      email: testEmail,
      password: testPassword
    });

    // Login to get token
    const response = await axios.post(`${BASE_URL}/users/login`, {
      email: testEmail,
      password: testPassword
    });
    token = response.data.token;
    console.log('[TOKEN] Retrieved for scraping tests:', token.slice(0, 20) + '...');
  });

  it('should successfully scrape a valid website', async function () {
    const scrapeResponse = await axios.post(`${BASE_URL}/scrape/scrape`, {
      url: 'https://www.mongodb.com'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(scrapeResponse.status).to.equal(200);
    expect(scrapeResponse.data).to.have.property('title');
    expect(scrapeResponse.data).to.have.property('metaDescription');
    expect(scrapeResponse.data).to.have.property('headers');
    expect(scrapeResponse.data.totalLinks).to.be.a('number');
    expect(scrapeResponse.data.url).to.include('mongodb.com');
    console.log('[SCRAPE] Scraped title:', scrapeResponse.data.title);
  });

  it('should reject invalid URL input', async function () {
    try {
      await axios.post(`${BASE_URL}/scrape/scrape`, {
        url: 'invalid-url'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      expect(err.response.status).to.equal(400);
      expect(err.response.data.error).to.include('Invalid or missing URL');
    }
  });

  it('should reject scraping without token', async function () {
    try {
      await axios.post(`${BASE_URL}/scrape/scrape`, {
        url: 'https://www.mongodb.com'
      });
    } catch (err) {
      expect(err.response.status).to.equal(403);
      expect(err.response.data.error).to.include('No token provided');
    }
  });

  after(async function () {
    console.log('[CLEANUP] Starting cleanup...');
  
    try {
      // Delete the test user
      await axios.delete(`${BASE_URL}/users/delete/${testEmail}`);
      console.log('[CLEANUP] Test user deleted.');
  
    } catch (err) {
      console.warn(`[CLEANUP] Could not delete test user: ${err.response?.data?.error || err.message}`);
    }
  
    try {
      // Delete the test scraped result
      const { connectToDb } = require('../db/dbConnect');
      const { db, client } = await connectToDb();
  
      const deleteResult = await db.collection('scan_results').deleteMany({
        url: { $regex: 'mongodb.com' }
      });
      console.log(`[CLEANUP] Deleted ${deleteResult.deletedCount} scraped entries for mongodb.com.`);
  
      await client.close();
    } catch (err) {
      console.warn(`[CLEANUP] Could not delete scraped data: ${err.message}`);
    }
  
    console.log('[CLEANUP] Cleanup finished.');
  });  
});
