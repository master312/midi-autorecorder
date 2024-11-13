// script.js

// Configuration
const API_URL = 'http://localhost:6676/api';
const WS_URL = 'ws://localhost:6676';

// DOM Elements
const deviceError = document.getElementById('deviceError');
const recordButton = document.getElementById('recordButton');
const hookButton = document.getElementById('hookButton');
const unhookButton = document.getElementById('unhookButton');
const deviceSelect = document.getElementById('deviceSelect');
const midiIndicator = document.getElementById('midiIndicator');
const lastRecording = document.getElementById('lastRecording');
const lastRecordingName = document.getElementById('lastRecordingName');
const recordingsList = document.getElementById('recordingsList');
const downloadButton = document.getElementById('downloadButton');
const playButton = document.getElementById('playButton');
const recordingTimer = document.getElementById('recordingTimer');

// State
let isRecording = false;
let isHooked = false;
let selectedRecording = null;
let ws = null;
let recordings = [];

// WebSocket Setup
function setupWebSocket() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('WebSocket connected');
        deviceError.classList.remove('visible');
    };

    let firstStatus = true
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
            case 'midiActivity':
                showMidiActivity();
                break;
            case 'status':
                // if (firstStatus) {
                //     firstStatus = false
                //     if (status.isHookedForRecording) {
                //         startHookUI()
                //     } else {
                //         stopHookUI()
                //     }
                // }

                updateStatusFromServer(data.data);
                break;
            case 'deviceError':
                handleDeviceError(data.error);
                break;
            case 'deviceConnected':
                deviceError.classList.remove('visible');
                break;
            case 'deviceDisconnected':
                if (isHooked) {
                    handleDeviceError('Device disconnected');
                }
                break;
            case 'recordingStopped':
                if (data.reason === 'inactivity') {
                    console.log('Recording stopped due to inactivity');
                    // fetchRecordings();
                }

                setTimeout(() => fetchRecordings(), 1000)
                break;
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected. Retrying in 5s...');
        setTimeout(setupWebSocket, 5000);
    };
}

// Error Handling
function handleDeviceError(error) {
    deviceError.classList.add('visible');
    deviceError.textContent = typeof error === 'string' ? error : 'Device error occurred';
    stopHookUI();
}

// API Functions
async function fetchDevices() {
    try {
        const response = await fetch(`${API_URL}/devices`);
        if (!response.ok) throw new Error(`Failed to fetch devices: ${response.statusText}`);
        const devices = await response.json();
        populateDeviceSelect(devices);
    } catch (error) {
        console.error('Failed to fetch devices:', error);
        handleDeviceError('Failed to fetch MIDI devices');
    }
}

