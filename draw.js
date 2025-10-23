class DrawingManager {
    constructor(canvas, ctx, canvasManager) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.canvasManager = canvasManager;
        
        // Debug display elements
        this.penX = document.getElementById('penX');
        this.penY = document.getElementById('penY');
        this.penPressure = document.getElementById('penPressure');
        this.penTiltX = document.getElementById('penTiltX');
        this.penTiltY = document.getElementById('penTiltY');
        
        this.strokes = [];
        this.undoManager = new UndoManager();
        this.currentStroke = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.selectedStroke = null;
        this.draggedStrokes = []; // Strokes being dragged together
        this.isLassoSelecting = false;
        this.lassoPoints = []; // Points for lasso selection
        this.selectedStrokes = []; // Strokes selected by lasso
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Pointer events for unified input handling
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        
        // Debug: Update display on any pointer movement
        this.canvas.addEventListener('pointermove', (e) => this.updateDebugDisplay(e));
        
        // Set up canvas manager undo callback
        this.canvasManager.onUndo = () => this.undoManager.undo();
    }
    
    handlePointerDown(e) {
        e.preventDefault();
        
        const point = this.canvasManager.getPointFromEvent(e);
        
        if (e.pointerType === 'pen') {
            // Drawing mode with Apple Pencil
            this.startDrawing(point, e);
        } else if (e.pointerType === 'touch') {
            // Touch mode - check if hitting an existing stroke
            this.selectedStroke = this.findStrokeAtPoint(point);
            if (this.selectedStroke) {
                // Check if this stroke is already selected by lasso
                if (this.selectedStrokes.includes(this.selectedStroke)) {
                    // Start dragging all selected strokes
                    this.draggedStrokes = [...this.selectedStrokes];
                } else {
                    // Clear lasso selection and select single stroke
                    this.clearLassoSelection();
                    this.selectedStroke.selected = true;
                    this.draggedStrokes = [this.selectedStroke];
                }
                this.redraw();
                this.startDragging(point);
            } else {
                // Start lasso selection if no stroke is hit
                this.clearLassoSelection();
                this.startLassoSelection(point);
            }
        }
    }
    
    handlePointerMove(e) {
        e.preventDefault();
        
        const point = this.canvasManager.getPointFromEvent(e);
        
        if (this.isDrawing && e.pointerType === 'pen') {
            this.continueDrawing(point, e);
        } else if (this.isDragging && e.pointerType === 'touch' && this.selectedStroke) {
            this.continueDragging(point);
        } else if (this.isLassoSelecting && e.pointerType === 'touch') {
            this.continueLassoSelection(point);
        }
    }
    
    handlePointerUp(e) {
        e.preventDefault();
        
        if (this.isDrawing) {
            this.finishDrawing();
        } else if (this.isDragging) {
            this.finishDragging();
        } else if (this.isLassoSelecting) {
            this.finishLassoSelection();
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
            // Create undo/redo action for adding stroke
            const strokeToAdd = this.currentStroke;
            const action = {
                execute: () => {
                    this.strokes.push(strokeToAdd);
                    this.redraw();
                },
                undo: () => {
                    this.strokes.pop();
                    this.redraw();
                }
            };
            
            this.undoManager.add(action);
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
        
        // If no dragged strokes set, find nearby strokes
        if (this.draggedStrokes.length === 0) {
            this.draggedStrokes = this.findNearbyStrokes(this.selectedStroke, 50); // 50px tolerance
        }
    }
    
    continueDragging(point) {
        if (!this.selectedStroke) return;
        
        const deltaX = point.x - this.dragOffset.x;
        const deltaY = point.y - this.dragOffset.y;
        
        // Translate all points in all dragged strokes
        this.draggedStrokes.forEach(stroke => {
            stroke.points = stroke.points.map(p => ({
                x: p.x + deltaX,
                y: p.y + deltaY
            }));
        });
        
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
        this.draggedStrokes = [];
        this.dragOffset = { x: 0, y: 0 };
        this.redraw();
    }
    
    clearLassoSelection() {
        // Clear selection from all lasso-selected strokes
        this.selectedStrokes.forEach(stroke => {
            stroke.selected = false;
        });
        this.selectedStrokes = [];
    }
    
    startLassoSelection(point) {
        this.isLassoSelecting = true;
        this.lassoPoints = [point];
        this.selectedStrokes = [];
    }
    
    continueLassoSelection(point) {
        if (this.isLassoSelecting) {
            this.lassoPoints.push(point);
            this.redraw();
        }
    }
    
    finishLassoSelection() {
        this.isLassoSelecting = false;
        
        if (this.lassoPoints.length > 2) {
            // Find strokes that intersect with the lasso path
            this.selectedStrokes = this.findStrokesInLasso(this.lassoPoints);
            
            // Mark selected strokes
            this.selectedStrokes.forEach(stroke => {
                stroke.selected = true;
            });
        }
        
        this.lassoPoints = [];
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
        
        // Draw each segment with its own pressure
        for (let i = 1; i < points.length; i++) {
            const prevPoint = points[i - 1];
            const currentPoint = points[i];
            const pressure = pressures[i];
            
            // Set line width for this segment
            this.ctx.lineWidth = Math.max(1, pressure * 20);
            
            // Draw this segment
            this.ctx.beginPath();
            this.ctx.moveTo(prevPoint.x, prevPoint.y);
            this.ctx.lineTo(currentPoint.x, currentPoint.y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }
    
    drawLassoSelection() {
        if (this.lassoPoints.length < 2) return;
        
        this.ctx.save();
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
        
        for (let i = 1; i < this.lassoPoints.length; i++) {
            this.ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }
        
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    redraw() {
        this.canvasManager.redraw(() => {
            // Draw lasso selection if active
            if (this.isLassoSelecting && this.lassoPoints.length > 1) {
                this.drawLassoSelection();
            }
            
            // Redraw all strokes
            this.strokes.forEach(stroke => {
                if (stroke.points.length > 1) {
                    this.drawStrokeSegment(stroke);
                }
            });
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
    
    findNearbyStrokes(targetStroke, tolerance) {
        const nearbyStrokes = [targetStroke]; // Always include the target stroke
        const targetBounds = this.getStrokeBounds(targetStroke);
        
        this.strokes.forEach(stroke => {
            if (stroke === targetStroke) return; // Skip the target stroke itself
            
            const strokeBounds = this.getStrokeBounds(stroke);
            
            // Calculate distance between stroke centers
            const distance = Math.sqrt(
                Math.pow(targetBounds.centerX - strokeBounds.centerX, 2) + 
                Math.pow(targetBounds.centerY - strokeBounds.centerY, 2)
            );
            
            // Also check if any points are within tolerance
            let pointDistance = Infinity;
            targetStroke.points.forEach(targetPoint => {
                stroke.points.forEach(strokePoint => {
                    const dist = Math.sqrt(
                        Math.pow(targetPoint.x - strokePoint.x, 2) + 
                        Math.pow(targetPoint.y - strokePoint.y, 2)
                    );
                    pointDistance = Math.min(pointDistance, dist);
                });
            });
            
            // Add stroke if it's within tolerance (either by center distance or point distance)
            if (distance <= tolerance || pointDistance <= tolerance) {
                nearbyStrokes.push(stroke);
            }
        });
        
        return nearbyStrokes;
    }
    
    findStrokesInLasso(lassoPoints) {
        const selectedStrokes = [];
        
        this.strokes.forEach(stroke => {
            // Check if any point of the stroke is inside the lasso polygon
            let isInside = false;
            
            stroke.points.forEach(point => {
                if (this.isPointInPolygon(point, lassoPoints)) {
                    isInside = true;
                }
            });
            
            if (isInside) {
                selectedStrokes.push(stroke);
            }
        });
        
        return selectedStrokes;
    }
    
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
                (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
                inside = !inside;
            }
        }
        return inside;
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
    
    updateDebugDisplay(event) {
        const point = this.canvasManager.getPointFromEvent(event);
        
        this.penX.textContent = Math.round(point.x);
        this.penY.textContent = Math.round(point.y);
        this.penPressure.textContent = (event.pressure || 0).toFixed(2);
        this.penTiltX.textContent = (event.tiltX || 0).toFixed(1);
        this.penTiltY.textContent = (event.tiltY || 0).toFixed(1);
    }
    
    clearCanvas() {
        // Create undo/redo action for clearing canvas
        const currentStrokes = [...this.strokes];
        const action = {
            execute: () => {
                this.strokes = [];
                this.canvasManager.clearCanvas();
            },
            undo: () => {
                this.strokes = [...currentStrokes];
                this.redraw();
            }
        };
        
        this.undoManager.add(action);
        this.strokes = [];
        this.currentStroke = null;
        this.canvasManager.clearCanvas();
    }
}
