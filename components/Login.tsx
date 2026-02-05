
import React, { useState } from 'react';
import Logo from './Logo';
import { auth, OAuthProvider, signInWithRedirect } from '../services/firebase';

interface LoginProps {
  onLoginSuccess: (email: string) => void;
  accessError?: string | null;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, accessError }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const displayError = accessError || error;



  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const { signInWithPopup } = await import('../services/firebase');
      const provider = new OAuthProvider('microsoft.com');

      // Load tenant ID from environment variable
      const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || '';
      if (!tenantId) {
        console.warn('⚠️ Azure tenant ID not configured. Check VITE_AZURE_TENANT_ID in .env.local');
      }

      provider.setCustomParameters({
        tenant: tenantId,
        prompt: 'select_account'
      });

      provider.addScope('openid');
      provider.addScope('profile');
      provider.addScope('email');

      const result = await signInWithPopup(auth, provider);
      // Popup success!
    } catch (e: any) {
      console.error("Auth Exception:", e.message);
      let msg = e.message || "An unexpected error occurred.";
      if (e.code === 'auth/popup-closed-by-user') msg = "Sign-in cancelled.";
      if (e.code === 'auth/operation-not-supported-in-this-environment') msg = "Microsoft SSO is not supported in this browser.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-1.5 bg-brand-red"></div>
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col items-center">
          <div className="mb-12 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
            <Logo className="h-16 w-16" />
          </div>
          <div className="text-center mb-12">
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display leading-none">BHASVIC IT Support</h1>
            <p className="text-[10px] font-black text-brand-red uppercase tracking-[0.4em] mt-3 italic">WIGs System</p>
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full group relative flex items-center justify-center gap-4 py-6 bg-white border-2 border-slate-100 rounded-2xl text-slate-800 font-black uppercase text-xs tracking-widest hover:border-brand-navy hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50 shadow-sm font-display"
          >
            {loading ? <span>Verifying...</span> : <span>Sign in with Microsoft</span>}
          </button>
          {displayError && (
            <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-xl w-full text-center">
              <p className="text-[10px] font-bold text-brand-red uppercase line-clamp-2 mb-3">{displayError}</p>
              <button
                onClick={async () => {
                  try {
                    const { signOut } = await import('../services/firebase');
                    await signOut(auth);
                    window.location.reload();
                  } catch (e) { }
                }}
                className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 underline block mb-5 mx-auto"
              >
                Try different account
              </button>


            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
