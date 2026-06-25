import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ClothingLayout } from './ClothingLayout';
import { ClothingHome } from './ClothingHome';
import { ClothingStores } from './ClothingStores';

// Clothing: a Find tab (shopping agent + colour guide) and a Stores tab.
export function ClothingApp() {
  useEffect(() => {
    document.title = 'Clothing | LUMNA';
  }, []);

  return (
    <Routes>
      <Route element={<ClothingLayout />}>
        <Route index element={<ClothingHome />} />
        <Route path="stores" element={<ClothingStores />} />
        <Route path="*" element={<Navigate to="/clothing" replace />} />
      </Route>
    </Routes>
  );
}
