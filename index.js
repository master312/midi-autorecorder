// index.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const database = require('./src/database');
const midiService = require('./src/midiService');
const recordingService = require('./src/recordingService');
const storageService = require('./src/storageService');

const BACKEND_PORT = 6676;
const FRONTEND_PORT = 8090;

// Initialize backend app
const backendApp = express();
backendApp.use(cors());
backendApp.use(express.json());

// Initialize frontend app
const frontendApp = express();
frontendApp.use(express.static(path.join(__dirname, 'public')));

// API Routes
// Device endpoints
backendApp.get('/api/devices', async (req, res) => {
    try {
        const devices = await midiService.getAvailableDevices();
        res.json(devices);
    } catch (error) {
        console.error('Failed to list devices:', error);
        res.status(500).json({ error: 'Failed to list MIDI devices' });
    }
});

backendApp.post('/api/devices/connect', async (req, res) => {
    try {
        const { portNumber, deviceName } = req.body;
        await midiService.openDevice(portNumber, deviceName);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to connect device:', error);
        res.status(500).json({ error: 'Failed to connect MIDI device' });
    }
});

backendApp.post('/api/devices/disconnect', async (req, res) => {
    try {
        midiService.closeDevice();
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to disconnect device:', error);
        res.status(500).json({ error: 'Failed to disconnect MIDI device' });
    }
});

// Recording endpoints
backendApp.get('/api/recordings', async (req, res) => {
    try {
        const recordings = await storageService.listRecordings();
        res.json(recordings);
    } catch (error) {
        console.error('Failed to list recordings:', error);
        res.status(500).json({ error: 'Failed to list recordings' });
    }
});

backendApp.post('/api/recordings/hook', async (req, res) => {
    try {
        const result = await recordingService.hookForRecording();
        res.json(result);
    } catch (error) {
        console.error('Failed to hook for recording:', error);
        res.status(500).json({ error: 'Failed to hook for recording' });
    }
});

backendApp.post('/api/recordings/unhook', async (req, res) => {
    try {
        const result = await recordingService.unhookForRecording();
        res.json(result);
    } catch (error) {
        console.error('Failed to unhook from recording:', error);
        res.status(500).json({ error: 'Failed to unhook from recording' });
    }
});

backendApp.get('/api/recordings/:id/download', async (req, res) => {
    try {
        const filePath = await storageService.getRecordingPath(req.params.id);
        res.download(filePath);
    } catch (error) {
        console.error('Failed to download recording:', error);
        res.status(500).json({ error: 'Failed to download recording' });
    }
});

// Status endpoint
backendApp.get('/api/status', (req, res) => {
    try {
        const status = recordingService.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Failed to get status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// Start frontend server
frontendApp.listen(FRONTEND_PORT, () => {
    console.log(`Frontend Server listening on port ${FRONTEND_PORT}`);
});

// Start backend server with WebSocket
const server = backendApp.listen(BACKEND_PORT, () => {
    console.log(`Backend Server listening on port ${BACKEND_PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    // Send initial status
    ws.send(JSON.stringify({
        type: 'status',
        data: recordingService.getStatus()
    }));

    // Handle MIDI activity
    const midiActivityHandler = () => {
        ws.send(JSON.stringify({
            type: 'midiActivity',
            timestamp: Date.now()
        }));
    };

    // Handle device events
    const deviceErrorHandler = (error) => {
        ws.send(JSON.stringify({
            type: 'deviceError',
            error: error
        }));
    };

    const recordingErrorHandler = (error) => {
        ws.send(JSON.stringify({
            type: 'recordingError',
            error: error
        }));
    };

    const recordingStoppedHandler = (data) => {
        ws.send(JSON.stringify({
            type: 'recordingStopped',
            data: data
        }));
    };

    const hookStatusChangedHandler = (data) => {
        ws.send(JSON.stringify({
            type: 'hookStatusChanged',
            data: data
        }));
    };

    // Send status updates every second if recording
    const statusInterval = setInterval(() => {
        const status = recordingService.getStatus();
        if (status.isRecording || status.isHookedForRecording) {
            ws.send(JSON.stringify({
                type: 'status',
                data: status
            }));
        }
    }, 1000);

    // Register event listeners
    midiService.on('midiActivity', midiActivityHandler);
    midiService.on('deviceError', deviceErrorHandler);
    recordingService.on('recordingError', recordingErrorHandler);
    midiService.on('recordingStopped', recordingStoppedHandler);
    midiService.on('hookStatusChanged', hookStatusChangedHandler);

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        // Remove all event listeners
        midiService.removeListener('midiActivity', midiActivityHandler);
        midiService.removeListener('deviceError', deviceErrorHandler);
        recordingService.removeListener('recordingError', recordingErrorHandler);
        midiService.removeListener('recordingStopped', recordingStoppedHandler);
        midiService.removeListener('hookStatusChanged', hookStatusChangedHandler);
        clearInterval(statusInterval);
    });
});

// Initialize database
database.initialize().catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Attempt to clean up
    midiService.closeDevice();
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// process.on('SIGTERM', () => {
//     console.log('SIGTERM received. Cleaning up...');
//     midiService.closeDevice();
//     server.close(() => {
//         console.log('Server closed. Exiting...');
//         process.exit(0);
//     });
// });

// process.on('SIGINT', () => {
//     console.log('SIGINT received. Cleaning up...');
//     midiService.closeDevice();
//     server.close(() => {
//         console.log('Server closed. Exiting...');
//         process.exit(0);
//     });
// });
