const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'records.json');

// Helper to get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ((iface.family === 'IPv4' || iface.family === 4) && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();

// Load records from local JSON file if exists, otherwise empty array
let records = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    records = JSON.parse(raw);
    console.log(`[Server] Loaded ${records.length} records from ${DATA_FILE}`);
  }
} catch (err) {
  console.error('[Server] Error reading data file:', err);
}

// Helper to save records to JSON file
function saveRecords() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving data file:', err);
  }
}

// Serve static files from the current root directory
app.use(express.static(__dirname));
app.use(express.json());

// API endpoints
app.get('/api/records', (req, res) => {
  res.json(records);
});

// WebSocket Server Logic
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send current state on connection
  ws.send(JSON.stringify({
    type: 'init',
    data: {
      records: records,
      localIp: LOCAL_IP,
      port: PORT
    }
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      console.log(`[WS] Received action: ${parsed.type}`);
      handleAction(parsed, ws);
    } catch (err) {
      console.error('[WS] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });
});

function broadcast(type, data, excludeClient) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function handleAction(action, ws) {
  const { type, data } = action;

  switch (type) {
    case 'SYNC_STATE':
      // Overwrite server records with client records (for master updates/sync)
      if (Array.isArray(data)) {
        records = data;
        saveRecords();
        broadcast('STATE_UPDATE', records, ws);
      }
      break;

    default:
      console.warn(`[WS] Unknown action type: ${type}`);
  }
}

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🌳 愛玉樹種記錄系統伺服器已啟動！`);
  console.log(`💻 電腦端/行動端: http://localhost:${PORT}`);
  console.log(`📱 區域網路連線: http://${LOCAL_IP}:${PORT}`);
  console.log(`=========================================`);
});
