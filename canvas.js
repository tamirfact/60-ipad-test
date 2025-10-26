class CanvasManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // Canvas transformation
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        
        this.setupCanvas();
        this.setupEventListeners();
    }
    
    setupCanvas() {
        // Set canvas size to match viewport
        this.resizeCanvas();
        
        // Configure drawing context
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = '#000000';
        this.ctx.fillStyle = '#000000';
        
        // Draw initial dot pattern
        this.drawDotPattern();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });
    }
    
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        // Redraw dots after resize
        this.drawDotPattern();
    }
    
    setupEventListeners() {
        // Touch events for undo only
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        });
    }
    
    handleTouchEnd(e) {
        if (e.changedTouches.length === 2) {
            // Two-finger tap for undo
            if (this.onUndo) {
                this.onUndo();
                this.showToast('Undo');
            }
        }
    }
    
    showToast(message, imageData = null) {
        // Use the global ToastManager
        if (window.toastManager) {
            window.toastManager.showToast(message, imageData);
        } else {
            console.log('ToastManager not available:', message);
        }
    }
    
    getPointFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
    
    redraw(drawCallback) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw dot pattern for orientation
        this.drawDotPattern();
        
        // Call the drawing callback
        if (drawCallback) {
            drawCallback();
        }
    }
    
    drawDotPattern() {
        const dotSpacing = 50; // Distance between dots
        const dotSize = 2; // Make dots slightly larger
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        this.ctx.save();
        this.ctx.fillStyle = '#CCCCCC'; // Make dots more visible
        
        for (let x = 0; x < canvasWidth; x += dotSpacing) {
            for (let y = 0; y < canvasHeight; y += dotSpacing) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        
        this.ctx.restore();
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

export { CanvasManager };
