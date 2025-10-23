// Main application initialization
class DrawingPad {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.clearButton = document.getElementById('clearButton');
        
        // Initialize managers
        this.canvasManager = new CanvasManager(this.canvas, this.ctx);
        this.drawingManager = new DrawingManager(this.canvas, this.ctx, this.canvasManager);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Clear button
        this.clearButton.addEventListener('click', () => this.drawingManager.clearCanvas());
    }
}

// Initialize the drawing pad when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DrawingPad();
});