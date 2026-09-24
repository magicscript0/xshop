import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import HelpButton from './components/HelpButton';
import LegacyClerkBoundary from './components/legacy/LegacyClerkBoundary';
import StoreLayout from './components/store/StoreLayout';
import RequireAuth from './components/store/RequireAuth';
import RequireRole from './components/store/RequireRole';
import ErrorBoundary from './components/store/ErrorBoundary';

// XSHOP storefront (kept in the main bundle for a fast first paint)
import Home from './pages/Home';
import Shop from './pages/store/Shop';
import Categories from './pages/store/Categories';
import CategoryDetails from './pages/store/CategoryDetails';
import Deals from './pages/store/Deals';
import SearchPage from './pages/store/Search';
import ProductDetails from './pages/store/ProductDetails';
import Cart from './pages/store/Cart';
import Checkout from './pages/store/Checkout';
import Account from './pages/store/Account';
import Support from './pages/store/Support';
import AuthPage from './pages/store/AuthPage';
import AuthCallback from './pages/store/AuthCallback';
import PasswordReset from './pages/store/PasswordReset';
import NotFound from './pages/store/NotFound';
import LegacyGenAxisHome from './pages/store/LegacyGenAxisHome';

// XSHOP admin dashboard (code-split; loaded only for staff)
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminOrderDetails = lazy(() => import('./pages/admin/AdminOrders').then((module) => ({ default: module.AdminOrderDetails })));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminPaymentMethods = lazy(() => import('./pages/admin/AdminPaymentMethods'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

// Existing GenAxis AI workspace (code-split; retained behind its isolated Clerk provider)
const Layout = lazy(() => import('./pages/Layout'));
const WriteArticle = lazy(() => import('./pages/WriteArticle'));
const BlogTitles = lazy(() => import('./pages/BlogTitles'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const GenerateImages = lazy(() => import('./pages/GenerateImages'));
const RemoveBackground = lazy(() => import('./pages/RemoveBackground'));
const RemoveObject = lazy(() => import('./pages/RemoveObject'));
const ReviewResume = lazy(() => import('./pages/ReviewResume'));
const Community = lazy(() => import('./pages/Community'));

// Existing informational pages retained during migration (code-split)
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Security = lazy(() => import('./pages/legal/Security'));
const Terms = lazy(() => import('./pages/legal/Terms'));
const Demo = lazy(() => import('./pages/product/Demo'));
const Feature = lazy(() => import('./pages/product/Feature'));
const Pricing = lazy(() => import('./pages/product/Pricing'));
const Api = lazy(() => import('./pages/resources/Api'));
const Documentation = lazy(() => import('./pages/resources/Documentation'));
const Feedback = lazy(() => import('./pages/Feedback'));

const RouteFallback = () => (
  <section className="flex min-h-[55vh] items-center justify-center bg-black px-4 pt-24" aria-live="polite">
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm text-gray-300">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300/30 border-t-purple-300" aria-hidden="true" />
      Loading…
    </div>
  </section>
);

const App = () => (
  <div>
    <Toaster />
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<StoreLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/products" element={<Shop />} />
            <Route path="/products/:slug" element={<ProductDetails />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/categories/:slug" element={<CategoryDetails />} />
            <Route path="/deals" element={<Deals />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/support" element={<Support />} />
            <Route path="/login" element={<AuthPage mode="sign-in" />} />
            <Route path="/register" element={<AuthPage mode="sign-up" />} />
            <Route path="/forgot-password" element={<AuthPage mode="forgot-password" />} />
            <Route path="/reset-password" element={<PasswordReset />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/product/pricing" element={<Pricing />} />
            <Route path="/wishlist" element={<Navigate to="/account/wishlist" replace />} />

            <Route element={<RequireAuth />}>
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/account" element={<Account />} />
              <Route path="/account/orders" element={<Account />} />
              <Route path="/account/orders/:id" element={<Account />} />
              <Route path="/account/wishlist" element={<Account />} />
              <Route path="/account/rewards" element={<Account />} />
              <Route path="/account/settings" element={<Account />} />
              <Route path="/account/notifications" element={<Account />} />
            </Route>

            {/* UI role routing only: every admin read/write below is separately
                enforced by Supabase RLS policies and security-definer functions. */}
            <Route element={<RequireRole allowedRoles={['support', 'admin', 'super_admin']} />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverview />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:id" element={<AdminOrderDetails />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="payment-methods" element={<AdminPaymentMethods />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* The legacy AI experience keeps Clerk isolated from all XSHOP customer routes. */}
          <Route path="/genaxis" element={<LegacyClerkBoundary><LegacyGenAxisHome /></LegacyClerkBoundary>} />
          <Route path="/ai" element={<LegacyClerkBoundary><Layout /></LegacyClerkBoundary>}>
            <Route index element={<Dashboard />} />
            <Route path="write-article" element={<WriteArticle />} />
            <Route path="blog-titles" element={<BlogTitles />} />
            <Route path="generate-images" element={<GenerateImages />} />
            <Route path="remove-background" element={<RemoveBackground />} />
            <Route path="remove-object" element={<RemoveObject />} />
            <Route path="review-resume" element={<ReviewResume />} />
            <Route path="community" element={<Community />} />
          </Route>

          {/* Existing public informational and GenAxis resource routes remain available. */}
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/legal/privacy" element={<Privacy />} />
          <Route path="/legal/security" element={<Security />} />
          <Route path="/legal/terms" element={<Terms />} />
          <Route path="/product/demo" element={<Demo />} />
          <Route path="/product/feature" element={<Feature />} />
          <Route path="/resources/api" element={<Api />} />
          <Route path="/resources/documentation" element={<Documentation />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>

    <Analytics />
    <HelpButton />
  </div>
);

export default App;
