const StorePageShell = ({ eyebrow, title, description, children, className = '' }) => (
  <section className={`relative isolate min-h-[55vh] overflow-hidden px-4 pb-20 pt-32 sm:px-8 lg:px-12 ${className}`}>
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-purple-600/10 blur-[110px]" />
      <div className="absolute -right-24 top-64 h-80 w-80 rounded-full bg-blue-600/10 blur-[120px]" />
    </div>
    <div className="mx-auto max-w-7xl">
      {(eyebrow || title || description) && (
        <header className="mb-10 max-w-3xl">
          {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">{eyebrow}</p>}
          {title && <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">{title}</h1>}
          {description && <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300 sm:text-lg">{description}</p>}
        </header>
      )}
      {children}
    </div>
  </section>
);

export default StorePageShell;
