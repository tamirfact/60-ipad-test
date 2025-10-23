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
        
        // Debug: Check if SimpleUndo is available
        if (typeof SimpleUndo === 'undefined') {
            console.error('SimpleUndo is not defined. Check if simple-undo library loaded correctly.');
            throw new Error('SimpleUndo not available');
        }
        
        this.undoManager = new SimpleUndo({
            provider: (done) => {
                done(JSON.parse(JSON.stringify(this.strokes)));
            },
            maxLength: 20
        });
        this.currentStroke = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.selectedStroke = null;
        this.draggedStrokes = []; // Strokes being dragged together
        this.isLassoSelecting = false;
        this.lassoPoints = []; // Points for lasso selection
        this.selectedStrokes = []; // Strokes selected by lasso
        
        // Drop zone elements
        this.dropZone = document.getElementById('dropZone');
        this.isOverDropZone = false;
        
        // Actionable object hover state
        this.hoveredSmartObject = null;

        // AI generator
        this.aiGenerator = new AIGenerator();

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
        this.canvasManager.onUndo = () => {
            this.undoManager.undo((restoredStrokes) => {
                this.strokes = restoredStrokes || [];
                this.redraw();
            });
        };
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
                // Clear all selections if clicking empty space
                this.clearAllSelections();
                // Start lasso selection if no stroke is hit
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
            this.strokes.push(this.currentStroke);
            this.currentStroke = null;
            // Save state for undo
            this.undoManager.save();
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
        
        // Show drop zone when dragging
        this.showDropZone();
    }
    
    continueDragging(point) {
        if (!this.selectedStroke) return;
        
        const deltaX = point.x - this.dragOffset.x;
        const deltaY = point.y - this.dragOffset.y;
        
        // Translate all points in all dragged strokes
        this.draggedStrokes.forEach(stroke => {
            if (stroke.type === 'smart-object') {
                // Move smart object position
                stroke.position.x += deltaX;
                stroke.position.y += deltaY;
            } else if (stroke.points) {
                // Move regular stroke points
                stroke.points = stroke.points.map(p => ({
                    x: p.x + deltaX,
                    y: p.y + deltaY
                }));
            }
        });
        
        // Check if dragging over drop zone
        this.checkDropZoneHover(point);
        
        // Check if dragging over actionable smart object
        this.updateActionableObjectHover(point);
        
        // Update the drag offset for the next frame
        this.dragOffset = {
            x: point.x,
            y: point.y
        };
        
        this.redraw();
    }
    
    finishDragging() {
        this.isDragging = false;

        // Check if dropped over drop zone
        if (this.isOverDropZone) {
            this.handleDropZoneDrop();
            this.hideDropZone();
            return;
        }

        // Check if dropped over actionable smart object
        if (this.hoveredSmartObject && this.hoveredSmartObject.action) {
            this.executeSmartObjectAction(this.hoveredSmartObject, this.draggedStrokes);
            this.hoveredSmartObject = null;
            this.selectedStroke = null;
            this.draggedStrokes = [];
            this.dragOffset = { x: 0, y: 0 };
            this.hideDropZone();
            this.redraw();
            return;
        }

        // If we were dragging a group, keep all strokes in the group selected
        if (this.draggedStrokes.length > 1) {
            // Keep all dragged strokes selected
            this.draggedStrokes.forEach(stroke => {
                stroke.selected = true;
            });
            // Update selectedStrokes to include the dragged group
            this.selectedStrokes = [...this.draggedStrokes];
        } else if (this.selectedStroke) {
            // Single stroke - keep it selected
            this.selectedStroke.selected = true;
        }

        this.selectedStroke = null;
        this.draggedStrokes = [];
        this.dragOffset = { x: 0, y: 0 };
        this.hideDropZone();
        this.redraw();
    }
    
    clearLassoSelection() {
        // Clear selection from all lasso-selected strokes
        this.selectedStrokes.forEach(stroke => {
            stroke.selected = false;
        });
        this.selectedStrokes = [];
    }
    
    clearAllSelections() {
        // Clear all stroke selections
        this.strokes.forEach(stroke => {
            stroke.selected = false;
        });
        this.selectedStrokes = [];
        this.selectedStroke = null;
        this.draggedStrokes = [];
        this.redraw();
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
    
    drawSmartObject(smartObject) {
        this.ctx.save();

        // Set up large font for emoji
        this.ctx.font = '48px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Check if this is the hovered actionable object
        const isHovered = this.hoveredSmartObject === smartObject;
        const scale = isHovered ? 1.1 : 1.0;
        const radius = 40 * scale;

        // Apply scaling transform
        this.ctx.translate(smartObject.position.x, smartObject.position.y);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-smartObject.position.x, -smartObject.position.y);

        // Background circle for visibility
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        
        // Different border color for actionable objects
        if (smartObject.action) {
            this.ctx.strokeStyle = smartObject.selected ? '#007AFF' : '#FF6B35'; // Orange for actionable
        } else {
            this.ctx.strokeStyle = smartObject.selected ? '#007AFF' : '#CCCCCC';
        }
        this.ctx.lineWidth = 3;

        // Draw background circle with more padding
        this.ctx.beginPath();
        this.ctx.arc(smartObject.position.x, smartObject.position.y, 40, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw emoji
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(
            smartObject.emoji,
            smartObject.position.x,
            smartObject.position.y
        );

        this.ctx.restore();
    }
    
    redraw() {
        this.canvasManager.redraw(() => {
            // Draw lasso selection if active
            if (this.isLassoSelecting && this.lassoPoints.length > 1) {
                this.drawLassoSelection();
            }
            
            // Redraw all strokes and smart objects
            this.strokes.forEach(stroke => {
                if (stroke.type === 'smart-object') {
                    this.drawSmartObject(stroke);
                } else if (stroke.points && stroke.points.length > 1) {
                    this.drawStrokeSegment(stroke);
                }
            });
        });
    }
    
    findStrokeAtPoint(point) {
        const tolerance = 20;
        
        for (let i = this.strokes.length - 1; i >= 0; i--) {
            const stroke = this.strokes[i];
            
            // Check smart objects (emoji)
            if (stroke.type === 'smart-object') {
                const radius = 40;
                const distance = Math.sqrt(
                    Math.pow(point.x - stroke.position.x, 2) +
                    Math.pow(point.y - stroke.position.y, 2)
                );

                if (distance <= radius) {
                    return stroke;
                }
            } else {
                // Check regular strokes
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
            
            // Also check if any points are within tolerance (only for regular strokes)
            let pointDistance = Infinity;
            if (targetStroke.points && stroke.points) {
                targetStroke.points.forEach(targetPoint => {
                    stroke.points.forEach(strokePoint => {
                        const dist = Math.sqrt(
                            Math.pow(targetPoint.x - strokePoint.x, 2) + 
                            Math.pow(targetPoint.y - strokePoint.y, 2)
                        );
                        pointDistance = Math.min(pointDistance, dist);
                    });
                });
            }
            
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
            
            if (stroke.type === 'smart-object') {
                // For smart objects, check if center is in lasso
                if (this.isPointInPolygon(stroke.position, lassoPoints)) {
                    isInside = true;
                }
            } else if (stroke.points) {
                // For regular strokes, check each point
                stroke.points.forEach(point => {
                    if (this.isPointInPolygon(point, lassoPoints)) {
                        isInside = true;
                    }
                });
            }
            
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
        // Handle smart objects (emoji)
        if (stroke.type === 'smart-object') {
            const radius = 40;
            return {
                centerX: stroke.position.x,
                centerY: stroke.position.y,
                minX: stroke.position.x - radius,
                maxX: stroke.position.x + radius,
                minY: stroke.position.y - radius,
                maxY: stroke.position.y + radius
            };
        }
        
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
            centerY: (minY + maxY) / 2,
            minX, maxX, minY, maxY
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
        this.strokes = [];
        this.currentStroke = null;
        // Clear and redraw with dot pattern
        this.redraw();
        // Save state for undo
        this.undoManager.save();
    }
    
    showDropZone() {
        this.dropZone.classList.remove('drop-zone-hidden');
        this.dropZone.classList.add('drop-zone-visible');
    }
    
    hideDropZone() {
        this.dropZone.classList.remove('drop-zone-visible');
        this.dropZone.classList.add('drop-zone-hidden');
        this.dropZone.classList.remove('drag-over');
        this.isOverDropZone = false;
    }
    
    checkDropZoneHover(point) {
        const dropZoneRect = this.dropZone.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Convert canvas coordinates to screen coordinates
        const screenX = point.x + canvasRect.left;
        const screenY = point.y + canvasRect.top;
        
        // Check if point is within drop zone bounds
        const isOver = screenX >= dropZoneRect.left && 
                      screenX <= dropZoneRect.right && 
                      screenY >= dropZoneRect.top && 
                      screenY <= dropZoneRect.bottom;
        
        if (isOver && !this.isOverDropZone) {
            this.dropZone.classList.add('drag-over');
            this.isOverDropZone = true;
        } else if (!isOver && this.isOverDropZone) {
            this.dropZone.classList.remove('drag-over');
            this.isOverDropZone = false;
        }
    }
    
    async handleDropZoneDrop() {
        await this.aiGenerator.processDrawing(this, this.draggedStrokes);
    }
    
    findSmartObjectAtPoint(point) {
        for (let i = this.strokes.length - 1; i >= 0; i--) {
            const stroke = this.strokes[i];
            
            if (stroke.type === 'smart-object') {
                const radius = 40;
                const distance = Math.sqrt(
                    Math.pow(point.x - stroke.position.x, 2) +
                    Math.pow(point.y - stroke.position.y, 2)
                );

                if (distance <= radius) {
                    return stroke;
                }
            }
        }
        return null;
    }
    
    updateActionableObjectHover(point) {
        const smartObject = this.findSmartObjectAtPoint(point);
        
        if (smartObject && smartObject.action) {
            // Hovering over actionable smart object
            if (this.hoveredSmartObject !== smartObject) {
                this.hoveredSmartObject = smartObject;
                this.redraw();
            }
        } else {
            // Not hovering over actionable smart object
            if (this.hoveredSmartObject) {
                this.hoveredSmartObject = null;
                this.redraw();
            }
        }
    }
    
    executeSmartObjectAction(smartObject, draggedStrokes) {
        if (!smartObject.action) return;
        
        const strokeIds = draggedStrokes.map(s => this.strokes.indexOf(s));
        
        switch(smartObject.action) {
            case 'delete':
                CanvasActions.delete(this, strokeIds);
                this.canvasManager.showToast('Deleted strokes');
                break;
            case 'reflect':
                CanvasActions.reflect(this, strokeIds);
                this.canvasManager.showToast('Reflected strokes');
                break;
            case 'enlarge':
                CanvasActions.enlarge(this, strokeIds);
                this.canvasManager.showToast('Enlarged strokes');
                break;
        }
        
        this.redraw();
    }
    
}
