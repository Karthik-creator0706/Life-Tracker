import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AlertsProvider } from './alerts';
import { AuthProvider } from './auth';
import { TempleProvider } from './temple';
import Ambient from './components/Ambient';
import Toaster from './components/Toaster';
import { applyTheme, currentTheme } from './theme';
import '@fontsource-variable/plus-jakarta-sans'; // the app font, bundled so it works offline
import '@fontsource/bangers/latin-400.css'; // comic-book headings for the Spider-Man theme
import '@fontsource/bebas-neue/latin-400.css'; // sleek headings for The Amazing Spider-Man theme
import './styles.css';

applyTheme(currentTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertsProvider>
          <TempleProvider>
            <Ambient />
            <App />
            <Toaster />
          </TempleProvider>
        </AlertsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
