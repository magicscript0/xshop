import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';

const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <section className="flex min-h-[55vh] items-center justify-center px-4 pt-24" aria-live="polite">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-gray-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" aria-hidden="true" />
          Restoring your session…
        </div>
      </section>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <Outlet />;
};

export default RequireAuth;
