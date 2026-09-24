import { ArrowRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import StorePageShell from '../../components/store/StorePageShell';

const Pricing = () => (
  <StorePageShell
    eyebrow="XSHOP / PRICING"
    title="Product-specific pricing"
    description="XSHOP is a product catalog, not a subscription-plan page."
  >
    <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-gray-900/70 p-6 backdrop-blur-xl sm:p-8">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 text-purple-200">
        <Info className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-white">No subscription pricing is configured</h2>
      <p className="mt-3 text-sm leading-relaxed text-gray-400">Product prices will be shown from the catalog on each listing once the database is connected. This page does not use Clerk Billing and does not create a payment.</p>
      <Link to="/shop" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
        Browse the catalog <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  </StorePageShell>
);

export default Pricing;
