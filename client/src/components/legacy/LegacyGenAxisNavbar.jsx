import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { UserButton, useClerk, useUser } from '@clerk/clerk-react';

const links = [
  { label: 'Workspace', to: '/ai' },
  { label: 'Features', to: '/product/feature' },
  { label: 'Documentation', to: '/resources/documentation' },
  { label: 'About', to: '/about' },
];

const linkClass = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
  isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
}`;

const LegacyGenAxisNavbar = () => {
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignIn = () => openSignIn();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/genaxis" aria-label="GenAxis home" className="flex shrink-0 items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg object-contain" />
          <span className="text-lg font-bold tracking-wide text-white">GenAxis</span>
        </Link>

        <nav aria-label="GenAxis navigation" className="hidden items-center gap-1 md:flex">
          {links.map((link) => <NavLink key={link.to} to={link.to} className={linkClass}>{link.label}</NavLink>)}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link to="/ai" className="rounded-xl border border-purple-300/25 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500/20">Open workspace</Link>
              <UserButton afterSignOutUrl="/genaxis" />
            </>
          ) : (
            <button type="button" onClick={handleSignIn} className="rounded-xl border border-purple-300/30 bg-gradient-to-r from-purple-600/80 to-blue-600/80 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">Sign in</button>
          )}
        </div>

        <button type="button" aria-label={menuOpen ? 'Close GenAxis menu' : 'Open GenAxis menu'} aria-expanded={menuOpen} aria-controls="legacy-genaxis-menu" onClick={() => setMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white md:hidden">
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {menuOpen && (
        <nav id="legacy-genaxis-menu" aria-label="Mobile GenAxis navigation" className="border-t border-white/10 bg-black/95 px-4 py-3 md:hidden">
          <div className="mx-auto max-w-7xl space-y-1">
            {links.map((link) => <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)} className={(state) => `${linkClass(state)} block w-full`}>{link.label}</NavLink>)}
            {user ? (
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <Link to="/ai" onClick={() => setMenuOpen(false)} className="rounded-xl border border-purple-300/25 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-white">Open workspace</Link>
                <UserButton afterSignOutUrl="/genaxis" />
              </div>
            ) : (
              <button type="button" onClick={handleSignIn} className="mt-2 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white">Sign in</button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};

export default LegacyGenAxisNavbar;
