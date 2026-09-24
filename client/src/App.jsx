import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import HelpButton from './components/HelpButton';
import LegacyClerkBoundary from './components/legacy/LegacyClerkBoundary';
import StoreLayout from './components/store/StoreLayout';
import RequireAuth from './components/store/RequireAuth';
import RequireRole from './components/store/RequireRole';

// XSHOP storefront
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
import AdminUnavailable from './pages/store/AdminUnavailable';
import NotFound from './pages/store/NotFound';
import LegacyGenAxisHome from './pages/store/LegacyGenAxisHome';

// Existing GenAxis AI workspace (retained behind its isolated Clerk provider)
import Layout from './pages/Layout';
import WriteArticle from './pages/WriteArticle';
import BlogTitles from './pages/BlogTitles';
import Dashboard from './pages/Dashboard';
import GenerateImages from './pages/GenerateImages';
import RemoveBackground from './pages/RemoveBackground';
import RemoveObject from './pages/RemoveObject';
import ReviewResume from './pages/ReviewResume';
import Community from './pages/Community';

// Existing informational pages retained during migration
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/legal/Privacy';
import Security from './pages/legal/Security';
import Terms from './pages/legal/Terms';
import Demo from './pages/product/Demo';
import Feature from './pages/product/Feature';
import Pricing from './pages/product/Pricing';
import Api from './pages/resources/Api';
import Documentation from './pages/resources/Documentation';
import Feedback from './pages/Feedback';

const App = () => (
  <div>
    <Toaster />
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
          <Route path="/account/settings" element={<Account />} />
          <Route path="/account/notifications" element={<Account />} />
        </Route>

        {/* UI role checks are supplemental; future admin data/actions must also enforce server/RLS authorization. */}
        <Route element={<RequireRole allowedRoles={['admin', 'super_admin']} />}>
          <Route path="/admin/*" element={<AdminUnavailable />} />
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

    <Analytics />
    <HelpButton />
  </div>
);

export default App;
