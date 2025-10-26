import { ImageGenerator } from './imageGen.js';

// AI Generation Logic for Image Generation
class AIGenerator {
    constructor() {
        this.apiKey = window.OPENAI_API_KEY;
        this.imageGenerator = new ImageGenerator(this.apiKey);
    }

    async analyzeAction(imageData, contentType, canvasContext) {
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
                            text: `Analyze the dragged content and canvas state to determine:
1. action_type: "generate" (new image from sketch), "update" (edit existing image), or "execute_action" (perform action like delete)
2. image_prompt: Detailed prompt for image generation (if generate/update)
3. description: What action is being performed

IMPORTANT: The sketch lines are artistic guidance and direction - not literal content to copy. They represent the user's intent and artistic vision, not the actual image content.

Context provided:
- Dragged content type: ${contentType}
- Canvas has images: ${canvasContext.hasImages}
- Canvas has strokes: ${canvasContext.hasStrokes}
- Image count: ${canvasContext.imageCount}
- Stroke count: ${canvasContext.strokeCount}

Return JSON: {"action_type": "...", "image_prompt": "...", "description": "..."}`
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
                action_type: "generate",
                image_prompt: "A beautiful artistic illustration",
                description: "Generate new image from sketch"
            };
        }
    }

    async processDrawing(drawingManager, draggedStrokes) {
        try {
            // Analyze content type
            const contentType = this.analyzeContent(draggedStrokes);
            const canvasContext = drawingManager.getCanvasContext();
            
            // Capture the drawing as image (now async)
            const imageData = await this.captureSelectedStrokes(drawingManager, draggedStrokes);
            
            // Show debug toast with captured image
            drawingManager.canvasManager.showToast('Analyzing...', imageData);
            
            // Wait a moment to show the debug image
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if we have both strokes and images for the two-step process
            const hasImages = draggedStrokes.some(stroke => stroke.type === 'image-object');
            const hasStrokes = draggedStrokes.some(stroke => stroke.type !== 'image-object');
            
            if (hasImages && hasStrokes) {
                // Two-step process: generate options first
                await this.generateEditOptions(drawingManager, imageData, draggedStrokes);
            } else {
                // Single-step process: direct action
                const action = await this.analyzeAction(imageData, contentType, canvasContext);
                
                // Execute based on action type
                switch(action.action_type) {
                    case 'generate':
                        await this.generateNewImage(drawingManager, action.image_prompt, imageData);
                        break;
                    case 'update':
                        await this.updateExistingImage(drawingManager, action.image_prompt, draggedStrokes);
                        break;
                    case 'execute_action':
                        await this.executeCustomAction(drawingManager, action, draggedStrokes);
                        break;
                }
            }
            
        } catch (error) {
            console.error('Error processing drawing:', error);
            drawingManager.canvasManager.showToast('Processing failed');
        }
    }

    async captureSelectedStrokes(drawingManager, draggedStrokes) {
        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Calculate bounding box of selected strokes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        draggedStrokes.forEach(stroke => {
            if (stroke.type === 'image-object') {
                // For image objects, use position and dimensions
                const x = stroke.position.x - stroke.width / 2;
                const y = stroke.position.y - stroke.height / 2;
                minX = Math.min(minX, x - 10);
                minY = Math.min(minY, y - 10);
                maxX = Math.max(maxX, x + stroke.width + 10);
                maxY = Math.max(maxY, y + stroke.height + 10);
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
        
        // Create a promise to wait for all images to load
        const imagePromises = [];
        
        // First, draw all images (background layer)
        draggedStrokes.forEach(stroke => {
            if (stroke.type === 'image-object') {
                // Draw image object
                if (stroke.imageData) {
                    const img = new Image();
                    const imagePromise = new Promise((resolve) => {
                        img.onload = () => {
                            const x = stroke.position.x - minX + 40 - stroke.width / 2;
                            const y = stroke.position.y - minY + 40 - stroke.height / 2;
                            
                            // Draw white border for image
                            tempCtx.fillStyle = 'white';
                            tempCtx.fillRect(x - 10, y - 10, stroke.width + 20, stroke.height + 20);
                            
                            // Draw shadow
                            tempCtx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                            tempCtx.shadowBlur = 15;
                            tempCtx.shadowOffsetX = 5;
                            tempCtx.shadowOffsetY = 5;
                            
                            // Draw image
                            tempCtx.drawImage(img, x, y, stroke.width, stroke.height);
                            
                            // Reset shadow
                            tempCtx.shadowColor = 'transparent';
                            tempCtx.shadowBlur = 0;
                            tempCtx.shadowOffsetX = 0;
                            tempCtx.shadowOffsetY = 0;
                            
                            resolve();
                        };
                        img.src = `data:image/png;base64,${stroke.imageData}`;
                    });
                    imagePromises.push(imagePromise);
                }
            }
        });
        
        // Wait for all images to load first
        await Promise.all(imagePromises);
        
        // Then draw all strokes on top (foreground layer)
        draggedStrokes.forEach(stroke => {
            if (stroke.type !== 'image-object' && stroke.points && stroke.points.length > 1) {
                // Draw regular stroke with pressure-based line width
                tempCtx.lineCap = 'round';
                tempCtx.lineJoin = 'round';
                tempCtx.strokeStyle = '#000000'; // Ensure black color
                
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
        
        // Return the final composition
        return tempCanvas.toDataURL('image/png');
    }

    analyzeContent(draggedStrokes) {
        const hasImages = draggedStrokes.some(stroke => stroke.type === 'image-object');
        const hasStrokes = draggedStrokes.some(stroke => stroke.type !== 'image-object');
        
        if (hasImages && hasStrokes) {
            return 'sketch + image';
        } else if (hasImages) {
            return 'image only';
        } else {
            return 'sketch only';
        }
    }
    
    async generateNewImage(drawingManager, prompt, sketchImageData) {
        // Remove original sketch strokes first
        const originalStrokes = drawingManager.draggedStrokes.filter(stroke => stroke.type !== 'image-object');
        originalStrokes.forEach(stroke => {
            const index = drawingManager.strokes.indexOf(stroke);
            if (index > -1) {
                drawingManager.strokes.splice(index, 1);
            }
        });
        
        // Create placeholder image object
        const imageObj = {
            type: 'image-object',
            position: { 
                x: drawingManager.canvas.width / 2, 
                y: drawingManager.canvas.height / 2 
            },
            width: 512,
            height: 512,
            imageData: null,
            selected: false,
            isGenerating: true,
            currentFrame: 0
        };
        
        drawingManager.strokes.push(imageObj);
        drawingManager.redraw();
        
        // Start animation loop for generating state
        const animateGeneration = () => {
            if (imageObj.isGenerating) {
                drawingManager.redraw();
                requestAnimationFrame(animateGeneration);
            }
        };
        animateGeneration();
        
        // Show generating toast
        drawingManager.canvasManager.showToast('Generating image...');
        
        try {
            // Create a realistic prompt based on the sketch
            const realisticPrompt = `Create a photorealistic, high-quality image based on this sketch. The sketch lines are artistic guidance and direction - not the actual image content. Use the sketch as inspiration to generate a realistic, professional image with proper lighting, shadows, and details. ${prompt}`;
            
            await this.imageGenerator.generateImage(
                realisticPrompt,
                (partialBase64, frameIndex) => {
                    // Not used for single image
                },
                (finalBase64) => {
                    // Update final image and resize to match actual proportions
                    imageObj.imageData = finalBase64;
                    imageObj.isGenerating = false;
                    
                    // Load the image to get its actual dimensions
                    const img = new Image();
                    img.onload = () => {
                        // Calculate new dimensions maintaining aspect ratio
                        const maxSize = 512;
                        const aspectRatio = img.width / img.height;
                        
                        if (aspectRatio > 1) {
                            // Landscape
                            imageObj.width = maxSize;
                            imageObj.height = maxSize / aspectRatio;
                        } else {
                            // Portrait or square
                            imageObj.height = maxSize;
                            imageObj.width = maxSize * aspectRatio;
                        }
                        
                        drawingManager.undoManager.save();
                        drawingManager.redraw();
                        drawingManager.canvasManager.showToast('Image generated!');
                    };
                    img.src = `data:image/png;base64,${finalBase64}`;
                },
                sketchImageData
            );
        } catch (error) {
            console.error('Image generation failed:', error);
            // Remove failed image object
            const index = drawingManager.strokes.indexOf(imageObj);
            if (index > -1) {
                drawingManager.strokes.splice(index, 1);
            }
            drawingManager.redraw();
            drawingManager.canvasManager.showToast('Image generation failed');
        }
    }
    
    async updateExistingImage(drawingManager, prompt, draggedStrokes) {
        // Find the image object to update
        const imageObj = draggedStrokes.find(stroke => stroke.type === 'image-object');
        if (!imageObj) {
            drawingManager.canvasManager.showToast('No image found to update');
            return;
        }
        
        // Remove sketch strokes first
        const sketchStrokes = draggedStrokes.filter(stroke => stroke.type !== 'image-object');
        sketchStrokes.forEach(stroke => {
            const index = drawingManager.strokes.indexOf(stroke);
            if (index > -1) {
                drawingManager.strokes.splice(index, 1);
            }
        });
        
        // Set generating state
        imageObj.isGenerating = true;
        imageObj.currentFrame = 0;
        drawingManager.redraw();
        
        // Start animation loop for generating state
        const animateGeneration = () => {
            if (imageObj.isGenerating) {
                drawingManager.redraw();
                requestAnimationFrame(animateGeneration);
            }
        };
        animateGeneration();
        
        drawingManager.canvasManager.showToast('Updating image...');
        
        try {
            // Convert image to blob for editing
            const imageBlob = this.imageGenerator.base64ToBlob(imageObj.imageData);
            
            // Create enhanced prompt for image editing
            const enhancedPrompt = `Update this image based on the sketch guidance provided. The sketch lines are artistic direction and intent - not literal content to copy. Use the sketch as inspiration to modify the existing image while maintaining its realistic, professional quality. ${prompt}`;
            
            await this.imageGenerator.editImage(
                [imageBlob],
                enhancedPrompt,
                (partialBase64, frameIndex) => {
                    // Not used for single image
                },
                (finalBase64) => {
                    imageObj.imageData = finalBase64;
                    imageObj.isGenerating = false;
                    
                    // Load the image to get its actual dimensions
                    const img = new Image();
                    img.onload = () => {
                        // Calculate new dimensions maintaining aspect ratio
                        const maxSize = 512;
                        const aspectRatio = img.width / img.height;
                        
                        if (aspectRatio > 1) {
                            // Landscape
                            imageObj.width = maxSize;
                            imageObj.height = maxSize / aspectRatio;
                        } else {
                            // Portrait or square
                            imageObj.height = maxSize;
                            imageObj.width = maxSize * aspectRatio;
                        }
                        
                        drawingManager.undoManager.save();
                        drawingManager.redraw();
                        drawingManager.canvasManager.showToast('Image updated!');
                    };
                    img.src = `data:image/png;base64,${finalBase64}`;
                }
            );
        } catch (error) {
            console.error('Image update failed:', error);
            imageObj.isGenerating = false;
            drawingManager.redraw();
            drawingManager.canvasManager.showToast('Image update failed');
        }
    }
    
    async executeCustomAction(drawingManager, action, draggedStrokes) {
        // Handle custom actions like delete
        if (action.description.toLowerCase().includes('delete')) {
            // Remove dragged strokes
            const strokeIds = draggedStrokes.map(s => drawingManager.strokes.indexOf(s));
            strokeIds.sort((a, b) => b - a); // Sort in reverse order
            
            strokeIds.forEach(id => {
                if (id >= 0 && id < drawingManager.strokes.length) {
                    drawingManager.strokes.splice(id, 1);
                }
            });
            
            drawingManager.undoManager.save();
            drawingManager.redraw();
            drawingManager.canvasManager.showToast('Items deleted');
        }
    }
    
    async generateEditOptions(drawingManager, imageData, draggedStrokes) {
        try {
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
                                text: `Analyze this image with sketch overlays. The sketch lines are artistic guidance for editing the existing image. Generate 2-4 specific, actionable edit options that the user might want to apply to the image. Each option should be a clear, concise instruction (1-3 words) that describes what to do to the image.

Return JSON array: ["option1", "option2", "option3", "option4"]

Examples: ["Add hat", "Change color", "Add background", "Make cartoon"]`
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
            
            let options;
            try {
                const parsed = JSON.parse(content);
                options = parsed.options || parsed; // Handle different response formats
            } catch (e) {
                console.error('Failed to parse options:', content);
                options = ["Add details", "Change style", "Add effects", "Modify colors"];
            }
            
            // Show options to user
            this.showEditOptions(drawingManager, options, draggedStrokes);
            
        } catch (error) {
            console.error('Error generating options:', error);
            drawingManager.canvasManager.showToast('Failed to generate options');
        }
    }
    
    showEditOptions(drawingManager, options, draggedStrokes) {
        const editOptions = document.getElementById('editOptions');
        const editChips = document.getElementById('editChips');
        const dismissBtn = document.getElementById('dismissOptions');
        
        // Clear existing chips
        editChips.innerHTML = '';
        
        // Create chips for each option
        options.forEach((option, index) => {
            const chip = document.createElement('button');
            chip.className = 'edit-chip';
            chip.textContent = option;
            chip.onclick = () => this.selectEditOption(drawingManager, option, draggedStrokes);
            editChips.appendChild(chip);
        });
        
        // Show the options panel
        editOptions.classList.remove('edit-options-hidden');
        editOptions.classList.add('edit-options-visible');
        
        // Handle dismiss button
        dismissBtn.onclick = () => {
            this.hideEditOptions();
        };
        
        // Store current state for later use
        this.pendingEditOptions = { drawingManager, draggedStrokes };
    }
    
    hideEditOptions() {
        const editOptions = document.getElementById('editOptions');
        editOptions.classList.remove('edit-options-visible');
        editOptions.classList.add('edit-options-hidden');
        this.pendingEditOptions = null;
    }
    
    async selectEditOption(drawingManager, selectedOption, draggedStrokes) {
        // Hide options panel
        this.hideEditOptions();
        
        // Find the image object to edit
        const imageObj = draggedStrokes.find(stroke => stroke.type === 'image-object');
        if (!imageObj) {
            drawingManager.canvasManager.showToast('No image found to edit');
            return;
        }
        
        // Remove sketch strokes
        const sketchStrokes = draggedStrokes.filter(stroke => stroke.type !== 'image-object');
        sketchStrokes.forEach(stroke => {
            const index = drawingManager.strokes.indexOf(stroke);
            if (index > -1) {
                drawingManager.strokes.splice(index, 1);
            }
        });
        
        // Set generating state
        imageObj.isGenerating = true;
        imageObj.currentFrame = 0;
        drawingManager.redraw();
        
        // Start animation loop
        const animateGeneration = () => {
            if (imageObj.isGenerating) {
                drawingManager.redraw();
                requestAnimationFrame(animateGeneration);
            }
        };
        animateGeneration();
        
        drawingManager.canvasManager.showToast(`Applying: ${selectedOption}...`);
        
        try {
            // Convert image to blob for editing
            const imageBlob = this.imageGenerator.base64ToBlob(imageObj.imageData);
            
            // Create enhanced prompt with selected option
            const enhancedPrompt = `Apply this edit to the image: "${selectedOption}". The sketch lines were artistic guidance for this specific edit. Make the change while maintaining realistic, professional quality.`;
            
            await this.imageGenerator.editImage(
                [imageBlob],
                enhancedPrompt,
                (partialBase64, frameIndex) => {
                    // Not used for single image
                },
                (finalBase64) => {
                    imageObj.imageData = finalBase64;
                    imageObj.isGenerating = false;
                    
                    // Load the image to get its actual dimensions
                    const img = new Image();
                    img.onload = () => {
                        // Calculate new dimensions maintaining aspect ratio
                        const maxSize = 512;
                        const aspectRatio = img.width / img.height;
                        
                        if (aspectRatio > 1) {
                            // Landscape
                            imageObj.width = maxSize;
                            imageObj.height = maxSize / aspectRatio;
                        } else {
                            // Portrait or square
                            imageObj.height = maxSize;
                            imageObj.width = maxSize * aspectRatio;
                        }
                        
                        drawingManager.undoManager.save();
                        drawingManager.redraw();
                        drawingManager.canvasManager.showToast('Image updated!');
                    };
                    img.src = `data:image/png;base64,${finalBase64}`;
                }
            );
        } catch (error) {
            console.error('Image update failed:', error);
            imageObj.isGenerating = false;
            drawingManager.redraw();
            drawingManager.canvasManager.showToast('Image update failed');
        }
    }
}

export { AIGenerator };
