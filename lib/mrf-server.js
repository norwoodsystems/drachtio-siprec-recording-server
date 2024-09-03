const WebSocket = require('ws');
const readline = require('readline');
const port = process.env.PORT || 8081;

const wss = new WebSocket.Server({ port }, (error) => {
  if (error) {
    console.error('Failed to start WebSocket server:', error);
    process.exit(1);
  }
});

console.log(`MRF server is running on ws://localhost:${port}`);

// Create readline interface for console input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const clients = new Set();

wss.on('connection', (ws, req) => {
  console.log('New client connected');
  clients.add(ws);

  // Print all headers
  console.log('WebSocket connection headers:');
  console.log(req.headers);

  const callId = req.headers['call-id'];
  if (callId) {
    console.log('Call-ID:', callId);
  } else {
    console.log('No Call-ID header found');
  }

  ws.on('message', (message) => {
    console.log('Received:', message);
    // Handle any incoming messages if needed
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Function to send command to all connected clients
function sendCommandToClients(command) {
  const message = { type: command };
  clients.forEach((client) => {
    client.send(JSON.stringify(message));
  });
  console.log(`Sent ${command} command to all clients`);
}

// Console input handler
function handleConsoleInput() {
  rl.question('Enter command (start/stop): ', (input) => {
    if (input.toLowerCase() === 'start') {
      sendCommandToClients('record-start');
    } else if (input.toLowerCase() === 'stop') {
      sendCommandToClients('record-stop');
    } else {
      console.log('Invalid command. Please enter "start" or "stop".');
    }
    handleConsoleInput(); // Continue listening for input
  });
}

// Start listening for console input
handleConsoleInput();
