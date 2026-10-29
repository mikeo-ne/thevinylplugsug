import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { DraftProvider } from './store/DraftContext';
import { BagProvider } from './store/BagContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { Nav } from './components/layout/Nav';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './pages/LandingPage';
import { OrderPage } from './pages/OrderPage';
import { SuccessPage } from './pages/SuccessPage';
import { AdminPage } from './pages/AdminPage';
import { ShopPage } from './pages/ShopPage';
import { ShopOrderPage } from './pages/ShopOrderPage';
import { NotFoundPage } from './pages/NotFoundPage';

function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.replace('#', ''));
      if (target) {
        window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}

function Shell() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-full bg-lime px-4 py-2 text-sm font-medium text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
      >
        Skip to content
      </a>
      <ScrollManager />
      <Nav />
      <div id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/order/:orderId" element={<ShopOrderPage />} />
          <Route path="/order" element={<OrderPage />} />
          <Route path="/order/:orderId" element={<SuccessPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
      {!isAdmin && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DraftProvider>
          <BagProvider>
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </BagProvider>
        </DraftProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
