import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Signup() {
  const { signUp, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [settings, setSettings] = useState({
    changePassword: true,
    notifications: true
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSettingChange = (setting: string) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting as keyof typeof prev]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signUp(formData.email, formData.password);
      // After successful sign up, redirect to dashboard
      navigate('/app');
    } catch (error) {
      console.error('Sign up error:', error);
      alert('Sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // After successful Google sign in, redirect to dashboard
      navigate('/app');
    } catch (error) {
      console.error('Google sign in error:', error);
      alert('Google sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // If user is already signed in, redirect to dashboard
  if (user) {
    navigate('/app');
    return null;
  }

  return (
    <div className="bg-vintage-bg font-serif text-gray-800 min-h-screen flex flex-col">
      {/* BEGIN: MainHeader */}
      <header className="bg-vintage-red text-white py-3 px-6 shadow-md relative z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          {/* Logo Placeholder */}
          <div className="rounded-full bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/20 w-[60px] h-[60px]">
            <img
              alt="Vintage Logo"
              className="object-cover w-full h-full rounded-full"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCilKiqcUmRVfehvSOWBhfau8xAyhnwXCv2FpR51hmfJPpkfW0gNKSCKKvZviydTi0cNHB_AQnQffmsWPZ6OV3uWCYV8-wippSE9YycmwlqN1-s5bwyI1eEFlYyVKmiP4fvqzyHaIk_hfDwiMzMD0ZgOlv06n3qQuuh7EYqqy-E45Go0K0R60gB4w2nR0URGcGnLqBQYrTigtT5jtIJ1hYnKrCh6h5aNQr0h7p3LUPw1Sv9-OOaHMC-STEa6cMyMfN3SV7bi_v-O-w"
            />
          </div>
          {/* Brand Name */}
          <h1 className="text-[20px] font-normal tracking-wide">Eisenhower Matrix - Task Management</h1>
        </div>
      </header>
      {/* END: MainHeader */}

      {/* BEGIN: SubHeader */}
      <div className="bg-vintage-slate text-white shadow-inner py-[40px]">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-5xl font-bold tracking-tight">Signup</h2>
        </div>
      </div>
      {/* END: SubHeader */}

      {/* BEGIN: MainContent */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 py-[60px]">
        {/* Using a 12-column grid for desktop layout fidelity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Column 1: Left Intro Text */}
          <section className="lg:col-span-3 pt-4">
            <h3 className="text-black leading-tight font-medium text-4xl">
              Sign Up for Task Management
            </h3>
          </section>

          {/* Column 2: Center Card (Signup Form) */}
          <section className="lg:col-span-5">
            <div className="bg-white p-8 rounded-lg border border-gray-100 shadow-2xl">
              <h3 className="text-2xl font-medium mb-6 text-gray-900">Personal Information</h3>
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label className="block text-base font-medium text-gray-800 mb-1" htmlFor="email">
                    Email
                  </label>
                  <input
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-vintage-slate focus:ring-vintage-slate sm:text-sm py-2 px-3"
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-base font-medium text-gray-800 mb-1" htmlFor="password">
                    Password
                  </label>
                  <input
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-vintage-slate focus:ring-vintage-slate sm:text-sm py-2 px-3"
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <input
                    className="h-4 w-4 rounded border-gray-300 text-vintage-slate focus:ring-vintage-slate"
                    id="remember-me"
                    name="rememberMe"
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={handleInputChange}
                  />
                  <label className="ml-2 block text-sm text-gray-700" htmlFor="remember-me">
                    Remember me
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded shadow-sm text-sm font-medium text-white bg-vintage-btn hover:bg-vintage-btnHover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-vintage-slate transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing up...' : 'Sign up'}
                </button>

                {/* OR Divider */}
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-300"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase font-sans">OR</span>
                  <div className="flex-grow border-t border-gray-300"></div>
                </div>

                {/* Google Sign In */}
                <button
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                >
                  <img
                    alt="Google"
                    className="h-5 w-5 mr-3"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAvwdhIb40CDpr5g5FqTFmU1wLIs2qTdz3sIbYAlm0VtKw4yZedzfqPaugRtojgmrxlyD3qUbWTDC1RUz10SROFoVDZHuiryo6NVgc0IBDotEsLcesIWdihQIBTDTYSutfNcAPt2iAthR0L16EtU5qolUxg-br0oMzdQcu3pfAd_fJiiWoLMIz9hkUNzYhV395X9tMd7YpqWnsKhPkv8bXycdmCj2nI9DjdWFGgyGs_nwSYrcJ_LDORVp-HoXpuiSTE_pTLkLgkUlQ"
                  />
                  Sign in with Google
                </button>

                {/* Login Link */}
                <div className="text-center mt-4">
                  <p className="text-sm text-gray-600">
                    Already have an account?
                    <Link className="font-medium text-vintage-slate hover:text-gray-900 underline ml-1" to="/login">
                      Log in
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </section>

          {/* Column 3: Right Settings */}
          <section className="lg:col-span-4 space-y-8 pt-2 pl-0 lg:pl-6">
            {/* Account Settings Group */}
            <div>
              <h4 className="text-xl font-medium text-gray-900 mb-4">Account Settings</h4>
              {/* Item 1 */}
              <div className="flex items-start justify-between mb-4">
                <div className="pr-4">
                  <p className="text-base font-medium text-gray-800">Change Password</p>
                  <p className="text-sm text-gray-600 mt-0.5">Change password for password.</p>
                </div>
                <div className="flex-shrink-0 pt-1">
                  <input
                    checked={settings.changePassword}
                    className="sr-only toggle-checkbox"
                    id="toggle-password"
                    type="checkbox"
                    onChange={() => handleSettingChange('changePassword')}
                  />
                  <label className="toggle-label block" htmlFor="toggle-password"></label>
                </div>
              </div>
              {/* Item 2 */}
              <div className="flex items-start justify-between">
                <div className="pr-4">
                  <p className="text-base font-medium text-gray-800">Notification Preferences</p>
                  <p className="text-sm text-gray-600 mt-0.5">Users retro toggle switches-any retro toggle.</p>
                </div>
                <div className="flex-shrink-0 pt-1">
                  <input
                    checked={settings.notifications}
                    className="sr-only toggle-checkbox"
                    id="toggle-notification"
                    type="checkbox"
                    onChange={() => handleSettingChange('notifications')}
                  />
                  <label className="toggle-label block" htmlFor="toggle-notification"></label>
                </div>
              </div>
            </div>

            {/* Eisenhower Preferences Group */}
            <div className="pt-2">
              <h4 className="text-xl font-medium text-gray-900 mb-4">Eisenhower Matrix Preferences</h4>
              {/* Item 1 */}
              <div className="mb-4">
                <p className="text-base font-medium text-gray-800">Default View</p>
                <p className="text-sm text-gray-600 mt-0.5">Choose the view and Default View.</p>
              </div>
              {/* Item 2 */}
              <div>
                <p className="text-base font-medium text-gray-800">Task Color Themes</p>
                <p className="text-sm text-gray-600 mt-0.5">Choose the enion and Task Color Themes.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
      {/* END: MainContent */}

      {/* BEGIN: Footer */}
      <footer className="py-8 mt-auto border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 flex justify-center space-x-8 text-sm text-gray-700 underline decoration-gray-400 decoration-1 underline-offset-4 font-medium">
          <a className="hover:text-black" href="#">Help</a>
          <a className="hover:text-black" href="#">Terms</a>
          <a className="hover:text-black" href="#">Privacy Policy</a>
        </div>
      </footer>
      {/* END: Footer */}
    </div>
  );
}