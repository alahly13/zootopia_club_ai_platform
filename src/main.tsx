/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { installStartupGuard, renderStartupFallback } from './bootstrap/installStartupGuard.ts';
import { installApiRuntimeFetchBridge } from './config/runtime.ts';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element "#root" was not found.');
}

const cleanupStartupGuard = installStartupGuard(rootElement);
installApiRuntimeFetchBridge();

try {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  cleanupStartupGuard();
  renderStartupFallback(rootElement, {
    title: 'Platform startup failed',
    message:
      'The application could not finish initializing, so the startup guard rendered a visible recovery state instead of leaving a blank page.',
    detail: error instanceof Error ? error.message : String(error),
    tone: 'error',
  });

  throw error;
}
