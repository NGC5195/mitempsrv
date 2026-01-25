/*
  Modern CSS-animated Spinner
  More efficient than JS animation (uses GPU acceleration)
*/
'use strict';

function Spinner() {
  // Create overlay container
  Spinner.overlay = document.createElement('div');
  Spinner.overlay.className = 'spinner-overlay';
  
  // Create spinner container
  const spinnerContainer = document.createElement('div');
  spinnerContainer.className = 'spinner-container';
  
  // Create the spinner element (pulsing dots)
  Spinner.element = document.createElement('div');
  Spinner.element.className = 'spinner-dots';
  Spinner.element.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  
  // Create loading text
  const loadingText = document.createElement('div');
  loadingText.className = 'spinner-text';
  loadingText.textContent = 'Chargement...';
  
  spinnerContainer.appendChild(Spinner.element);
  spinnerContainer.appendChild(loadingText);
  Spinner.overlay.appendChild(spinnerContainer);
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .spinner-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(2px);
      z-index: 9999;
      justify-content: center;
      align-items: center;
    }
    
    .spinner-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    
    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid #e0e0e0;
      border-top: 4px solid #2196f3;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    .spinner-text {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #666;
      letter-spacing: 0.5px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* Alternative: Pulsing dots spinner */
    .spinner-dots {
      display: flex;
      gap: 8px;
    }
    
    .spinner-dots .dot {
      width: 12px;
      height: 12px;
      background: #2196f3;
      border-radius: 50%;
      animation: pulse 1.4s ease-in-out infinite;
    }
    
    .spinner-dots .dot:nth-child(1) { animation-delay: 0s; }
    .spinner-dots .dot:nth-child(2) { animation-delay: 0.2s; }
    .spinner-dots .dot:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes pulse {
      0%, 80%, 100% {
        transform: scale(0.6);
        opacity: 0.5;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(Spinner.overlay);
}

Spinner.overlay = null;
Spinner.element = null;

Spinner.show = function() {
  if (Spinner.overlay) {
    Spinner.overlay.style.display = 'flex';
  }
};

Spinner.hide = function() {
  if (Spinner.overlay) {
    Spinner.overlay.style.display = 'none';
  }
};
