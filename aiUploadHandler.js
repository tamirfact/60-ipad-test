// AI Upload Handler - Centralized logic for sending content to AI
class AIUploadHandler {
    constructor(aiGenerator) {
        this.aiGenerator = aiGenerator;
        this.uploadLog = [];
    }

    /**
     * Handle AI upload for both long-tap and drag-to-corner behaviors
     * @param {DrawingManager} drawingManager - The drawing manager instance
     * @param {Array} draggedStrokes - Array of strokes/images to process
     * @param {string} triggerType - 'long-tap' or 'drag-to-corner'
     */
    async handleAIUpload(drawingManager, draggedStrokes, triggerType = 'unknown') {
        try {
            // Log the upload attempt
            this.logUploadAttempt(triggerType, draggedStrokes);
            
            // Check if we have both strokes and images (two-step process)
            const hasImages = draggedStrokes.some(stroke => stroke.type === 'image-object');
            const hasStrokes = draggedStrokes.some(stroke => stroke.type !== 'image-object');
            
            if (hasImages && hasStrokes) {
                // Two-step process: don't remove strokes yet, they'll be removed when user selects a chip
                this.logContentType('stroke+image', 'Two-step process - strokes will be removed after chip selection');
            } else if (hasStrokes) {
                // Single-step process: remove strokes immediately
                this.removeStrokesFromCanvas(drawingManager, draggedStrokes);
                this.logContentType('strokes-only', 'Single-step process - strokes removed immediately');
            } else if (hasImages) {
                // Image-only process
                this.logContentType('image-only', 'Image-only process');
            } else {
                this.logContentType('empty', 'No valid content to process');
                drawingManager.canvasManager.showToast('No content to process');
                return;
            }
            
            // Process with AI
            await this.aiGenerator.processDrawing(drawingManager, draggedStrokes);
            
            // Clear selections
            this.clearSelections(drawingManager);
            
            // Log successful processing
            this.logProcessingComplete(triggerType, draggedStrokes.length);
            
        } catch (error) {
            console.error('AI Upload Error:', error);
            this.logError(triggerType, error);
            drawingManager.canvasManager.showToast('AI processing failed');
        }
    }

    /**
     * Remove strokes from canvas (but keep images)
     * @param {DrawingManager} drawingManager - The drawing manager instance
     * @param {Array} draggedStrokes - Array of strokes to remove
     */
    removeStrokesFromCanvas(drawingManager, draggedStrokes) {
        const removedCount = draggedStrokes.filter(stroke => stroke.type !== 'image-object').length;
        
        draggedStrokes.forEach(stroke => {
            if (stroke.type !== 'image-object') {
                const index = drawingManager.strokes.indexOf(stroke);
                if (index > -1) {
                    drawingManager.strokes.splice(index, 1);
                }
            }
        });
        
        this.logStrokeRemoval(removedCount);
    }

    /**
     * Clear all selections
     * @param {DrawingManager} drawingManager - The drawing manager instance
     */
    clearSelections(drawingManager) {
        drawingManager.clearAllSelections();
        drawingManager.redraw();
    }

    /**
     * Log upload attempt
     * @param {string} triggerType - Type of trigger
     * @param {Array} draggedStrokes - Strokes being uploaded
     */
    logUploadAttempt(triggerType, draggedStrokes) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            triggerType,
            strokeCount: draggedStrokes.filter(s => s.type !== 'image-object').length,
            imageCount: draggedStrokes.filter(s => s.type === 'image-object').length,
            totalItems: draggedStrokes.length,
            action: 'upload_attempt'
        };
        
        this.uploadLog.push(logEntry);
        console.log('AI Upload Attempt:', logEntry);
    }

    /**
     * Log content type analysis
     * @param {string} contentType - Type of content
     * @param {string} description - Description of the process
     */
    logContentType(contentType, description) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            contentType,
            description,
            action: 'content_analysis'
        };
        
        this.uploadLog.push(logEntry);
        console.log('Content Analysis:', logEntry);
    }

    /**
     * Log stroke removal
     * @param {number} removedCount - Number of strokes removed
     */
    logStrokeRemoval(removedCount) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            removedCount,
            action: 'stroke_removal'
        };
        
        this.uploadLog.push(logEntry);
        console.log('Stroke Removal:', logEntry);
    }

    /**
     * Log processing completion
     * @param {string} triggerType - Type of trigger
     * @param {number} itemCount - Number of items processed
     */
    logProcessingComplete(triggerType, itemCount) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            triggerType,
            itemCount,
            action: 'processing_complete'
        };
        
        this.uploadLog.push(logEntry);
        console.log('Processing Complete:', logEntry);
    }

    /**
     * Log error
     * @param {string} triggerType - Type of trigger
     * @param {Error} error - Error object
     */
    logError(triggerType, error) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            triggerType,
            error: error.message,
            stack: error.stack,
            action: 'error'
        };
        
        this.uploadLog.push(logEntry);
        console.error('AI Upload Error:', logEntry);
    }

    /**
     * Get upload log
     * @returns {Array} Array of log entries
     */
    getUploadLog() {
        return this.uploadLog;
    }

    /**
     * Clear upload log
     */
    clearUploadLog() {
        this.uploadLog = [];
        console.log('Upload log cleared');
    }

    /**
     * Export upload log as JSON
     * @returns {string} JSON string of upload log
     */
    exportUploadLog() {
        return JSON.stringify(this.uploadLog, null, 2);
    }

    /**
     * Download upload log as file
     */
    downloadUploadLog() {
        const logData = this.exportUploadLog();
        const blob = new Blob([logData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai-upload-log-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Upload log downloaded');
    }
}

export { AIUploadHandler };
