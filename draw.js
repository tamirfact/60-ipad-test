import { AIGenerator } from './ai.js';
import { ImageGenerator } from './imageGen.js';
import { AIUploadHandler } from './aiUploadHandler.js';

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
        
        // Image object cache for performance
        this.imageCache = new Map();
        
        // Scale interaction state
        this.isScaling = false;
        this.scaleStartDistance = 0;
        this.scaleStartWidth = 0;
        this.scaleStartHeight = 0;
        this.scaleTarget = null; // The object being scaled

        // Long-tap state management
        this.longTapTimer = null;
        this.longTapProgressTimer = null;
        this.longTapStartPoint = null;
        this.isLongTapping = false;
        this.showLongTapProgress = false;
        this.longTapStartTime = null;

        // AI generator
        this.aiGenerator = new AIGenerator();
        
        // AI upload handler
        this.aiUploadHandler = new AIUploadHandler(this.aiGenerator);

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
        
        // Touch events for scaling
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                this.handleScaleStart(e);
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault(); // Prevent scrolling
                this.handleScaleMove(e);
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (this.isScaling && e.touches.length < 2) {
                this.handleScaleEnd();
            }
        });
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
                    // Start long-tap for AI processing on already-selected strokes
                    this.draggedStrokes = [...this.selectedStrokes];
                    this.startLongTap(point);
                } else {
                    // Clear lasso selection and select single stroke
                    this.clearLassoSelection();
                    this.selectedStroke.selected = true;
                    this.draggedStrokes = [this.selectedStroke];
                    this.startLongTap(point);
                }
                this.redraw();
                // Do NOT start dragging immediately - wait for long-tap
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
        } else if (this.isLongTapping && e.pointerType === 'touch') {
            // Check movement tolerance for long-tap
            const distance = Math.sqrt(
                Math.pow(point.x - this.longTapStartPoint.x, 2) + 
                Math.pow(point.y - this.longTapStartPoint.y, 2)
            );
            if (distance > 10) {
                // Cancel long-tap and start dragging
                this.cancelLongTap();
                this.startDragging(point);
            }
        } else if (this.isDragging && e.pointerType === 'touch' && this.selectedStroke) {
            this.continueDragging(point);
        } else if (this.isLassoSelecting && e.pointerType === 'touch') {
            this.continueLassoSelection(point);
        }
    }
    
    handlePointerUp(e) {
        e.preventDefault();
        
        if (this.isLongTapping) {
            // Clean up long-tap
            this.cancelLongTap();
            // If finger was held for less than 3 seconds, start dragging behavior
            this.startDragging(this.longTapStartPoint);
        } else if (this.isDrawing) {
            this.finishDrawing();
        } else if (this.isDragging) {
            this.finishDragging();
        } else if (this.isLassoSelecting) {
            this.finishLassoSelection();
        }
    }
    
    startLongTap(point) {
        this.longTapStartPoint = point;
        this.isLongTapping = true;
        this.longTapStartTime = Date.now();
        
        // Start 2-second timer for visual feedback
        this.longTapProgressTimer = setTimeout(() => {
            this.showLongTapProgress = true;
            this.startProgressAnimation();
        }, 2000);
        
        // Start 3-second timer for AI processing
        this.longTapTimer = setTimeout(() => {
            this.triggerLongTapAI();
        }, 3000);
    }

    cancelLongTap() {
        if (this.longTapTimer) {
            clearTimeout(this.longTapTimer);
            this.longTapTimer = null;
        }
        if (this.longTapProgressTimer) {
            clearTimeout(this.longTapProgressTimer);
            this.longTapProgressTimer = null;
        }
        this.isLongTapping = false;
        this.showLongTapProgress = false;
        this.redraw();
    }

    startProgressAnimation() {
        const animate = () => {
            if (this.showLongTapProgress && this.isLongTapping) {
                this.redraw();
                requestAnimationFrame(animate);
            }
        };
        animate();
    }

    triggerLongTapAI() {
        this.isLongTapping = false;
        this.showLongTapProgress = false;
        
        // Use AIUploadHandler for consistent behavior and logging
        this.aiUploadHandler.handleAIUpload(this, this.draggedStrokes, 'long-tap');
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
            if (stroke.type === 'image-object') {
                // Move image object position
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


        // Always hide the gradient when drag ends (for normal drags)
        this.hideDropZone();

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

    drawLongTapProgress() {
        if (!this.showLongTapProgress || !this.draggedStrokes.length) return;
        
        // Calculate center point of all selected strokes/images
        let centerX = 0, centerY = 0, count = 0;
        
        this.draggedStrokes.forEach(stroke => {
            if (stroke.type === 'image-object') {
                centerX += stroke.position.x;
                centerY += stroke.position.y;
                count++;
            } else if (stroke.points && stroke.points.length > 0) {
                stroke.points.forEach(point => {
                    centerX += point.x;
                    centerY += point.y;
                    count++;
                });
            }
        });
        
        if (count === 0) return;
        
        centerX /= count;
        centerY /= count;
        
        // Calculate progress based on elapsed time since 2-second mark
        const elapsed = Date.now() - this.longTapStartTime - 2000; // Time since 2s mark
        const progress = Math.min(Math.max(elapsed / 1000, 0), 1); // Progress from 0 to 1 over 1 second
        
        this.ctx.save();
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 6;
        this.ctx.lineCap = 'round';
        this.ctx.globalAlpha = 0.8;
        
        const radius = 40;
        const startAngle = -Math.PI / 2; // Start at top
        const endAngle = startAngle + (progress * 2 * Math.PI);
        
        // Draw background circle
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        this.ctx.strokeStyle = '#E0E0E0';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
        
        // Draw progress arc
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 6;
        this.ctx.stroke();
        this.ctx.restore();
    }
    
    drawImageObject(imageObj) {
        this.ctx.save();

        const x = imageObj.position.x - imageObj.width / 2;
        const y = imageObj.position.y - imageObj.height / 2;

        // Draw white border
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(x - 10, y - 10, imageObj.width + 20, imageObj.height + 20);

        // Draw shadow
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetX = 5;
        this.ctx.shadowOffsetY = 5;

        // Draw image if available
        if (imageObj.imageData) {
            const img = this.getCachedImage(imageObj.imageData);
            if (img) {
                this.ctx.drawImage(img, x, y, imageObj.width, imageObj.height);
            } else {
                // Show placeholder while image is loading
                this.ctx.fillStyle = '#F0F0F0';
                this.ctx.fillRect(x, y, imageObj.width, imageObj.height);
                
                this.ctx.fillStyle = '#999999';
                this.ctx.font = '16px Arial, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText('Loading...', imageObj.position.x, imageObj.position.y);
            }
        }

        // Reset shadow
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;

        // Draw selection border if selected
        if (imageObj.selected) {
            this.ctx.strokeStyle = '#007AFF';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x - 10, y - 10, imageObj.width + 20, imageObj.height + 20);
        }

        // Draw loading indicator if generating
        if (imageObj.isGenerating) {
            // Add pulsing animation to the entire image square
            const time = Date.now() * 0.003; // Slow animation
            const pulseScale = 1 + Math.sin(time) * 0.1; // Scale between 0.9 and 1.1
            
            this.ctx.save();
            this.ctx.translate(imageObj.position.x, imageObj.position.y);
            this.ctx.scale(pulseScale, pulseScale);
            this.ctx.translate(-imageObj.position.x, -imageObj.position.y);
            
            // Draw animated background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(x, y, imageObj.width, imageObj.height);
            
            // Draw text without animation
            this.ctx.fillStyle = 'white';
            this.ctx.font = '16px Arial, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                'Generating...',
                imageObj.position.x,
                imageObj.position.y
            );
            
            this.ctx.restore();
        }

        this.ctx.restore();
    }

    getCachedImage(imageData) {
        if (this.imageCache.has(imageData)) {
            return this.imageCache.get(imageData);
        }

        const img = new Image();
        img.onload = () => {
            this.imageCache.set(imageData, img);
            // Trigger a redraw when the image loads
            this.redraw();
        };
        img.src = `data:image/png;base64,${imageData}`;
        
        return null; // Return null initially, will be cached on load
    }
    
    redraw() {
        this.canvasManager.redraw(() => {
            // First, draw all image objects (background layer)
            this.strokes.forEach(stroke => {
                if (stroke.type === 'image-object') {
                    this.drawImageObject(stroke);
                }
            });
            
            // Then, draw all strokes on top (foreground layer)
            this.strokes.forEach(stroke => {
                if (stroke.type !== 'image-object' && stroke.points && stroke.points.length > 1) {
                    this.drawStrokeSegment(stroke);
                }
            });
            
            // Finally, draw lasso selection on top of everything
            if (this.isLassoSelecting && this.lassoPoints.length > 1) {
                this.drawLassoSelection();
            }
            
            // Draw long-tap progress indicator on top of everything
            if (this.showLongTapProgress) {
                this.drawLongTapProgress();
            }
        });
    }
    
    findStrokeAtPoint(point) {
        const tolerance = 20;
        
        for (let i = this.strokes.length - 1; i >= 0; i--) {
            const stroke = this.strokes[i];
            
            // Check image objects
            if (stroke.type === 'image-object') {
                const x = stroke.position.x - stroke.width / 2;
                const y = stroke.position.y - stroke.height / 2;
                
                if (point.x >= x - 10 && point.x <= x + stroke.width + 10 &&
                    point.y >= y - 10 && point.y <= y + stroke.height + 10) {
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
            
            if (stroke.type === 'image-object') {
                // For image objects, check if center is in lasso
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
        // Handle image objects
        if (stroke.type === 'image-object') {
            const x = stroke.position.x - stroke.width / 2;
            const y = stroke.position.y - stroke.height / 2;
            return {
                centerX: stroke.position.x,
                centerY: stroke.position.y,
                minX: x - 10,
                maxX: x + stroke.width + 10,
                minY: y - 10,
                maxY: y + stroke.height + 10
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
        // Remove all fade classes
        this.dropZone.classList.remove('drop-zone-fade-1', 'drop-zone-fade-2', 'drop-zone-fade-3', 
                                     'drop-zone-fade-4', 'drop-zone-fade-5', 'drop-zone-fade-6', 
                                     'drop-zone-fade-7', 'drop-zone-fade-8', 'drop-zone-fade-9', 'drop-zone-fade-10');
        this.isOverDropZone = false;
    }
    
    checkDropZoneHover(point) {
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Convert canvas coordinates to screen coordinates
        const screenX = point.x + canvasRect.left;
        const screenY = point.y + canvasRect.top;
        
        // Calculate distance from drag point to top-right corner
        const cornerX = canvasRect.left + canvasRect.width;
        const cornerY = canvasRect.top;
        
        const distance = Math.sqrt(
            Math.pow(screenX - cornerX, 2) + 
            Math.pow(screenY - cornerY, 2)
        );
        
        // Calculate max distance (from opposite corner to top-right)
        const maxDistance = Math.sqrt(
            Math.pow(canvasRect.width, 2) + 
            Math.pow(canvasRect.height, 2)
        );
        
        // Calculate opacity based on distance (closer to corner = more visible)
        const normalizedDistance = Math.min(distance / maxDistance, 1);
        const opacity = 1 - normalizedDistance;
        
        // Remove all fade classes first
        this.dropZone.classList.remove('drop-zone-fade-1', 'drop-zone-fade-2', 'drop-zone-fade-3', 
                                     'drop-zone-fade-4', 'drop-zone-fade-5', 'drop-zone-fade-6', 
                                     'drop-zone-fade-7', 'drop-zone-fade-8', 'drop-zone-fade-9', 'drop-zone-fade-10');
        
        // Add appropriate fade class based on opacity
        const fadeLevel = Math.round(opacity * 10);
        if (fadeLevel > 0) {
            this.dropZone.classList.add(`drop-zone-fade-${fadeLevel}`);
        }
        
        // Check if close enough to trigger drop (within 100px of corner)
        const isOver = distance < 100;
        
        if (isOver && !this.isOverDropZone) {
            this.dropZone.classList.add('drag-over');
            this.isOverDropZone = true;
        } else if (!isOver && this.isOverDropZone) {
            this.dropZone.classList.remove('drag-over');
            this.isOverDropZone = false;
        }
    }
    
    async handleDropZoneDrop() {
        // Use AIUploadHandler for consistent behavior and logging
        await this.aiUploadHandler.handleAIUpload(this, this.draggedStrokes, 'drag-to-corner');
    }
    
    getCanvasContext() {
        return {
            hasImages: this.strokes.some(s => s.type === 'image-object'),
            imageCount: this.strokes.filter(s => s.type === 'image-object').length,
            hasStrokes: this.strokes.some(s => s.type !== 'image-object'),
            strokeCount: this.strokes.filter(s => s.type !== 'image-object').length
        };
    }
    
    // AI Upload Log methods
    getUploadLog() {
        return this.aiUploadHandler.getUploadLog();
    }
    
    clearUploadLog() {
        this.aiUploadHandler.clearUploadLog();
    }
    
    exportUploadLog() {
        return this.aiUploadHandler.exportUploadLog();
    }
    
    downloadUploadLog() {
        this.aiUploadHandler.downloadUploadLog();
    }
    
    // Scale interaction methods
    handleScaleStart(e) {
        if (e.touches.length !== 2) return;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        // Calculate distance between touches
        const distance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        // Find what's under the center of the pinch
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        const point = this.canvasManager.getPointFromEvent({ clientX: centerX, clientY: centerY });
        
        const target = this.findStrokeAtPoint(point);
        
        if (target && (target.type === 'image-object' || target.selected)) {
            this.isScaling = true;
            this.scaleStartDistance = distance;
            this.scaleTarget = target;
            
            if (target.type === 'image-object') {
                this.scaleStartWidth = target.width;
                this.scaleStartHeight = target.height;
            }
        }
    }
    
    handleScaleMove(e) {
        if (!this.isScaling || e.touches.length !== 2) return;
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        // Calculate current distance
        const currentDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) + 
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        // Calculate scale factor
        const scaleFactor = currentDistance / this.scaleStartDistance;
        
        if (this.scaleTarget) {
            if (this.scaleTarget.type === 'image-object') {
                // Scale image object
                const newWidth = this.scaleStartWidth * scaleFactor;
                const newHeight = this.scaleStartHeight * scaleFactor;
                
                // Apply minimum and maximum size constraints
                const minSize = 50;
                const maxSize = 1000;
                
                this.scaleTarget.width = Math.max(minSize, Math.min(maxSize, newWidth));
                this.scaleTarget.height = Math.max(minSize, Math.min(maxSize, newHeight));
            } else if (this.scaleTarget.selected) {
                // Scale selected strokes
                this.scaleSelectedStrokes(scaleFactor);
            }
            
            this.redraw();
        }
    }
    
    handleScaleEnd() {
        if (this.isScaling) {
            this.isScaling = false;
            this.scaleTarget = null;
            this.undoManager.save(); // Save state after scaling
        }
    }
    
    scaleSelectedStrokes(scaleFactor) {
        // Find center of all selected strokes
        let centerX = 0, centerY = 0, count = 0;
        
        this.strokes.forEach(stroke => {
            if (stroke.selected) {
                if (stroke.type === 'image-object') {
                    centerX += stroke.position.x;
                    centerY += stroke.position.y;
                    count++;
                } else if (stroke.points) {
                    stroke.points.forEach(point => {
                        centerX += point.x;
                        centerY += point.y;
                        count++;
                    });
                }
            }
        });
        
        if (count === 0) return;
        
        centerX /= count;
        centerY /= count;
        
        // Scale all selected strokes around the center
        this.strokes.forEach(stroke => {
            if (stroke.selected) {
                if (stroke.type === 'image-object') {
                    // Scale image object
                    const newWidth = stroke.width * scaleFactor;
                    const newHeight = stroke.height * scaleFactor;
                    
                    const minSize = 50;
                    const maxSize = 1000;
                    
                    stroke.width = Math.max(minSize, Math.min(maxSize, newWidth));
                    stroke.height = Math.max(minSize, Math.min(maxSize, newHeight));
                } else if (stroke.points) {
                    // Scale stroke points
                    stroke.points = stroke.points.map(point => ({
                        x: centerX + (point.x - centerX) * scaleFactor,
                        y: centerY + (point.y - centerY) * scaleFactor
                    }));
                }
            }
        });
    }
}

export { DrawingManager };
