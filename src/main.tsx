import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ChatBot from './components/ChatBot.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ChatBot />
  </StrictMode>,
)
