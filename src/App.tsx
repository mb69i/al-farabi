import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/apiInstance';
import { EVENT_SLUG } from './lib/supabase';
import { Register } from './pages/Register';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Register api={api} slug={EVENT_SLUG} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
