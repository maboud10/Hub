import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/tiles.css';
import './styles/overlays.css';
import './styles/home.css';
import './styles/login.css';
import './styles/admin.css';
import './styles/pages.css';
import App from './App';
import { devBootstrap } from './devBootstrap';

devBootstrap();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
