import { ArrowRight, ChevronRight, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

const footerGroups = [
  {
    title: 'Explore',
    links: [
      { label: 'Shop', to: '/shop' },
      { label: 'Categories', to: '/categories' },
      { label: 'Deals', to: '/deals' },
      { label: 'Search', to: '/search' },
    ],
  },
  {
    title: 'Your account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Orders', to: '/account/orders' },
      { label: 'Wishlist', to: '/account/wishlist' },
      { label: 'Support', to: '/support' },
    ],
  },
];

const Footer = () => {
  const reduceMotion = useReducedMotion();

  return (
  <footer className="relative overflow-hidden">
    <div className="relative bg-[#F6F6F6] px-4 py-14 text-center sm:px-8 lg:py-20">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 22 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: reduceMotion ? 0 : 0.55 }}
        className="mx-auto max-w-4xl"
      >
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-purple-800">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          XSHOP
        </p>
        <h2 className="text-3xl font-bold leading-tight text-black sm:text-5xl">
          Your next digital essential starts here.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
          Explore the storefront as the catalog is brought online. Product listings will be published when their details and availability are configured.
        </p>
        <Link
          to="/shop"
          className="mt-7 inline-flex items-center gap-2 rounded-xl border-2 border-purple-400 bg-black px-6 py-3 font-semibold text-white transition-all duration-300 hover:border-purple-300 hover:shadow-[0_0_28px_rgba(168,85,247,0.28)]"
        >
          Browse the shop <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </motion.div>
    </div>

    <div className="relative isolate overflow-hidden bg-black">
      <video autoPlay={!reduceMotion} muted loop={!reduceMotion} playsInline preload="none" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover">
        <source src="/videos/footer.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 -z-10 bg-black/85" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-black/75 p-6 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-300/30 bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                <PackageCheck className="h-5 w-5 text-purple-200" aria-hidden="true" />
              </div>
              <div>
                <p className="font-bold tracking-[0.16em] text-white">XSHOP</p>
                <p className="text-xs text-gray-400">Digital storefront</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-gray-300">
              A premium storefront foundation for legitimate digital products. Product-specific details and policies will be shown before purchase.
            </p>
            <Link to="/genaxis" className="mt-5 inline-flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-purple-200">
              Legacy GenAxis AI workspace <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
              <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white">
                <ShieldCheck className="h-4 w-4 text-purple-300" aria-hidden="true" />
                {group.title}
              </h3>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="group inline-flex items-center gap-2 text-sm text-white/65 transition-colors hover:text-white">
                      <span className="h-1 w-1 rounded-full bg-purple-400/70 transition-all group-hover:w-2" aria-hidden="true" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} XSHOP. Digital storefront.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/legal/privacy" className="transition-colors hover:text-white">Privacy</Link>
            <Link to="/legal/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link to="/legal/security" className="transition-colors hover:text-white">Security</Link>
            <Link to="/support" className="transition-colors hover:text-white">Support</Link>
          </div>
        </div>
      </div>
    </div>
  </footer>
  );
};

export default Footer;
