require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;

(async () => {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('scan_results');

    const scansWithoutStatusCodes = await collection.find({ statusCodes: { $exists: false } }).toArray();
    console.log(`Found ${scansWithoutStatusCodes.length} documents to backfill...`);

    for (const scan of scansWithoutStatusCodes) {
      const statusSummary = {};

      (scan.deadLinks || []).forEach(link => {
        const code = link.status?.toString() || 'unknown';
        if (!statusSummary[code]) statusSummary[code] = 0;
        statusSummary[code]++;
      });

      await collection.updateOne(
        { _id: scan._id },
        { $set: { statusCodes: statusSummary } }
      );

      console.log(`✅ Backfilled scan for URL: ${scan.url}`);
    }

    console.log('🎉 Backfill completed.');
  } catch (err) {
    console.error('❌ Backfill error:', err);
  } finally {
    await client.close();
  }
})();