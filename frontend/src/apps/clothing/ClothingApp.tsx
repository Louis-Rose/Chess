import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ClothingLayout } from './ClothingLayout';
import { ClothingHome } from './ClothingHome';
import { ClothingHowTo } from './ClothingHowTo';
import { ClothingStores } from './ClothingStores';
import { StoresProvider } from './StoresContext';

// Clothing: a Find tab (shopping agent), a How to tab (dressing guides) and a
// Stores tab. They share the store list via StoresProvider.
export function ClothingApp() {
  useEffect(() => {
    document.title = 'Clothing | LUMNA';
  }, []);

  return (
    <StoresProvider>
      <Routes>
        <Route element={<ClothingLayout />}>
          <Route index element={<ClothingHome />} />
          <Route path="how-to" element={<ClothingHowTo />} />
          <Route path="stores" element={<ClothingStores />} />
          <Route path="*" element={<Navigate to="/clothing" replace />} />
        </Route>
      </Routes>
    </StoresProvider>
  );
}
