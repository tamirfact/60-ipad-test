// Import environment variables
import './env.js';

// Import simple-undo library
import SimpleUndo from 'simple-undo';

// Import ToastManager
import { ToastManager } from './toastManager.js';

// Make SimpleUndo available globally for compatibility
window.SimpleUndo = SimpleUndo;

// Initialize ToastManager and make it globally available
window.toastManager = new ToastManager();

// Debug: Check what's loaded
console.log('After loading simple-undo:');
console.log('SimpleUndo defined:', typeof SimpleUndo !== 'undefined');
console.log('Available globals:', Object.keys(window).filter(key => key.includes('Undo') || key.includes('undo')));

// Import modules
import './canvas.js';
import './imageGen.js';
import './ai.js';
import './draw.js';
import './app.js';
