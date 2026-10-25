import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './db/index.js';
import { seedDatabase } from './seed/seedData.js';
import { handleApiRequest } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(__dirname, '../public');

// MIME types dictionary for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Ensure database is initialized & seeded if empty
const db = getDatabase();
const groupCount = db.prepare('SELECT COUNT(*) as count FROM chit_groups').get();
if (groupCount.count === 0) {
  console.log('⚡ Chit-Fund Database is empty. Running initial auto-seed...');
  seedDatabase(db);
}

const server = createServer(async (req, res) => {
  // CORS preflight & headers
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
    });
    return res.end();
  }

  // API routing
  if (req.url.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }

  // Static file serving
  try {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = join(PUBLIC_DIR, reqPath);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      return res.end(content);
    } else {
      // Fallback to index.html for Single Page Application navigation
      const indexPath = join(PUBLIC_DIR, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(content);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`
========================================================================
🚀 LOCAL CONNECTIVITY CHIT-FUND PLATFORM
========================================================================
✔ Server running at: http://localhost:${PORT}
✔ Architecture: Modular Monolith | Embedded Relational Database (SQLite)
✔ Double-Entry Accounting: Active & Verified
✔ Live Auction Engine: Active
✔ Ready for Member & Operations testing!

Demo Accounts (One-Click Available in Web App):
  - Member 1: Ramesh Kumar (+91 9876543210)
  - Member 2: Priya Sharma (+91 9876543211)
  - Member 3: Suresh Patel (+91 9876543212)
  - Group Organizer: Lakshmi Devi (+91 9876543220)
  - Field Collector: Anand Verma (+91 9876543230)
  - Operations Admin: Rajesh Nair (+91 9876543240)
  - Compliance Reviewer: Dr. Sunita Rao (+91 9876543250)
  - Finance Admin: Vikram Malhotra (+91 9876543260)
========================================================================
  `);
});

export default server;
