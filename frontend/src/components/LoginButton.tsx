import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';

export function LoginButton() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Delay to let Google SDK fully initialize
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return <div className="h-[40px] w-[120px]" />;
  }

  return (
    <div className="relative h-[40px] flex items-center justify-center">
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          setError(null);
          try {
            if (credentialResponse.credential) {
              await login(credentialResponse.credential);
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
          }
        }}
        onError={() => {
          setError('Google login failed');
        }}
        size="medium"
        theme="outline"
        text="signin"
        shape="rectangular"
      />
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
