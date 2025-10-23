class CanvasManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        
        // Canvas transformation
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.lastPinchDistance = 0;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        
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
    }
    
    setupEventListeners() {
        // Touch events for zoom, pan, and undo
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleTouchStart(e);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleTouchMove(e);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleTouchEnd(e);
        });
    }
    
    handleTouchStart(e) {
        if (e.touches.length === 2) {
            // Pinch gesture
            this.lastPinchDistance = this.getPinchDistance(e.touches);
        } else if (e.touches.length === 3) {
            // Three-finger pan
            this.isPanning = true;
            const touch = e.touches[0];
            this.panStart = {
                x: touch.clientX - this.translateX,
                y: touch.clientY - this.translateY
            };
        }
    }
    
    handleTouchMove(e) {
        if (e.touches.length === 2) {
            // Pinch to zoom
            const currentDistance = this.getPinchDistance(e.touches);
            if (this.lastPinchDistance > 0) {
                const scaleChange = currentDistance / this.lastPinchDistance;
                this.scale *= scaleChange;
                this.scale = Math.max(0.1, Math.min(5, this.scale)); // Limit zoom
            }
            this.lastPinchDistance = currentDistance;
            this.redraw();
        } else if (e.touches.length === 3 && this.isPanning) {
            // Three-finger pan
            const touch = e.touches[0];
            this.translateX = touch.clientX - this.panStart.x;
            this.translateY = touch.clientY - this.panStart.y;
            this.redraw();
        }
    }
    
    handleTouchEnd(e) {
        if (e.changedTouches.length === 2) {
            // Two-finger tap for undo
            if (this.onUndo) {
                this.onUndo();
            }
        }
        
        // Reset pan state
        this.isPanning = false;
        this.lastPinchDistance = 0;
    }
    
    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getPointFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Convert screen coordinates to canvas coordinates
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        
        // Apply inverse transformation
        const canvasX = (screenX - this.translateX) / this.scale;
        const canvasY = (screenY - this.translateY) / this.scale;
        
        return {
            x: canvasX,
            y: canvasY
        };
    }
    
    redraw(drawCallback) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Apply canvas transformation
        this.ctx.save();
        this.ctx.translate(this.translateX, this.translateY);
        this.ctx.scale(this.scale, this.scale);
        
        // Draw dot pattern for orientation
        this.drawDotPattern();
        
        // Call the drawing callback
        if (drawCallback) {
            drawCallback();
        }
        
        this.ctx.restore();
    }
    
    drawDotPattern() {
        const dotSpacing = 50; // Distance between dots
        const dotSize = 1;
        const canvasWidth = this.canvas.width / this.scale;
        const canvasHeight = this.canvas.height / this.scale;
        
        // Calculate visible area
        const startX = Math.floor(-this.translateX / this.scale / dotSpacing) * dotSpacing;
        const startY = Math.floor(-this.translateY / this.scale / dotSpacing) * dotSpacing;
        const endX = startX + canvasWidth + dotSpacing;
        const endY = startY + canvasHeight + dotSpacing;
        
        this.ctx.save();
        this.ctx.fillStyle = '#E0E0E0';
        
        for (let x = startX; x < endX; x += dotSpacing) {
            for (let y = startY; y < endY; y += dotSpacing) {
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
