import { CanvasManager } from './canvas.js';
import { DrawingManager } from './draw.js';

// Main application initialization
class DrawingPad {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.clearButton = document.getElementById('clearButton');
        this.downloadLogButton = document.getElementById('downloadLogButton');
        
        // Initialize managers
        this.canvasManager = new CanvasManager(this.canvas, this.ctx);
        this.drawingManager = new DrawingManager(this.canvas, this.ctx, this.canvasManager);
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Clear button
        this.clearButton.addEventListener('click', () => this.drawingManager.clearCanvas());
        
        // Download AI log button
        this.downloadLogButton.addEventListener('click', () => this.drawingManager.downloadUploadLog());
    }
}

// Initialize the drawing pad when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DrawingPad();
});