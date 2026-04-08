import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/styles.css'
import './styles/styles.scss'
import App from './App.tsx'
import createFactories from '../mocks/createFactories';

const { MODE } = import.meta.env;

  async function enableMocking() {
    if (MODE !== 'development') {
      return
    }

    createFactories();

    const { worker } = await import('../mocks/browser')

    return worker.start({
      // onUnhandledRequest: 'bypass', // Игнорировать запросы, для которых нет моков
    })
  }

enableMocking().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
));