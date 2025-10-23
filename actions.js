// Global Canvas Actions System
class CanvasActions {
    static delete(drawingManager, strokeIds) {
        // Remove strokes by ID (in reverse order to maintain indices)
        const sortedIds = strokeIds.sort((a, b) => b - a);
        
        sortedIds.forEach(id => {
            if (id >= 0 && id < drawingManager.strokes.length) {
                drawingManager.strokes.splice(id, 1);
            }
        });
        
        // Save state for undo
        drawingManager.undoManager.save();
        
        return { success: true, action: 'delete' };
    }
    
    static reflect(drawingManager, strokeIds) {
        // Get all strokes to be reflected
        const strokesToReflect = strokeIds
            .filter(id => id >= 0 && id < drawingManager.strokes.length)
            .map(id => drawingManager.strokes[id])
            .filter(stroke => stroke && stroke.points); // Only regular strokes
        
        if (strokesToReflect.length === 0) return { success: false, error: 'No valid strokes to reflect' };
        
        // Calculate center point of all strokes
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        strokesToReflect.forEach(stroke => {
            stroke.points.forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        });
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // Reflect each stroke
        strokesToReflect.forEach(stroke => {
            stroke.points = stroke.points.map(point => ({
                x: centerX - (point.x - centerX),
                y: point.y // Keep Y unchanged for horizontal reflection
            }));
        });
        
        // Save state for undo
        drawingManager.undoManager.save();
        
        return { success: true, action: 'reflect' };
    }
    
    static enlarge(drawingManager, strokeIds) {
        // Get all strokes to be enlarged
        const strokesToEnlarge = strokeIds
            .filter(id => id >= 0 && id < drawingManager.strokes.length)
            .map(id => drawingManager.strokes[id])
            .filter(stroke => stroke && stroke.points); // Only regular strokes
        
        if (strokesToEnlarge.length === 0) return { success: false, error: 'No valid strokes to enlarge' };
        
        // Calculate center point of all strokes
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        strokesToEnlarge.forEach(stroke => {
            stroke.points.forEach(point => {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            });
        });
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const scaleFactor = 1.5; // Fixed 150% enlargement
        
        // Enlarge each stroke
        strokesToEnlarge.forEach(stroke => {
            stroke.points = stroke.points.map(point => ({
                x: centerX + (point.x - centerX) * scaleFactor,
                y: centerY + (point.y - centerY) * scaleFactor
            }));
        });
        
        // Save state for undo
        drawingManager.undoManager.save();
        
        return { success: true, action: 'enlarge' };
    }
}
