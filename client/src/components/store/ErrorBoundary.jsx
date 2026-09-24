import { Component } from 'react';
import { RefreshCcw, TriangleAlert } from 'lucide-react';

// Catches unexpected render errors so customers never see a blank screen.
// Details stay in the browser console; nothing internal is shown to users.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('XSHOP render error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-black px-4 pt-24">
        <div className="flex max-w-md flex-col items-center rounded-3xl border border-white/10 bg-gradient-to-br from-gray-900/85 to-black/80 px-6 py-12 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-500/10 text-amber-200">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            An unexpected error interrupted this page. Your account and orders are unaffected.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-purple-300/30 bg-purple-500/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500/20"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Reload the page
          </button>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
