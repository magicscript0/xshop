import { ArrowDown, ArrowRight, ShoppingBag } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

const StoreHero = () => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate flex min-h-[88vh] items-center overflow-hidden bg-black pt-24">
      <div className="absolute inset-0 -z-30 overflow-hidden" aria-hidden="true">
        <video
          autoPlay={!reduceMotion}
          muted
          loop={!reduceMotion}
          playsInline
          preload="metadata"
          className="absolute left-1/2 top-1/2 h-full min-h-full w-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-70"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/25" />
      </div>
      <div className="pointer-events-none absolute -left-24 top-1/4 -z-10 h-72 w-72 rounded-full bg-purple-600/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 -z-10 h-80 w-80 rounded-full bg-blue-600/15 blur-[130px]" aria-hidden="true" />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-24">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-4 py-2 backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-purple-400 shadow-[0_0_12px_rgba(192,132,252,0.85)]" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">XSHOP · DIGITAL MARKETPLACE</span>
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
            Digital essentials,
            <span className="mt-2 block bg-gradient-to-r from-purple-300 via-fuchsia-200 to-blue-300 bg-clip-text text-transparent">thoughtfully chosen.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            Explore legitimate digital goods with clear product details, current catalog pricing, and account-owned checkout. Listings appear only after they are configured and approved.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/shop" className="group inline-flex items-center gap-2 rounded-2xl border border-purple-200/40 bg-gradient-to-r from-purple-600/85 to-blue-600/85 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(168,85,247,0.35)]">
              Browse the shop <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
            <Link to="/support" className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-black/35 px-6 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-xl transition-all duration-300 hover:border-white/40 hover:bg-white/10">
              How it works <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.75, delay: reduceMotion ? 0 : 0.12 }}
          className="relative mx-auto hidden w-full max-w-md lg:block"
        >
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-purple-500/25 via-transparent to-blue-500/20 blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-black/65 p-7 shadow-2xl shadow-purple-950/30 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-300/25 bg-purple-500/10">
                  <ShoppingBag className="h-5 w-5 text-purple-200" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Store data source</p>
                  <p className="mt-1 text-xs text-gray-400">XSHOP Supabase catalog</p>
                </div>
              </div>
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">Preview</span>
            </div>
            <div className="mt-6 space-y-3">
              {['Published catalog and active offers', 'Persistent customer cart and order snapshots', 'Configured payment review and private fulfillment'].map((item) => (
                <div key={item} className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
                  <span className="text-sm text-gray-300">{item}</span>
                  <span className="shrink-0 rounded-full border border-purple-300/15 bg-purple-400/[0.06] px-2.5 py-1 text-[10px] font-medium text-purple-100">Database-driven</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-gray-500">Available products and payment methods depend on the connected Supabase project configuration.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default StoreHero;
