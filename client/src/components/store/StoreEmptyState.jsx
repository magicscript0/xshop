import { createElement } from 'react';
import { ArrowRight, PackageSearch } from 'lucide-react';
import { Link } from 'react-router-dom';

const StoreEmptyState = ({
  icon: Icon = PackageSearch,
  title = 'Nothing to show yet',
  description,
  actionLabel,
  actionTo,
}) => (
  <div className="mx-auto flex max-w-3xl flex-col items-center rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/85 to-black/80 px-6 py-12 text-center shadow-2xl shadow-purple-950/10 backdrop-blur-xl sm:px-10">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300/20 bg-gradient-to-br from-purple-500/15 to-blue-500/10 text-purple-200">
      {createElement(Icon, { className: 'h-6 w-6', 'aria-hidden': true })}
    </div>
    <h2 className="text-xl font-semibold text-white sm:text-2xl">{title}</h2>
    {description && <p className="mt-3 max-w-xl text-sm leading-relaxed text-gray-400 sm:text-base">{description}</p>}
    {actionLabel && actionTo && (
      <Link to={actionTo} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-purple-300/30 bg-purple-500/10 px-5 py-3 text-sm font-semibold text-white transition-all hover:border-purple-300/60 hover:bg-purple-500/20">
        {actionLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    )}
  </div>
);

export default StoreEmptyState;
