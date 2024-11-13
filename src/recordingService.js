// src/recordingService.js
const midiService = require('./midiService');
const storageService = require('./storageService');
const { EventEmitter } = require('events');

class RecordingService extends EventEmitter {
    constructor() {
        super();
        this.lastRecording = null;
        
        midiService.on('deviceDisconnected', () => {
            if (this.getStatus().isHookedForRecording) {
                this.emit('recordingError', { 
                    type: 'deviceDisconnected',
                    message: 'Device disconnected while hooked for recording'
                });
            }
        });

        midiService.on('recordingStopped', async (data) => {
            try {
                await this.saveRecording(data.recordingData);
            } catch (error) {
                console.error('Failed to save recording:', error);
                this.emit('recordingError', {
                    type: 'saveFailed',
                    message: 'Failed to save recording'
                });
            }
        });
    }

    async startRecording() {
        try {
            const recording = midiService.startRecording();
            return {
                success: true,
                message: 'Recording started',
                startTime: recording.startTime
            };
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    async stopRecording() {
        try {
            const recordingData = midiService.stopRecording();
            return await this.saveRecording(recordingData);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            throw error;
        }
    }

    async saveRecording(recordingData) {
        const savedRecording = await storageService.saveRecording(
            recordingData.tempFile,
            { name: recordingData.deviceName }
        );

        await storageService.updateRecordingDuration(
            savedRecording.id,
            recordingData.duration
        );

        this.lastRecording = {
            ...savedRecording,
            duration: recordingData.duration
        };

        return this.lastRecording;
    }

    async hookForRecording() {
        try {
            await midiService.hookForRecording();
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async unhookForRecording() {
        try {
            midiService.unhookForRecording();
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    getStatus() {
        const midiStatus = midiService.getStatus();
        
        return {
            isDeviceConnected: midiStatus.isDeviceConnected,
            connectedDevice: midiStatus.connectedDevice,
            isRecording: midiStatus.isRecording,
            isHookedForRecording: midiStatus.isHookedForRecording,
            recordingDuration: midiStatus.isRecording ? 
                Math.floor((Date.now() - midiStatus.recordingStartTime) / 1000) : 0,
            lastRecording: this.lastRecording
        };
    }
}

module.exports = new RecordingService();
