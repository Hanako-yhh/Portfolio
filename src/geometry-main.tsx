import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GeometrySystemApp } from './experiments/geometry-system/GeometrySystemApp';
import './experiments/geometry-system/geometry-system.css';

const rootElement = document.getElementById('geometry-root');

if (!rootElement) {
  throw new Error('Geometry system root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <GeometrySystemApp />
  </StrictMode>,
);
