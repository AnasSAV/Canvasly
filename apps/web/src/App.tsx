import { BoardPage, SharedLinkPage } from './BoardPage';
import { authClient } from './lib/auth';
import { matchBoard, matchShareLink, usePathname } from './lib/router';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { Loader } from './ui/Logo';

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  // Reached from the emailed link, signed out.
  if (pathname === '/reset-password') return <ResetPasswordPage />;

  // Share links work signed out too (public view-only boards), so they're routed before the session gate.
  const shareToken = matchShareLink(pathname);
  if (shareToken) return <SharedLinkPage key={shareToken} token={shareToken} />;

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center bg-app">
        <Loader />
      </div>
    );
  }
  // Signing in keeps the URL, so deep links to a board work after login.
  if (!session) return <AuthPage />;

  const boardId = matchBoard(pathname);
  if (boardId) return <BoardPage key={boardId} boardId={boardId} />;
  return <DashboardPage />;
}
