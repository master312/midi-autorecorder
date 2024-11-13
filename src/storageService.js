// src/services/storageService.js
const fs = require('fs').promises;
const path = require('path');
const database = require('./database');
const { v4: uuidv4 } = require('uuid');

class StorageService {
    constructor() {
        this.recordingsPath = "recordings";
        this.ensureRecordingDirectory();
    }

    async ensureRecordingDirectory() {
        try {
            await fs.mkdir(this.recordingsPath, { recursive: true });
        } catch (error) {
            console.error('Failed to create recordings directory:', error);
            throw error;
        }
    }

    async saveRecording(tempFile, deviceInfo) {
        const db = await database.getDb();
        const recordingId = uuidv4();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${timestamp}.mid`;
        const filePath = path.join(this.recordingsPath, filename);

        try {
            // Move temp file to final location
            await fs.copyFile(tempFile, filePath);
            await fs.unlink(tempFile);  // Clean up temp file
            
            const stats = await fs.stat(filePath);

            await db.run(
                `INSERT INTO recordings (
                    id, filename, original_filename, device_name,
                    file_size, created_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    recordingId,
                    filename,
                    filename,
                    deviceInfo.name,
                    stats.size
                ]
            );

            return {
                id: recordingId,
                filename,
                fileSize: stats.size
            };
        } catch (error) {
            console.error('Failed to save recording:', error);
            throw error;
        }
    }
    
    async listRecordings() {
        const db = await database.getDb();
        try {
            return await db.all(`
                SELECT 
                    id, filename, device_name, duration, 
                    created_at, file_size, midi_events_count
                FROM recordings 
                ORDER BY created_at DESC
            `);
        } catch (error) {
            logger.error('Failed to list recordings:', error);
            throw error;
        }
    }

    async getRecordingPath(recordingId) {
        const db = await database.getDb();
        try {
            const recording = await db.get(
                'SELECT filename FROM recordings WHERE id = ?',
                recordingId
            );

            if (!recording) {
                throw new Error('Recording not found');
            }

            return path.join(this.recordingsPath, recording.filename);
        } catch (error) {
            console.log('Failed to get recording path:', error);
            throw error;
        }
    }

    async updateRecordingDuration(recordingId, duration) {
        const db = await database.getDb();
        try {
            await db.run(
                'UPDATE recordings SET duration = ? WHERE id = ?',
                [duration, recordingId]
            );
        } catch (error) {
            console.log('Failed to update recording duration:', error);
            throw error;
        }
    }
}

module.exports = new StorageService();
