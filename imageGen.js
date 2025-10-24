// Image Generation Module using new OpenAI API
class ImageGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    
    async generateImage(prompt, onPartialImage, onComplete, sketchImageData = null) {
        try {
            let response;
            
            if (sketchImageData) {
                // Use new API with image input for sketch-based generation
                response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-4.1',
                        input: [
                            {
                                role: 'user',
                                content: [
                                    { type: 'input_text', text: prompt },
                                    {
                                        type: 'input_image',
                                        image_url: sketchImageData
                                    }
                                ]
                            }
                        ],
                        tools: [{ type: 'image_generation' }]
                    })
                });
            } else {
                // Use new API for text-only generation
                response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'gpt-5',
                        input: prompt,
                        tools: [{ type: 'image_generation' }]
                    })
                });
            }

            if (!response.ok) {
                throw new Error(`Image generation failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Extract image data from response
            const imageData = result.output
                .filter((output) => output.type === 'image_generation_call')
                .map((output) => output.result);

            if (imageData.length > 0) {
                const imageBase64 = imageData[0];
                onComplete(imageBase64);
            } else {
                throw new Error('No image generated');
            }
        } catch (error) {
            console.error('Image generation error:', error);
            throw error;
        }
    }
    
    async editImage(images, prompt, onPartialImage, onComplete) {
        try {
            // Convert images to base64 data URLs
            const imageInputs = images.map(imageBlob => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(imageBlob);
                });
            });
            
            const imageDataUrls = await Promise.all(imageInputs);
            
            const response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4.1',
                    input: [
                        {
                            role: 'user',
                            content: [
                                { type: 'input_text', text: prompt },
                                ...imageDataUrls.map(url => ({
                                    type: 'input_image',
                                    image_url: url
                                }))
                            ]
                        }
                    ],
                    tools: [{ type: 'image_generation' }]
                })
            });

            if (!response.ok) {
                throw new Error(`Image edit failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Extract image data from response
            const imageData = result.output
                .filter((output) => output.type === 'image_generation_call')
                .map((output) => output.result);

            if (imageData.length > 0) {
                const imageBase64 = imageData[0];
                onComplete(imageBase64);
            } else {
                throw new Error('No image generated');
            }
        } catch (error) {
            console.error('Image edit error:', error);
            throw error;
        }
    }
    
    // Helper method to convert base64 to blob
    base64ToBlob(base64) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: 'image/png' });
    }
}
