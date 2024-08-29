const WebSocket = require('ws');
const port = 8081;

const wss = new WebSocket.Server({ port });

console.log(`MRF server is running on ws://localhost:${port}`);

wss.on('connection', (ws) => {
  console.log('New client connected');

  // Send start_recording command immediately upon connection
  const startRecordingMessage = {
    type: 'start_recording'
  };
  ws.send(JSON.stringify(startRecordingMessage));
  console.log('Sent start_recording command');

  // Simulate AI decision-making
  let isRecording = true;  // Set to true since we start recording immediately

  const simulateAIDecision = () => {
    const decision = Math.random() > 0.5;
    if (decision !== isRecording) {
      isRecording = decision;
      const message = {
        type: isRecording ? 'start_recording' : 'stop_recording'
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
