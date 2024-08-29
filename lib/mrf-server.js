const WebSocket = require('ws');
const port = process.env.PORT || 8081;

const wss = new WebSocket.Server({ port }, (error) => {
  if (error) {
    console.error('Failed to start WebSocket server:', error);
    process.exit(1);
  }
});

console.log(`MRF server is running on ws://localhost:${port}`);

wss.on('connection', (ws) => {
  console.log('New client connected');

  // Add random 5 to 10 second wait before sending startRecording
  const randomDelay = Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000;
  setTimeout(() => {
    const startRecordingMessage = {
      type: 'startRecording'
    };
    ws.send(JSON.stringify(startRecordingMessage));
    console.log(`Sent startRecording command after ${randomDelay / 1000} seconds`);

    // Set isRecording to true after sending the command
    isRecording = true;
  }, randomDelay);

  // Simulate AI decision-making
  let isRecording = false;  // Set to false initially

  const simulateAIDecision = () => {
    const decision = Math.random() > 0.5;
    if (decision !== isRecording) {
      isRecording = decision;
      const message = {
        type: isRecording ? 'startRecording' : 'stopRecording'
      };
      ws.send(JSON.stringify(message));
      console.log(`Sent ${message.type} command`);
    }
  };

  // Simulate AI making decisions every 10 seconds
  const interval = setInterval(simulateAIDecision, 10000);

  ws.on('message', (message) => {
    console.log('Received:', message);
    // Handle any incoming messages if needed
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});
