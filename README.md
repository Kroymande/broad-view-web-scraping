# Broad View - AI-Assisted Website Service Analytics

## Project Overview

Broad View is a scalable and secure web application designed to automate the monitoring of website integrity and performance. The application focuses on detecting dead links, collecting website metadata, and providing actionable insights for SEO optimization. Targeted at IT administrators and digital marketers, this tool streamlines website maintenance, reduces manual effort, and enhances the overall health of online assets.

---

## Features

- **Automated Dead Link Detection**: Efficiently scans websites for broken links and generates comprehensive reports.
- **Metadata Collection**: Extracts key metadata such as page titles, descriptions, canonical tags, and HTTP status codes.
- **User Authentication**: Secure login and token-protected APIs for scanning and retrieving scan results.
- **User-Friendly Interface**: Provides real-time analytics and visualizations through a responsive web-based dashboard.
- **Customizable Scanning**: Allows users to configure scan frequency, exclude specific URLs, and set alert thresholds.
- **Secure and Scalable Architecture**: Utilizes a self-expanding MongoDB database with robust authentication and indexing.

---

## Tech Stack

- **Frontend**: React.js
- **Backend**: Node.js with Express.js
- **Database**: MongoDB (Atlas Cloud)
- **Web Scraping**: Puppeteer
- **Authentication**: JWT (JSON Web Tokens)
- **Testing**: Mocha and Chai
- **Other Tools**: MongoDB Compass, Postman, ESLint

---

## Backend Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Kroymande/broad-view-web-scraping.git
cd broad-view-web-scraping
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a .env file in the root directory and add:

```env
MONGO_URI=your-mongodb-atlas-uri
DB_NAME=WebScraping_Database
PORT=3000
JWT_SECRET=your-very-secure-jwt-secret
```

### 4. Starting the Server

```bash
npm start
```

The server will be running at:

```arduino
http://localhost:3000
```

## Running Backend Tests

We have two automated backend test files:

- **test_backend.js**: Tests user registration, login, token validation, and protected routes.
- **test_scrape.js**: Tests website scraping, invalid URL handling, and API security.

✅ Tests also automatically clean up all test users and scrape data after completion.

### To run all backend tests

**Step 1:** In one terminal window, start the server:

```bash
npm start
```

**Step 2:** In another terminal window, run:

```bash
npm test
```

Expected output:

- 9 passing tests
- Proper cleanup (no leftover test user or scraped test data)

---

## Backend Routes Overview

| Method | Route | Purpose |
|:------:|:-----|:--------|
| POST | `/api/users/register` | Register a new user |
| POST | `/api/users/login` | Login and retrieve a token |
| GET  | `/api/scans/scan-results` | Retrieve all past scans (token required) |
| GET  | `/api/scans/scan-results/:encodedUrl` | Retrieve a specific scan result by URL (token required) |
| POST | `/api/scrape/scrape` | Submit a website URL to scrape (token required) |
| GET  | `/api/health-check` | Server health check endpoint |

---

## Important Notes

- **Always start the server first (`npm start`) before running backend tests.**
- **Scraping real websites (e.g., mongodb.com) may take up to 10 minutes** to complete.
- **Test data cleanup is automatic** — the test user (`testuser@example.com`) and any scraped test data (`mongodb.com`) are deleted after tests finish.
- **Mocha `--exit` flag is used** to cleanly shut down test runs without hanging processes.

---

## Authors

| Name | Role |
|:-----|:-----|
| Christopher Carlson | Team Lead, Backend Developer |
| Nickolas Shtayn | Frontend Developer |
| Zak Garad | Database Developer |

---

## License

This project is licensed under the MIT License.

---
