// Import environment variables
import './env.js';

// Import simple-undo library
import SimpleUndo from 'simple-undo';

// Make SimpleUndo available globally for compatibility
window.SimpleUndo = SimpleUndo;

// Debug: Check what's loaded
console.log('After loading simple-undo:');
console.log('SimpleUndo defined:', typeof SimpleUndo !== 'undefined');
console.log('Available globals:', Object.keys(window).filter(key => key.includes('Undo') || key.includes('undo')));

// Import modules
import './canvas.js';
import './imageGen.js';
import './ai.js';
import './aiUploadHandler.js';
import './draw.js';
import './app.js';
