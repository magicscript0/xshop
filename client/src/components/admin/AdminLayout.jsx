import { createElement, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BadgePercent, Boxes, CreditCard, LayoutDashboard, Menu, PackageOpen,
  Settings2, ShieldCheck, ShoppingCart, Tags, Users, Wallet, X,
} from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import usePageMeta from '../../hooks/usePageMeta';

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'super_admin'], end: true },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, roles: ['support', 'admin', 'super_admin'] },
  { to: '/admin/payments', label: 'Payment review', icon: ShieldCheck, roles: ['admin', 'super_admin'] },
  { to: '/admin/products', label: 'Products', icon: PackageOpen, roles: ['admin', 'super_admin'] },
  { to: '/admin/categories', label: 'Categories', icon: Tags, roles: ['admin', 'super_admin'] },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes, roles: ['admin', 'super_admin'] },
  { to: '/admin/payment-methods', label: 'Payment methods', icon: Wallet, roles: ['admin', 'super_admin'] },
  { to: '/admin/coupons', label: 'Coupons', icon: BadgePercent, roles: ['admin', 'super_admin'] },
  { to: '/admin/customers', label: 'Customers', icon: Users, roles: ['support', 'admin', 'super_admin'] },
  { to: '/admin/settings', label: 'Settings & audit', icon: Settings2, roles: ['admin', 'super_admin'] },
];

const AdminLayout = () => {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const role = profile?.role;
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  usePageMeta({
    title: 'XSHOP Admin',
    description: 'XSHOP store administration.',
    noindex: true,
  });

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const nav = (
    <nav aria-label="Admin sections" className="space-y-1">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            isActive ? 'bg-purple-500/15 text-white shadow-[inset_0_0_0_1px_rgba(216,180,254,0.25)]' : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'
          }`}
        >
          {createElement(item.icon, { className: 'h-4 w-4 shrink-0 text-purple-300', 'aria-hidden': true })}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <section className="relative isolate min-h-screen overflow-hidden px-4 pb-16 pt-28 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-purple-600/10 blur-[110px]" />
        <div className="absolute -right-24 top-72 h-80 w-80 rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">XSHOP / ADMIN</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Store administration</h1>
            <p className="mt-1 text-xs text-gray-500">
              Signed in as {profile?.email || 'staff'} · role: <span className="font-semibold text-purple-200">{role?.replaceAll('_', ' ')}</span>.
              Every action is re-authorized by the database.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:border-white/25 hover:text-white lg:hidden"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            Sections
          </button>
        </header>

        {menuOpen && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-gray-900/80 p-3 backdrop-blur-xl lg:hidden">{nav}</div>
        )}

        <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
          <aside className="hidden h-fit rounded-2xl border border-white/10 bg-gray-900/60 p-3 backdrop-blur-xl lg:block">{nav}</aside>
          <div className="min-w-0"><Outlet /></div>
        </div>
      </div>
    </section>
  );
};

export default AdminLayout;
