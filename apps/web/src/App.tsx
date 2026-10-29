import { BoardPage } from './BoardPage';
import { authClient } from './lib/auth';
import { matchBoard, usePathname } from './lib/router';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  if (isPending) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading…</div>;
  }
  // Signing in keeps the URL, so deep links to a board work after login.
  if (!session) return <AuthPage />;

  const boardId = matchBoard(pathname);
  if (boardId) return <BoardPage key={boardId} boardId={boardId} />;
  return <DashboardPage />;
}
