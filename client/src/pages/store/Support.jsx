import { HelpCircle, MessageSquare, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import StorePageShell from '../../components/store/StorePageShell';

const Support = () => (
  <StorePageShell
    eyebrow="XSHOP / SUPPORT"
    title="Support"
    description="Product terms are presented with each listing. Account order status, payment review state, and verified digital delivery are handled through the XSHOP database."
  >
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-gray-900/65 p-6 backdrop-blur-xl">
        <HelpCircle className="h-6 w-6 text-purple-300" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-white">Product questions</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">Product-specific compatibility, delivery, and terms should be confirmed on the product listing before purchase.</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-gray-900/65 p-6 backdrop-blur-xl">
        <ShieldCheck className="h-6 w-6 text-blue-300" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-white">Order support</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">Your account shows order snapshots, payment-session status, manual-review state, and completed delivery records.</p>
        <Link to="/account/orders" className="mt-4 inline-flex rounded-lg border border-purple-300/25 bg-purple-500/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-500/20">View my orders</Link>
      </div>
      <div className="rounded-2xl border border-white/10 bg-gray-900/65 p-6 backdrop-blur-xl">
        <MessageSquare className="h-6 w-6 text-fuchsia-300" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-white">Send feedback</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">The existing feedback form is available while the XSHOP support workflow is being prepared.</p>
        <Link to="/feedback" className="mt-4 inline-flex rounded-lg border border-purple-300/25 bg-purple-500/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-500/20">Open feedback form</Link>
      </div>
    </div>
  </StorePageShell>
);

export default Support;
