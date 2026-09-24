import { Outlet } from 'react-router-dom';
import Navbar from '../Navbar';
import Footer from '../Footer';

const StoreLayout = () => (
  <div className="min-h-screen overflow-x-hidden bg-black text-white">
    <a href="#main-content" className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:not-sr-only focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-black">
      Skip to main content
    </a>
    <Navbar />
    <main id="main-content" className="min-h-[60vh]">
      <Outlet />
    </main>
    <Footer />
  </div>
);

export default StoreLayout;
