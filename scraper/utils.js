const os = require('os');

function getCentralTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });
}

function categorizeStatusCode(status) {
    if (status >= 200 && status < 300) return 'valid';
    if (status >= 300 && status < 400) return 'redirect';
    if (status >= 400 && status < 500) return 'client_error';
    if (status >= 500) return 'server_error';
    return 'unknown';
}

function determineBatchSize() {
    const mem = os.totalmem();
    const cores = os.cpus().length;
    const load = os.loadavg()[0];
    if (load > cores * 0.75) return 15;
    if (mem > 16e9) return 50;
    if (mem > 8e9) return 30;
    if (cores > 4) return 25;
    return 20;
}

module.exports = { getCentralTime, categorizeStatusCode, determineBatchSize };