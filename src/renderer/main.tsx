import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global error handlers to capture any React-crashing exceptions and overlay them on screen
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message;
  const stack = event.error?.stack || 'No stack trace available';
  
  if (window.api?.logError) {
    window.api.logError(msg, stack);
  }

  const errorDiv = document.createElement('div');
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '0';
  errorDiv.style.left = '0';
  errorDiv.style.width = '100vw';
  errorDiv.style.backgroundColor = '#f87171';
  errorDiv.style.color = '#ffffff';
  errorDiv.style.padding = '20px';
  errorDiv.style.zIndex = '999999';
  errorDiv.style.fontFamily = 'monospace';
  errorDiv.style.fontSize = '14px';
  errorDiv.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
  errorDiv.style.maxHeight = '50vh';
  errorDiv.style.overflowY = 'auto';
  
  errorDiv.innerHTML = `
    <h3 style="font-weight: bold; margin-bottom: 8px;">🚨 Unhandled Runtime Exception</h3>
    <p style="margin-bottom: 12px;"><strong>Message:</strong> ${msg}</p>
    <pre style="background: rgba(0, 0, 0, 0.2); padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${stack}</pre>
    <button onclick="this.parentElement.remove()" style="margin-top: 10px; background: white; color: #f87171; border: none; padding: 4px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Dismiss</button>
  `;
  document.body.appendChild(errorDiv);
});

window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = event.reason?.message || event.reason || 'Unknown reason';
  const stack = event.reason?.stack || 'No stack trace available';

  if (window.api?.logError) {
    window.api.logError(`Unhandled Promise Rejection: ${reasonStr}`, stack);
  }

  const errorDiv = document.createElement('div');
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '0';
  errorDiv.style.left = '0';
  errorDiv.style.width = '100vw';
  errorDiv.style.backgroundColor = '#fb923c';
  errorDiv.style.color = '#ffffff';
  errorDiv.style.padding = '20px';
  errorDiv.style.zIndex = '999999';
  errorDiv.style.fontFamily = 'monospace';
  errorDiv.style.fontSize = '14px';
  errorDiv.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
  errorDiv.style.maxHeight = '50vh';
  errorDiv.style.overflowY = 'auto';
  
  errorDiv.innerHTML = `
    <h3 style="font-weight: bold; margin-bottom: 8px;">⚠️ Unhandled Promise Rejection</h3>
    <p style="margin-bottom: 12px;"><strong>Reason:</strong> ${reasonStr}</p>
    <pre style="background: rgba(0, 0, 0, 0.2); padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${stack}</pre>
    <button onclick="this.parentElement.remove()" style="margin-top: 10px; background: white; color: #fb923c; border: none; padding: 4px 12px; border-radius: 4px; font-weight: bold; cursor: pointer;">Dismiss</button>
  `;
  document.body.appendChild(errorDiv);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