async function connectDevice(portNumber, deviceName) {
    try {
        const response = await fetch(`${API_URL}/devices/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                portNumber: parseInt(portNumber, 10),
                deviceName 
            })
        });
        if (!response.ok) throw new Error(`Failed to connect device: ${response.statusText}`);
        deviceError.classList.remove('visible');
        return await response.json();
    } catch (error) {
        console.error('Failed to connect device:', error);
        handleDeviceError('Failed to connect MIDI device');
        throw error;
    }
}

async function fetchRecordings() {
    try {
        const response = await fetch(`${API_URL}/recordings`);
        if (!response.ok) throw new Error(`Failed to fetch recordings: ${response.statusText}`);
        const recordings = await response.json();
        updateRecordingsList(recordings);
    } catch (error) {
        console.error('Failed to fetch recordings:', error);
        handleDeviceError('Failed to fetch recordings');
    }
}

async function startServerRecording() {
    try {
        const response = await fetch(`${API_URL}/recordings/start`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error(`Failed to start recording: ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.error('Failed to start recording:', error);
        handleDeviceError('Failed to start recording');
        throw error;
    }
}

async function stopServerRecording() {
    try {
        const response = await fetch(`${API_URL}/recordings/stop`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error(`Failed to stop recording: ${response.statusText}`);
        const result = await response.json();
        await fetchRecordings();
        return result;
    } catch (error) {
        console.error('Failed to stop recording:', error);
        handleDeviceError('Failed to stop recording');
        throw error;
    }
}

async function toggleHookRecording() {
    if (!isHooked) {
        try {
            const response = await fetch(`${API_URL}/recordings/hook`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to hook for recording');
            startHookUI();
        } catch (error) {
            console.error('Failed to hook for recording:', error);
            handleDeviceError('Failed to hook for recording');
        }
    } else {
        return // This button is not 'toggle' anymore
        try {
            const response = await fetch(`${API_URL}/recordings/unhook`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to unhook from recording');
            stopHookUI();
        } catch (error) {
            console.error('Failed to unhook from recording:', error);
            handleDeviceError('Failed to unhook from recording');
        }
    }
}

// UI Functions
function populateDeviceSelect(devices) {
    deviceSelect.innerHTML = '<option value="">Select device</option>';
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.portNumber.toString();
        option.textContent = device.name;
        option.dataset.portNumber = device.portNumber;
        deviceSelect.appendChild(option);
    });
}

function updateRecordingsList(newRecordings) {
    recordings = newRecordings;
    recordingsList.innerHTML = '';
    console.log("Updating recordings list...")
    recordings.forEach(recording => {
        const div = document.createElement('div');
        div.className = 'recording-item';
        if (selectedRecording && selectedRecording.id === recording.id) {
            div.classList.add('selected');
        }

        const filenameSpan = document.createElement('span');
        filenameSpan.textContent = recording.filename;

        const durationSpan = document.createElement('span');
        durationSpan.className = 'recording-duration';
        durationSpan.textContent = formatTime(recording.duration || 0);

        div.appendChild(filenameSpan);
        div.appendChild(durationSpan);
        div.onclick = () => selectRecording(recording);
        recordingsList.appendChild(div);
    });
}

function showMidiActivity() {
    midiIndicator.classList.add('active');
    setTimeout(() => {
        midiIndicator.classList.remove('active');
    }, 150);
}

function startHookUI() {
    isHooked = true;
    hookButton.classList.add('active');
    hookButton.querySelector('.button-content').innerHTML = `
        <div class="hook-dot"></div>
        Waiting for MIDI...
    `;
    recordButton.style.display = 'none';
    deviceSelect.disabled = true;
    hookButton.disabled = true
    unhookButton.style.display = 'block'; // Show unhook button
}

// Modify stopHookUI function
function stopHookUI() {
    isHooked = false;
    hookButton.classList.remove('active');
    hookButton.querySelector('.button-content').innerHTML = `
        <div class="hook-dot"></div>
        Hook for Recording
    `;
    recordButton.style.display = 'block';
    deviceSelect.disabled = false;
    unhookButton.style.display = 'none'; // Hide unhook button
}

async function handleUnhook() {
    if (confirm('Are you sure you want to unhook the device? This will stop any ongoing recording.')) {
        try {
            const response = await fetch(`${API_URL}/recordings/unhook`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error('Failed to unhook from recording');
            stopHookUI();
        } catch (error) {
            console.error('Failed to unhook from recording:', error);
            handleDeviceError('Failed to unhook from recording');
        }
    }
}

function startRecordingUI() {
    isRecording = true;
    if (isHooked) {
        hookButton.querySelector('.button-content').innerHTML = `
            <div class="hook-dot"></div>
            Recording...
        `;
    } else {
        // recordButton.classList.add('recording');
        // recordButton.querySelector('.button-content').innerHTML = `
        //     <div class="record-dot"></div>
        //     Stop Recording
        // `;
    }
}

function stopRecordingUI() {
    isRecording = false;
    if (isHooked) {
        hookButton.querySelector('.button-content').innerHTML = `
            <div class="hook-dot"></div>
            Waiting for MIDI...
        `;
    } else {
        recordButton.classList.remove('recording');
        recordButton.querySelector('.button-content').innerHTML = `
            <div class="record-dot"></div>
            Start Recording
        `;
    }
    recordingTimer.textContent = '00:00';
}

function updateStatusFromServer(status) {
    console.log("New status: ")
    console.log(status)
    if (status.lastRecording) {
        lastRecordingName.textContent = status.lastRecording.filename;
        lastRecording.classList.remove('hidden');
    }

    if (status.isRecording) {
        recordingTimer.textContent = formatTime(status.recordingDuration);
    }

    if (status.isHookedForRecording !== isHooked) {
        if (status.isHookedForRecording) {
            startHookUI();
            console.log("Hooked to: " + status.connectedDevice)

            for (let i = 0; i < deviceSelect.options.length; i++) {
                if (deviceSelect.options[i].text == status.connectedDevice) {
                    deviceSelect.value = i - 1;
                    break;    
                }
                
            }
        } else {
            stopHookUI();
        }
    }

    if (status.isRecording && !isRecording) {
        startRecordingUI();
    } else if (!status.isRecording && isRecording) {
        stopRecordingUI();
    }
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function selectRecording(recording) {
    selectedRecording = recording;
    updateRecordingsList(recordings);
    downloadButton.disabled = false;
    playButton.disabled = false;
}

// Event Handlers
async function handleDeviceChange() {
    const portNumber = deviceSelect.value;
    const deviceName = deviceSelect.options[deviceSelect.selectedIndex].text;
    
    if (portNumber) {
        try {
            await connectDevice(portNumber, deviceName);
            recordButton.disabled = false;
            hookButton.disabled = false;
        } catch (error) {
            deviceSelect.value = "";
            recordButton.disabled = true;
            hookButton.disabled = true;
        }
    } else {
        recordButton.disabled = true;
        hookButton.disabled = true;
    }
}

async function toggleRecording() {
    if (!isRecording) {
        try {
            const result = await startServerRecording();
            if (result.success) {
                startRecordingUI();
            }
        } catch (error) {
            stopRecordingUI();
        }
    } else {
        try {
            const result = await stopServerRecording();
            if (result) {
                stopRecordingUI();
            }
        } catch (error) {
            startRecordingUI();
        }
    }
}

function handleDownload() {
    if (selectedRecording) {
        window.location.href = `${API_URL}/recordings/${selectedRecording.id}/download`;
    }
}

function handlePlay() {
    if (selectedRecording) {
        console.log('Play functionality not implemented');
        alert('Play functionality is not implemented yet');
    }
}

// Initialize
async function initialize() {
    recordButton.disabled = true;
    hookButton.disabled = true;
    
    try {
        await fetchDevices();
        await fetchRecordings();
        setupWebSocket();

        // Event listeners
        deviceSelect.addEventListener('change', handleDeviceChange);
        hookButton.addEventListener('click', toggleHookRecording);
        unhookButton.addEventListener('click', handleUnhook);
        recordButton.addEventListener('click', toggleRecording);
        downloadButton.addEventListener('click', handleDownload);
        playButton.addEventListener('click', handlePlay);
    } catch (error) {
        console.error('Failed to initialize application:', error);
        handleDeviceError('Failed to initialize application');
    }
}

// Start the application
initialize();