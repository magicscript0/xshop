import { createElement, useEffect, useState } from 'react';
import { ArrowRight, Bell, Heart, PackageCheck, Save, Settings2, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import StorePageShell from '../../components/store/StorePageShell';
import AccountOrders from './AccountOrders';
import AccountWishlist from './AccountWishlist';
import AccountNotifications from './AccountNotifications';
import OrderDetails from './OrderDetails';

const accountLinks = [
  { label: 'Orders', to: '/account/orders', icon: PackageCheck, description: 'Account-owned order history and status' },
  { label: 'Wishlist', to: '/account/wishlist', icon: Heart, description: 'Products saved for later' },
  { label: 'Notifications', to: '/account/notifications', icon: Bell, description: 'Private order and account updates' },
  { label: 'Settings', to: '/account/settings', icon: Settings2, description: 'Profile and security settings' },
];

const getSectionTitle = (pathname) => {
  if (pathname.startsWith('/account/orders/')) return 'Order details';
  if (pathname === '/account/orders') return 'My orders';
  if (pathname === '/account/wishlist') return 'My wishlist';
  if (pathname === '/account/settings') return 'Account settings';
  if (pathname === '/account/notifications') return 'Notifications';
  return 'Your account';
};

const AccountSettings = () => {
  const { user, profile, profileStatus, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (profileStatus !== 'ready') return;
    setDisplayName(profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.full_name || '');
    setPhone(profile?.phone || '');
  }, [profileStatus, profile, user?.id, user?.user_metadata]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      await updateProfile({ display_name: displayName, phone });
      setNotice({ type: 'success', message: 'Your profile changes have been saved.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Profile changes could not be saved. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  if (profileStatus === 'loading' || profileStatus === 'idle') {
    return <div role="status" aria-live="polite" className="rounded-xl border border-white/10 bg-black/30 p-5 text-sm text-gray-300">Loading your profile…</div>;
  }

  if (profileStatus !== 'ready') {
    return (
      <div className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-5">
        <h2 className="font-semibold text-white">Profile settings are unavailable</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">The profile record could not be loaded. Confirm that the XSHOP profile migration is present, then try again.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">Profile details</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">Your email is managed by Supabase Auth. You can update profile fields below; your role and account ID are not editable here.</p>
      </div>
      {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mb-5 rounded-xl border p-3 text-sm ${notice.type === 'error' ? 'border-red-300/20 bg-red-400/[0.07] text-red-100' : 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100'}`}>{notice.message}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block"><span className="mb-2 block text-sm font-medium text-gray-200">Email</span><input type="email" value={user?.email || profile?.email || ''} readOnly className="w-full rounded-xl border border-white/[0.06] bg-black/25 px-4 py-3 text-sm text-gray-400 outline-none" /></label>
        <label className="block"><span className="mb-2 block text-sm font-medium text-gray-200">Display name</span><input type="text" autoComplete="name" maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-300/50" /></label>
        <label className="block"><span className="mb-2 block text-sm font-medium text-gray-200">Phone <span className="text-gray-500">(optional)</span></span><input type="tel" autoComplete="tel" maxLength={32} value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full rounded-xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-purple-300/50" /></label>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-purple-300/25 bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-4 w-4" aria-hidden="true" /> {busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </div>
  );
};

const Account = () => {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const displayName = profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.full_name || 'Signed-in customer';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const title = getSectionTitle(pathname);
  const isOverview = pathname === '/account';
  const isOrderDetails = pathname.startsWith('/account/orders/');

  return (
    <StorePageShell
      eyebrow="XSHOP / ACCOUNT"
      title={isOverview ? `Welcome${displayName !== 'Signed-in customer' ? `, ${displayName}` : ''}` : title}
      description={isOverview ? 'Your private XSHOP account, orders, wishlist, and notifications.' : undefined}
    >
      {isOrderDetails ? <OrderDetails /> : (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="h-fit rounded-2xl border border-white/10 bg-gray-900/65 p-6 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              {avatarUrl ? <img src={avatarUrl} alt="" className="h-12 w-12 rounded-full border border-white/15 object-cover" referrerPolicy="no-referrer" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full border border-purple-300/20 bg-purple-500/10 text-purple-200"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></div>}
              <div className="min-w-0"><p className="truncate font-semibold text-white">{displayName}</p><p className="truncate text-sm text-gray-400">{user?.email || profile?.email || 'Email managed by the authentication provider'}</p></div>
            </div>
            <div className="mt-6 rounded-xl border border-white/[0.08] bg-black/25 p-4">
              <p className="text-sm font-medium text-white">Account-owned data</p>
              <p className="mt-2 text-xs leading-relaxed text-gray-400">Orders, wishlist entries, notifications, and digital deliveries are scoped to your Supabase identity at the database layer.</p>
            </div>
            {!isOverview && <nav aria-label="Account sections" className="mt-5 space-y-1">{accountLinks.map((item) => <Link key={item.to} to={item.to} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${pathname === item.to ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:bg-white/[0.04] hover:text-white'}`}>{createElement(item.icon, { className: 'h-4 w-4 text-purple-300', 'aria-hidden': true })}{item.label}</Link>)}</nav>}
          </section>

          <section className="rounded-2xl border border-white/10 bg-gray-900/45 p-4 sm:p-6">
            {isOverview ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {accountLinks.map(({ label, to, icon: Icon, description }) => (
                  <Link key={to} to={to} className="group rounded-xl border border-white/10 bg-black/30 p-4 transition-all hover:border-purple-300/30 hover:bg-white/[0.04]">
                    <div className="flex items-center justify-between">{createElement(Icon, { className: 'h-5 w-5 text-purple-300', 'aria-hidden': true })}<ArrowRight className="h-4 w-4 text-gray-600 transition-all group-hover:translate-x-1 group-hover:text-purple-200" aria-hidden="true" /></div>
                    <h2 className="mt-4 font-semibold text-white">{label}</h2><p className="mt-1 text-xs leading-relaxed text-gray-400">{description}</p>
                  </Link>
                ))}
              </div>
            ) : pathname === '/account/settings' ? <AccountSettings />
              : pathname === '/account/orders' ? <AccountOrders />
                : pathname === '/account/wishlist' ? <AccountWishlist />
                  : pathname === '/account/notifications' ? <AccountNotifications />
                    : <p className="text-sm text-gray-400">Choose an account section.</p>}
          </section>
        </div>
      )}
    </StorePageShell>
  );
};

export default Account;
