class DrawingPad {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.clearButton = document.getElementById('clearButton');
        
        this.strokes = [];
        this.currentStroke = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.selectedStroke = null;
        
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
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.redraw();
    }
    
    setupEventListeners() {
        // Clear button
        this.clearButton.addEventListener('click', () => this.clearCanvas());
        
        // Pointer events for unified input handling
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        
        // Prevent default touch behaviors
        this.canvas.addEventListener('touchstart', (e) => e.preventDefault());
        this.canvas.addEventListener('touchmove', (e) => e.preventDefault());
        this.canvas.addEventListener('touchend', (e) => e.preventDefault());
    }
    
    handlePointerDown(e) {
        e.preventDefault();
        
        const point = this.getPointFromEvent(e);
        
        if (e.pointerType === 'pen') {
            // Drawing mode with Apple Pencil
            this.startDrawing(point, e);
        } else if (e.pointerType === 'touch') {
            // Touch mode - check if hitting an existing stroke
            this.selectedStroke = this.findStrokeAtPoint(point);
            if (this.selectedStroke) {
                // Visual feedback: highlight the selected stroke
                this.selectedStroke.selected = true;
                this.redraw();
                this.startDragging(point);
            }
        }
    }
    
    handlePointerMove(e) {
        e.preventDefault();
        
        const point = this.getPointFromEvent(e);
        
        if (this.isDrawing && e.pointerType === 'pen') {
            this.continueDrawing(point, e);
        } else if (this.isDragging && e.pointerType === 'touch' && this.selectedStroke) {
            this.continueDragging(point);
        }
    }
    
    handlePointerUp(e) {
        e.preventDefault();
        
        if (this.isDrawing) {
            this.finishDrawing();
        } else if (this.isDragging) {
            this.finishDragging();
        }
    }
    
    startDrawing(point, event) {
        this.isDrawing = true;
        this.currentStroke = {
            points: [point],
            pressures: [event.pressure || 0.5],
            tilts: [{ x: event.tiltX || 0, y: event.tiltY || 0 }],
            type: 'pen',
            selected: false
        };
        
        this.drawPoint(point, event.pressure || 0.5, event.tiltX || 0, event.tiltY || 0);
    }
    
    continueDrawing(point, event) {
        if (!this.currentStroke) return;
        
        this.currentStroke.points.push(point);
        this.currentStroke.pressures.push(event.pressure || 0.5);
        this.currentStroke.tilts.push({ x: event.tiltX || 0, y: event.tiltY || 0 });
        
        this.drawStrokeSegment(this.currentStroke);
    }
    
    finishDrawing() {
        if (this.currentStroke) {
            this.strokes.push(this.currentStroke);
            this.currentStroke = null;
        }
        this.isDrawing = false;
    }
    
    startDragging(point) {
        this.isDragging = true;
        this.dragOffset = {
            x: point.x,
            y: point.y
        };
    }
    
    continueDragging(point) {
        if (!this.selectedStroke) return;
        
        const deltaX = point.x - this.dragOffset.x;
        const deltaY = point.y - this.dragOffset.y;
        
        // Translate all points in the stroke
        this.selectedStroke.points = this.selectedStroke.points.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
        }));
        
        // Update the drag offset for the next frame
        this.dragOffset = {
            x: point.x,
            y: point.y
        };
        
        this.redraw();
    }
    
    finishDragging() {
        this.isDragging = false;
        if (this.selectedStroke) {
            this.selectedStroke.selected = false;
        }
        this.selectedStroke = null;
        this.dragOffset = { x: 0, y: 0 };
        this.redraw();
    }
    
    drawPoint(point, pressure, tiltX, tiltY) {
        const size = Math.max(1, pressure * 20);
        
        this.ctx.save();
        this.ctx.translate(point.x, point.y);
        
        // Apply tilt rotation
        const angle = Math.atan2(tiltY, tiltX) * 0.3; // Scale down tilt effect
        this.ctx.rotate(angle);
        
        this.ctx.beginPath();
        this.ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawStrokeSegment(stroke) {
        if (stroke.points.length < 2) return;
        
        const points = stroke.points;
        const pressures = stroke.pressures;
        const tilts = stroke.tilts;
        
        this.ctx.save();
        
        // Change color if stroke is selected
        if (stroke.selected) {
            this.ctx.strokeStyle = '#007AFF';
            this.ctx.shadowColor = '#007AFF';
            this.ctx.shadowBlur = 10;
        } else {
            this.ctx.strokeStyle = '#000000';
            this.ctx.shadowBlur = 0;
        }
        
        // Draw smooth curve through points
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        
        for (let i = 1; i < points.length; i++) {
            const prevPoint = points[i - 1];
            const currentPoint = points[i];
            const pressure = pressures[i];
            
            // Calculate control point for smooth curve
            const cp1x = prevPoint.x + (currentPoint.x - prevPoint.x) * 0.5;
            const cp1y = prevPoint.y + (currentPoint.y - prevPoint.y) * 0.5;
            
            this.ctx.quadraticCurveTo(cp1x, cp1y, currentPoint.x, currentPoint.y);
            
            // Set line width based on pressure
            this.ctx.lineWidth = Math.max(1, pressure * 20);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Redraw all strokes
        this.strokes.forEach(stroke => {
            if (stroke.points.length > 1) {
                this.drawStrokeSegment(stroke);
            }
        });
    }
    
    findStrokeAtPoint(point) {
        const tolerance = 20;
        
        for (let i = this.strokes.length - 1; i >= 0; i--) {
            const stroke = this.strokes[i];
            for (let j = 0; j < stroke.points.length; j++) {
                const strokePoint = stroke.points[j];
                const distance = Math.sqrt(
                    Math.pow(point.x - strokePoint.x, 2) + 
                    Math.pow(point.y - strokePoint.y, 2)
                );
                if (distance <= tolerance) {
                    return stroke;
                }
            }
        }
        return null;
    }
    
    getStrokeBounds(stroke) {
        if (!stroke.points.length) return { centerX: 0, centerY: 0 };
        
        let minX = stroke.points[0].x;
        let maxX = stroke.points[0].x;
        let minY = stroke.points[0].y;
        let maxY = stroke.points[0].y;
        
        stroke.points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });
        
        return {
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }
    
    getPointFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
    
    clearCanvas() {
        this.strokes = [];
        this.currentStroke = null;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Initialize the drawing pad when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DrawingPad();
});
