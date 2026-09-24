import { createElement, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Heart, LogOut, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuth from '../hooks/useAuth';

const primaryLinks = [
  { label: 'Shop', to: '/shop' },
  { label: 'Categories', to: '/categories' },
  { label: 'Deals', to: '/deals' },
];

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
    isActive ? 'text-white bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/5'
  }`;

const Navbar = () => {
  const { status, user, profile, signOut } = useAuth();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [showNavbar, setShowNavbar] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lastScrollY = useRef(typeof window === 'undefined' ? 0 : window.scrollY);
  const isAuthenticated = status === 'authenticated';
  const displayName = profile?.display_name
    || user?.user_metadata?.display_name
    || user?.user_metadata?.full_name
    || user?.email
    || 'Your account';
  const avatarUrl = profile?.avatar_url
    || user?.user_metadata?.avatar_url
    || user?.user_metadata?.picture;

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 10);
      setShowNavbar(!(y > lastScrollY.current && y > 100));
      lastScrollY.current = y;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setShowNavbar(true);
  }, [location.pathname]);

  const utilityLinks = [
    { label: 'Search', to: '/search', icon: Search },
    { label: 'Wishlist', to: '/account/wishlist', icon: Heart },
    { label: 'Cart', to: '/cart', icon: ShoppingBag },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      setMobileMenuOpen(false);
    } catch (error) {
      toast.error(error.message || 'We could not sign you out. Please try again.');
    }
  };

  const renderAccountAvatar = () => (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-purple-500/10 text-purple-200">
      {avatarUrl
        ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        : <UserRound className="h-4 w-4" aria-hidden="true" />}
    </span>
  );

  return (
    <>
      <motion.header
        initial={reduceMotion ? false : { y: -100 }}
        animate={{ y: reduceMotion || showNavbar ? 0 : -100 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
          scrolled ? 'border-white/10 bg-black/70 backdrop-blur-2xl' : 'border-transparent bg-black/15 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="XSHOP home" className="group flex shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-300/30 bg-gradient-to-br from-purple-500/30 to-blue-500/20 shadow-[0_0_24px_rgba(168,85,247,0.16)] transition-transform duration-300 group-hover:scale-105">
              <ShoppingBag className="h-4 w-4 text-purple-100" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-[0.16em] text-white">XSHOP</span>
          </Link>

          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {primaryLinks.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-1 md:flex">
            {utilityLinks.map(({ label, to, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                aria-label={label}
                title={label}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-white/70 transition-all duration-200 hover:border-white/10 hover:bg-white/5 hover:text-white"
              >
                {createElement(Icon, { className: 'h-[18px] w-[18px]', 'aria-hidden': true })}
              </Link>
            ))}
            <span className="mx-2 h-6 w-px bg-white/10" aria-hidden="true" />
            {status === 'loading' ? (
              <span className="h-9 w-20 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link to="/account" aria-label={`Account: ${displayName}`} title={displayName} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm font-medium text-white/90 transition hover:border-purple-300/30 hover:bg-white/[0.08]">
                  {renderAccountAvatar()}
                  <span className="hidden max-w-24 truncate lg:inline">Account</span>
                </Link>
                <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:border-red-300/30 hover:bg-red-500/10 hover:text-white">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:border-purple-300/60 hover:bg-purple-500/20 hover:shadow-[0_0_24px_rgba(168,85,247,0.18)]"
              >
                Sign in
              </Link>
            )}
          </div>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="xshop-mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white md:hidden"
          >
            {mobileMenuOpen
              ? <X className="h-5 w-5" aria-hidden="true" />
              : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            id="xshop-mobile-navigation"
            aria-label="Mobile navigation"
            initial={reduceMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            className="fixed inset-x-0 top-[68px] z-40 border-b border-white/10 bg-black/95 px-4 pb-5 pt-3 shadow-2xl shadow-black/40 backdrop-blur-2xl md:hidden"
          >
            <div className="mx-auto max-w-7xl space-y-1">
              {primaryLinks.map((item) => (
                <NavLink key={item.to} to={item.to} className={(state) => `${linkClass(state)} block w-full`}>
                  {item.label}
                </NavLink>
              ))}
              <div className="my-3 border-t border-white/10" />
              {utilityLinks.map(({ label, to, icon: Icon }) => (
                <NavLink key={to} to={to} className={(state) => `${linkClass(state)} block w-full`}>
                  <span className="flex items-center gap-3">
                    {createElement(Icon, { className: 'h-4 w-4 text-purple-300', 'aria-hidden': true })}
                    {label}
                  </span>
                </NavLink>
              ))}
              <div className="my-3 border-t border-white/10" />
              {status === 'loading' ? (
                <div className="h-11 animate-pulse rounded-xl bg-white/5" aria-hidden="true" />
              ) : isAuthenticated ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <Link to="/account" className="flex min-w-0 items-center gap-3 text-sm text-white/90">
                    {renderAccountAvatar()}
                    <span className="truncate">{displayName}</span>
                  </Link>
                  <button type="button" onClick={handleSignOut} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-red-300/30 hover:bg-red-500/10 hover:text-white">
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
                  </button>
                </div>
              ) : (
                <Link to="/login" className="block rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">
                  Sign in
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
