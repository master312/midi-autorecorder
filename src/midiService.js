const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

class MidiService extends EventEmitter {
    constructor() {
        super();
        this.activeDevice = null;
        this.recordProcess = null;
        this.isHookedForRecording = false;
        this.currentRecording = null;
        this.lastMidiTimestamp = null;
        this.INACTIVITY_TIMEOUT = 3000;
        
        // Monitor MIDI activity using aseqdump
        this.midiMonitor = null;
    }

    async getAvailableDevices() {
        try {
            const { stdout } = await exec('arecordmidi -l');
            const devices = [];
            
            // Parse arecordmidi -l output
            // Format: port    client name
            const lines = stdout.split('\n').filter(line => line.trim());
            for (const line of lines) {
                const match = line.match(/(\d+:\d+)\s+(.+)/);
                if (match) {
                    devices.push({
                        portNumber: match[1],
                        name: match[2].trim()
                    });
                }
            }
            
            return devices;
        } catch (error) {
            console.error('Failed to get available devices:', error);
            throw error;
        }
    }

    async openDevice(portNumber, deviceName) {
        if (this.activeDevice) {
            this.closeDevice();
        }

        try {
            // Start aseqdump to monitor MIDI activity
            this.midiMonitor = spawn('aseqdump', ['-p', portNumber]);
            
            this.midiMonitor.stdout.on('data', (data) => {
                this.handleMidiActivity(data.toString());
            });

            this.midiMonitor.stderr.on('data', (data) => {
                console.error(`aseqdump stderr: ${data}`);
            });

            this.activeDevice = {
                portNumber,
                name: deviceName
            };

            this.emit('deviceConnected', { deviceName, portNumber });
            return true;
        } catch (error) {
            this.emit('deviceError', { error: error.message });
            throw error;
        }
    }

    closeDevice() {
        if (this.midiMonitor) {
            this.midiMonitor.kill();
            this.midiMonitor = null;
        }
        
        if (this.recordProcess) {
            this.stopRecording();
        }
        
        this.activeDevice = null;
        this.emit('deviceDisconnected');
    }

    handleMidiActivity(data) {
        // aseqdump outputs MIDI events in text format
        this.emit('midiActivity', { data });
        
        const now = Date.now();
        this.lastMidiTimestamp = now;

        if (this.isHookedForRecording && !this.currentRecording) {
            this.startRecording();
        }

        if (this.currentRecording) {
            this.resetInactivityTimeout();
        }
    }

    startRecording() {
        if (!this.activeDevice) {
            throw new Error('No device connected');
        }

        this.clearInactivityTimeout();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tempFile = `/tmp/midi-recording-${timestamp}.mid`;

        this.recordProcess = spawn('arecordmidi', [
            '-p', this.activeDevice.portNumber,
            tempFile
        ]);

        this.currentRecording = {
            startTime: Date.now(),
            deviceName: this.activeDevice.name,
            tempFile
        };

        this.resetInactivityTimeout();
        console.log(`Started recording on ${this.activeDevice.name}`);
        return this.currentRecording;
    }

    stopRecording() {
        this.clearInactivityTimeout();

        if (!this.currentRecording) {
            throw new Error('No active recording');
        }

        // Send SIGTERM to arecordmidi
        this.recordProcess.kill();
        
        const recordingData = {
            duration: (Date.now() - this.currentRecording.startTime) / 1000,
            deviceName: this.currentRecording.deviceName,
            tempFile: this.currentRecording.tempFile
        };

        this.recordProcess = null;
        this.currentRecording = null;
        
        console.log(`Stopped recording on ${this.activeDevice.name}`);
        return recordingData;
    }

    // ... rest of the methods remain similar but simplified ...
    hookForRecording() {
        if (!this.activeDevice) {
            throw new Error('No device connected');
        }
        
        this.isHookedForRecording = true;
        this.emit('hookStatusChanged', { isHooked: true });
    }

    unhookForRecording() {
        this.isHookedForRecording = false;
        if (this.currentRecording) {
            const recordingData = this.stopRecording();
            this.emit('recordingStopped', { 
                reason: 'unhook',
                recordingData 
            });
        }
        this.clearInactivityTimeout();
        this.emit('hookStatusChanged', { isHooked: false });
    }

    resetInactivityTimeout() {
        this.clearInactivityTimeout();
        
        this.autoRecordingTimeout = setTimeout(() => {
            if (this.currentRecording) {
                try {
                    const recordingData = this.stopRecording();
                    if (this.isHookedForRecording) {
                        this.emit('recordingStopped', { 
                            reason: 'inactivity',
                            recordingData 
                        });
                    }
                } catch (error) {
                    console.error('Error stopping recording on inactivity:', error);
                    this.currentRecording = null;
                }
            }
        }, this.INACTIVITY_TIMEOUT);
    }

    clearInactivityTimeout() {
        if (this.autoRecordingTimeout) {
            clearTimeout(this.autoRecordingTimeout);
            this.autoRecordingTimeout = null;
        }
    }

    getStatus() {
        return {
            isDeviceConnected: !!this.activeDevice,
            connectedDevice: this.activeDevice ? this.activeDevice.name : null,
            isRecording: !!this.currentRecording,
            isHookedForRecording: this.isHookedForRecording,
            recordingStartTime: this.currentRecording ? this.currentRecording.startTime : null,
            lastMidiTimestamp: this.lastMidiTimestamp
        };
    }
}

module.exports = new MidiService();
