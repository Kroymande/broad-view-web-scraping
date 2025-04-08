const { getCentralTime } = require('../scraper/utils');

async function logErrorToDb(db, message, link = '', retries = 0) {
    await db.collection('scan_logs').insertOne({
        timestamp: getCentralTime(),
        type: 'ERROR',
        message,
        link,
        retries
    });
}

async function logWarningToDb(db, message, link = '', retries = 0) {
    await db.collection('scan_logs').insertOne({
        timestamp: getCentralTime(),
        type: 'WARNING',
        message,
        link,
        retries
    });
}

module.exports = { logErrorToDb, logWarningToDb };