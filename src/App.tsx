import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/apiInstance';
import { EVENT_SLUG } from './lib/config';
import { Register } from './pages/Register';
import { ContactProvider } from './components/SiteFooter';
import type { StaffPage } from './staffApp';

// Only the registration form is in the first download; every other screen loads when opened.
const StaffApp = lazy(() => import('./staffApp'));
const Display = lazy(() => import('./pages/Display').then((m) => ({ default: m.Display })));
const Verify = lazy(() => import('./pages/Verify').then((m) => ({ default: m.Verify })));

function Later({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{children}</Suspense>;
}

const staff = (page: StaffPage) => (
  <Later>
    <StaffApp page={page} />
  </Later>
);

export default function App() {
  return (
    <ContactProvider load={api.getSiteContact}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Register api={api} slug={EVENT_SLUG} />} />
          <Route path="/display" element={<Later><Display api={api} slug={EVENT_SLUG} /></Later>} />
          <Route path="/verify" element={<Later><Verify api={api} /></Later>} />
          <Route path="/staff/login" element={staff('login')} />
          <Route path="/staff/mfa" element={staff('mfa')} />
          <Route path="/researchers/*" element={staff('researchers')} />
          <Route path="/admin/*" element={staff('admin')} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ContactProvider>
  );
}
