import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BoardPage } from './BoardPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoardPage boardId="local" />
  </StrictMode>,
);
