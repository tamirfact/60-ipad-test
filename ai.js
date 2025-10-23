// AI Generation Logic for Smart Objects
class AIGenerator {
    constructor() {
        this.apiKey = window.OPENAI_API_KEY;
    }

    async analyzeDrawing(imageData) {
        if (!this.apiKey || this.apiKey === 'your-openai-api-key-here') {
            throw new Error('OpenAI API key not found. Please set it in env.js file.');
        }
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Analyze this drawing and return a JSON object with: "emoji" (single emoji representing the drawing), "behavior" (creative description), and optionally "action" (one of: "delete", "reflect", "enlarge" if the drawing represents that action - e.g., trash can = delete, mirror = reflect, magnifying glass = enlarge). Return ONLY valid JSON, no other text. Example: {"emoji": "🎨", "behavior": "Creative tool"} or {"emoji": "🗑️", "behavior": "Deletes items", "action": "delete"}'
                        },
                        {
                            type: 'image_url',
                            image_url: { 
                                url: imageData,
                                detail: 'low'
                            }
                        }
                    ]
                }],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const content = result.choices[0].message.content;

        try {
            return JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse JSON response:', content);
            // Fallback if JSON parsing fails
            return {
                emoji: "📦",
                behavior: "A mysterious object that reacts to touch"
            };
        }
    }

    async processDrawing(drawingManager, draggedStrokes) {
        try {
            // Capture the drawing as image
            const imageData = this.captureSelectedStrokes(drawingManager, draggedStrokes);
            
            // Show debug toast with captured image
            drawingManager.canvasManager.showToast('Sending to AI...', imageData);
            
            // Wait a moment to show the debug image
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Process with LLM
            const result = await this.analyzeDrawing(imageData);
            
            // Create smart object
            this.createSmartObject(drawingManager, result, draggedStrokes);
            
            // Show success toast
            drawingManager.canvasManager.showToast('Smart object created!');
            
        } catch (error) {
            console.error('Error processing drawing:', error);
            drawingManager.canvasManager.showToast('Processing failed');
        }
    }

    captureSelectedStrokes(drawingManager, draggedStrokes) {
        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Calculate bounding box of selected strokes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        draggedStrokes.forEach(stroke => {
            if (stroke.type === 'smart-object') {
                // For smart objects, use position and radius
                const radius = 40;
                minX = Math.min(minX, stroke.position.x - radius);
                minY = Math.min(minY, stroke.position.y - radius);
                maxX = Math.max(maxX, stroke.position.x + radius);
                maxY = Math.max(maxY, stroke.position.y + radius);
            } else if (stroke.points) {
                // For regular strokes, use points
                stroke.points.forEach(point => {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                });
            }
        });
        
        const width = maxX - minX + 80; // Add more padding
        const height = maxY - minY + 80;
        
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        // Set up context
        tempCtx.lineCap = 'round';
        tempCtx.lineJoin = 'round';
        tempCtx.strokeStyle = '#000000';
        
        // Fill with white background
        tempCtx.fillStyle = '#FFFFFF';
        tempCtx.fillRect(0, 0, width, height);
        
        // Add subtle border for clarity
        tempCtx.strokeStyle = '#E0E0E0';
        tempCtx.lineWidth = 1;
        tempCtx.strokeRect(0, 0, width, height);
        
        // Draw selected strokes
        draggedStrokes.forEach(stroke => {
            if (stroke.type === 'smart-object') {
                // Draw smart object as emoji
                tempCtx.save();
                tempCtx.font = '48px Arial, sans-serif';
                tempCtx.textAlign = 'center';
                tempCtx.textBaseline = 'middle';
                tempCtx.fillStyle = '#000000';
                
                const x = stroke.position.x - minX + 40;
                const y = stroke.position.y - minY + 40;
                tempCtx.fillText(stroke.emoji, x, y);
                tempCtx.restore();
            } else if (stroke.points && stroke.points.length > 1) {
                // Draw regular stroke with pressure-based line width
                tempCtx.lineCap = 'round';
                tempCtx.lineJoin = 'round';
                
                // Draw each segment with its own pressure
                for (let i = 1; i < stroke.points.length; i++) {
                    const prevPoint = stroke.points[i - 1];
                    const currentPoint = stroke.points[i];
                    const pressure = stroke.pressures ? stroke.pressures[i] : 0.5;
                    
                    // Set line width based on pressure (same as canvas)
                    tempCtx.lineWidth = Math.max(2, pressure * 20);
                    
                    // Draw this segment
                    tempCtx.beginPath();
                    tempCtx.moveTo(prevPoint.x - minX + 40, prevPoint.y - minY + 40);
                    tempCtx.lineTo(currentPoint.x - minX + 40, currentPoint.y - minY + 40);
                    tempCtx.stroke();
                }
            }
        });
        
        return tempCanvas.toDataURL('image/png');
    }

    createSmartObject(drawingManager, result, draggedStrokes) {
        // Place smart object in the center of the canvas
        const centerX = drawingManager.canvas.width / 2;
        const centerY = drawingManager.canvas.height / 2;
        
        // Create smart object
        const smartObject = {
            type: 'smart-object',
            position: { x: centerX, y: centerY },
            emoji: result.emoji,
            behavior: result.behavior,
            action: result.action || null,
            selected: false
        };
        
        // Remove original strokes
        draggedStrokes.forEach(stroke => {
            const index = drawingManager.strokes.indexOf(stroke);
            if (index > -1) {
                drawingManager.strokes.splice(index, 1);
            }
        });
        
        // Add smart object
        drawingManager.strokes.push(smartObject);
        
        // Save state for undo
        drawingManager.undoManager.save();
        
        // Clear selection
        drawingManager.draggedStrokes = [];
        drawingManager.selectedStrokes = [];
        
        drawingManager.redraw();
    }
}
