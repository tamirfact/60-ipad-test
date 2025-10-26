// Unified Toast and Logging Manager
class ToastManager {
    constructor() {
        this.logs = [];
        this.maxLogs = 50; // Maximum number of logs to keep
        this.autoHideDelay = 15000; // 3 seconds
        
        this.createLogPanel();
        this.setupStyles();
    }
    
    createLogPanel() {
        // Create the log panel
        this.logPanel = document.createElement('div');
        this.logPanel.id = 'logPanel';
        this.logPanel.className = 'log-panel';
        
        
        
        // Create log container
        this.logContainer = document.createElement('div');
        this.logContainer.className = 'log-container';
        
        this.logPanel.appendChild(this.logContainer);
        
        // Add to page
        document.body.appendChild(this.logPanel);
        
    }
    
    setupStyles() {
        // Add CSS link if not already present
        if (document.getElementById('toastManagerCSS')) return;
        
        const link = document.createElement('link');
        link.id = 'toastManagerCSS';
        link.rel = 'stylesheet';
        link.href = 'toastManager.css';
        
        document.head.appendChild(link);
    }
    
    // Main method to add logs
    addLog(type, message, data = null) {
        const timestamp = new Date();
        const logEntry = {
            id: Date.now() + Math.random(),
            type,
            message,
            data,
            timestamp
        };
        
        this.logs.unshift(logEntry); // Add to beginning
        
        // Limit number of logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }
        
        this.renderLog(logEntry);
        this.scheduleAutoHide(logEntry.id);
        
        // Show panel if hidden
        this.showPanel();
    }
    
    renderLog(logEntry) {
        const logElement = document.createElement('div');
        logElement.className = 'log-entry';
        logElement.dataset.logId = logEntry.id;
        
        // Progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'log-progress';
        logElement.appendChild(progressBar);
        
        // Header
        const header = document.createElement('div');
        header.className = 'log-header-entry';
        
        const timestamp = document.createElement('div');
        timestamp.className = 'log-timestamp';
        timestamp.textContent = this.formatTime(logEntry.timestamp);
        
        const type = document.createElement('div');
        type.className = `log-type ${logEntry.type}`;
        type.textContent = logEntry.type.replace('-', ' ');
        
        header.appendChild(timestamp);
        header.appendChild(type);
        
        // Content
        const content = document.createElement('div');
        content.className = 'log-content';
        content.textContent = logEntry.message;
        
        logElement.appendChild(header);
        logElement.appendChild(content);
        
        // Add image if present
        if (logEntry.data && logEntry.data.image) {
            const img = document.createElement('img');
            img.className = 'log-image';
            img.src = logEntry.data.image;
            logElement.appendChild(img);
        }
        
        // Add prompt if present
        if (logEntry.data && logEntry.data.prompt) {
            const prompt = document.createElement('div');
            prompt.className = 'log-prompt';
            prompt.textContent = logEntry.data.prompt;
            logElement.appendChild(prompt);
        }
        
        // Add to container
        this.logContainer.insertBefore(logElement, this.logContainer.firstChild);
    }
    
    scheduleAutoHide(logId) {
        setTimeout(() => {
            this.hideLog(logId);
        }, this.autoHideDelay);
    }
    
    hideLog(logId) {
        const logElement = document.querySelector(`[data-log-id="${logId}"]`);
        if (logElement) {
            logElement.classList.add('fading');
            setTimeout(() => {
                if (logElement.parentNode) {
                    logElement.parentNode.removeChild(logElement);
                }
            }, 500);
        }
    }
    
    showPanel() {
        this.logPanel.classList.add('visible');
    }
    
    hidePanel() {
        this.logPanel.classList.remove('visible');
    }
    
    clearLogs() {
        this.logs = [];
        this.logContainer.innerHTML = '';
    }
    
    formatTime(timestamp) {
        return timestamp.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
    }
    
    // Specific methods for different log types
    logAIRequest(message, imageData = null, prompt = null) {
        this.addLog('ai-request', message, {
            prompt,
            image: imageData
        });
    }
    
    logAIResponse(message, data = null) {
        this.addLog('ai-response', message, data);
    }
    
    logInfo(message, data = null) {
        this.addLog('info', message, data);
    }
    
    logSuccess(message, data = null) {
        this.addLog('success', message, data);
    }
    
    logError(message, data = null) {
        this.addLog('error', message, data);
    }
    
    // Method to replace old toast functionality
    showToast(message, imageData = null) {
        this.logInfo(message, { image: imageData });
    }
}

// Export for use in other files
export { ToastManager };
