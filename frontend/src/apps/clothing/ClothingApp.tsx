import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ClothingLayout } from './ClothingLayout';
import { ClothingHome } from './ClothingHome';
import { ClothingStores } from './ClothingStores';
import { StoresProvider } from './StoresContext';

// Clothing: a Find tab (shopping agent + colour guide) and a Stores tab. Both
// share the store list via StoresProvider.
export function ClothingApp() {
  useEffect(() => {
    document.title = 'Clothing | LUMNA';
  }, []);

  return (
    <StoresProvider>
      <Routes>
        <Route element={<ClothingLayout />}>
          <Route index element={<ClothingHome />} />
          <Route path="stores" element={<ClothingStores />} />
          <Route path="*" element={<Navigate to="/clothing" replace />} />
        </Route>
      </Routes>
    </StoresProvider>
  );
}
