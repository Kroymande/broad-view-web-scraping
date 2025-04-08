require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

async function connectToDb() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  return { db: client.db(DB_NAME), client };
}

module.exports = { connectToDb };