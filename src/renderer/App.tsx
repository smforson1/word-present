import { useEffect, useState } from 'react';
import OperatorConsole from './components/OperatorConsole';
import ProjectionScreen from './components/ProjectionScreen';
import MobileRemote from './components/MobileRemote';

export default function App() {
  const [view, setView] = useState<string>('operator');

  useEffect(() => {
    // Read route parameter
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view') || 'operator';
    setView(viewParam);

    // Read initial settings for theme
    if (window.api?.getSettings) {
      window.api.getSettings().then((settings) => {
        if (settings?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      });
    }

    // Bind to synchronization updates for status (theme sync)
    if (window.api?.onStatusUpdate) {
      const unsubscribe = window.api.onStatusUpdate((_, status) => {
        if (status && status.theme) {
          if (status.theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      });
      return unsubscribe;
    }
  }, []);

  switch (view) {
    case 'projection':
      return <ProjectionScreen />;
    case 'remote':
      return <MobileRemote />;
    case 'operator':
    default:
      return <OperatorConsole />;
  }
}
