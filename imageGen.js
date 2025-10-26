// Image Generation Module using new OpenAI API
class ImageGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    
    async generateImage(prompt, onPartialImage, onComplete, sketchImageData = null) {
        try {
            // Use GPT Image 1 for fastest generation with lowest quality
            const response = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-image-1',
                    prompt: prompt,
                    size: '1024x1024',
                    quality: 'low',
                    n: 1
                })
            });

            if (!response.ok) {
                throw new Error(`Image generation failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Extract image data from response (GPT Image 1 format)
            if (result.data && result.data.length > 0) {
                const imageBase64 = result.data[0].b64_json;
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
            // Use GPT Image 1 for image editing with smallest size and lowest quality
            const formData = new FormData();
            formData.append('model', 'gpt-image-1');
            formData.append('prompt', prompt);
            formData.append('size', '1024x1024');
            formData.append('quality', 'low');
            formData.append('n', '1');
            
            // Add only the first image (edits endpoint expects single 'image' parameter)
            if (images.length > 0) {
                formData.append('image', images[0], 'image.png');
            } else {
                throw new Error('No image provided for editing');
            }
            
            const response = await fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Image edit failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Extract image data from response (GPT Image 1 format)
            if (result.data && result.data.length > 0) {
                const imageBase64 = result.data[0].b64_json;
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

export { ImageGenerator };
