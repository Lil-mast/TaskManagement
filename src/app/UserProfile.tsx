import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function UserProfile() {
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: user?.email?.split('@')[0] || '', // Use email prefix as default name
    email: user?.email || '',
    role: 'Task Manager',
    profilePicture: ''
  });
  const [settings, setSettings] = useState({
    changePassword: false,
    notifications: true
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSettingChange = (setting: string) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting as keyof typeof prev]
    }));
  };

  const handleSaveChanges = () => {
    // In a real app, this would save to a backend
    alert('Profile completed successfully!');
    // Redirect to dashboard after profile completion
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-vintage-cream">
      {/* BEGIN: Navigation Header */}
      <nav className="bg-vintage-red text-white py-3 shadow-md relative z-20">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xl font-bold tracking-wide hover:text-vintage-cream transition-colors">
              Eisenhower Matrix
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-white hover:text-vintage-cream transition-colors font-medium"
            >
              Dashboard
            </Link>
            <Link
              to="/profile"
              className="text-white hover:text-vintage-cream transition-colors font-medium"
            >
              Profile
            </Link>
            {user && (
              <button
                onClick={signOutUser}
                className="bg-vintage-brown hover:bg-vintage-brown/80 text-white px-4 py-2 rounded transition-colors text-sm font-medium"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </nav>
      {/* END: Navigation Header */}

      {/* BEGIN: MainHeader */}
      <header className="bg-vintage-red text-white py-2 shadow-md z-10 relative">
        <div className="container mx-auto px-4 flex items-center h-24 justify-start gap-6">
          {/* Logo Container */}
          <div className="flex-shrink-0">
            <img
              alt="Vintage Logo"
              className="h-20 w-auto object-contain"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuClh1wBhppDn7g7ZGbLIbvhN1q-G69K0HXXF7gqgRBRsQiuwe1Fcdf91mVvOzTpaSyPhANT6JHeGgTlOsdf4LeGjqN6Hz3UwBY_qCmu3xVX0PJIG91txI2uyfk3F1p7Dr38wtoRxwkq2KLfINvbSh95TstMRt2dinBjGQoCmr5waqrw8Nc8rvG2w3Hwvm_-Q9kaJt0Bt4xTRVHyWDbS5HtesEYb_eqjqqXCV7giCGcfmx1PrK9wPI8cMi8A7EPzEp8DNsb8ooe1Qdc"
            />
          </div>
          {/* Branding Text */}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-wide border-b-2 border-vintage-cream inline-block pb-1">
              Eisenhower Matrix
            </h1>
            <p className="text-sm md:text-base italic opacity-90 mt-1">Task Management System</p>
          </div>
        </div>
      </header>
      {/* END: MainHeader */}

      {/* BEGIN: HeroSection */}
      <section className="bg-vintage-blue-grey text-white py-6 shadow-inner relative z-0">
        <div className="container mx-auto px-4 text-center md:text-left">
          <h2 className="text-4xl font-serif tracking-widest uppercase">User Profile</h2>
        </div>
      </section>
      {/* END: HeroSection */}

      {/* BEGIN: MainContent */}
      <main className="flex-grow bg-grain py-12">
        <div className="container mx-auto px-4" style={{ maxWidth: '1100px' }}>
          {/* 3-Column Grid Container */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
            {/* COLUMN 1: Profile Identity (Left) */}
            <div className="md:col-span-3 flex flex-col items-center text-center space-y-4">
              {/* Profile Image with thick border */}
              <div className="relative w-48 h-48 rounded-full border-[5px] border-vintage-red overflow-hidden shadow-xl bg-gray-100 flex items-center justify-center">
                {formData.profilePicture ? (
                  <img
                    alt="Profile Picture"
                    className="w-full h-full object-cover"
                    src={formData.profilePicture}
                  />
                ) : (
                  <div className="text-center text-gray-500">
                    <div className="text-4xl mb-2">👤</div>
                    <div className="text-sm">No Photo</div>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        setFormData(prev => ({
                          ...prev,
                          profilePicture: e.target?.result as string
                        }));
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="absolute bottom-2 right-2 bg-vintage-red text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold cursor-pointer">
                  +
                </div>
              </div>
              {/* Name and Role */}
              <div className="mt-4">
                <h2 className="text-3xl font-bold text-vintage-brown border-b border-vintage-brown pb-2 inline-block mb-2">
                  {formData.fullName || user?.email?.split('@')[0] || 'User'}
                </h2>
                <p className="text-lg text-vintage-blue-grey italic font-semibold">
                  {formData.role || (user?.id === 'local-user' ? 'Local User' : 'Authenticated User')}
                </p>
              </div>
            </div>

            {/* COLUMN 2: Personal Information Form (Middle) */}
            <div className="md:col-span-5 bg-white bg-opacity-50 p-6 rounded-sm shadow-sm border border-vintage-beige">
              <h3 className="text-2xl font-bold text-vintage-red mb-6 uppercase border-b-2 border-vintage-red pb-1">
                Personal Information
              </h3>
              <form className="space-y-6">
                {/* Name Input */}
                <div className="flex flex-col">
                  <label className="mb-1 text-vintage-brown font-bold text-lg" htmlFor="full-name">
                    Full Name
                  </label>
                  <input
                    className="vintage-input w-full p-2 text-lg rounded-sm text-black"
                    id="full-name"
                    type="text"
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleInputChange}
                  />
                </div>
                {/* Email Input */}
                <div className="flex flex-col">
                  <label className="mb-1 text-vintage-brown font-bold text-lg" htmlFor="email">
                    Email Address
                  </label>
                  <input
                    className="vintage-input w-full p-2 text-lg rounded-sm text-black"
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                </div>
                {/* Role Input (Read Only for aesthetic) */}
                <div className="flex flex-col">
                  <label className="mb-1 text-vintage-brown font-bold text-lg" htmlFor="role">
                    Role
                  </label>
                  <input
                    className="vintage-input w-full p-2 text-lg rounded-sm bg-opacity-50 text-black"
                    id="role"
                    readOnly
                    type="text"
                    name="role"
                    value={formData.role}
                  />
                </div>
              </form>
            </div>

            {/* COLUMN 3: Account Settings (Right) */}
            <div className="md:col-span-4 flex flex-col space-y-8">
              {/* General Account Settings Block */}
              <div className="bg-white bg-opacity-50 p-6 rounded-sm shadow-sm border border-vintage-beige">
                <h3 className="text-2xl font-bold text-vintage-red mb-6 uppercase border-b-2 border-vintage-red pb-1">
                  Account Settings
                </h3>
                {/* Row 1: Password Change */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-vintage-beige border-dashed">
                  <div>
                    <span className="block text-lg text-vintage-brown font-semibold">Change Password</span>
                    <span className="block text-sm text-vintage-brown opacity-60">Change password for password.</span>
                  </div>
                  {/* Custom Toggle Switch Component */}
                  <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                    <input
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300"
                      id="toggle-pw"
                      name="toggle-pw"
                      type="checkbox"
                      checked={settings.changePassword}
                      onChange={() => handleSettingChange('changePassword')}
                    />
                    <label
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer border-2 border-transparent ${
                        settings.changePassword ? 'bg-vintage-blue-grey' : 'bg-gray-300'
                      }`}
                      htmlFor="toggle-pw"
                    ></label>
                  </div>
                </div>
                {/* Row 2: Notifications */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-lg text-vintage-brown font-semibold">Notifications</span>
                    <span className="block text-sm text-vintage-brown opacity-60">Use retro toggle switches.</span>
                  </div>
                  {/* Custom Toggle Switch Component */}
                  <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                    <input
                      checked={settings.notifications}
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300"
                      id="toggle-notif"
                      name="toggle-notif"
                      type="checkbox"
                      onChange={() => handleSettingChange('notifications')}
                    />
                    <label
                      className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer border-2 border-transparent ${
                        settings.notifications ? 'bg-vintage-blue-grey' : 'bg-gray-300'
                      }`}
                      htmlFor="toggle-notif"
                    ></label>
                  </div>
                </div>
              </div>

              {/* Preferences Block */}
              <div className="bg-white bg-opacity-50 p-6 rounded-sm shadow-sm border border-vintage-beige flex-grow flex flex-col">
                <h3 className="text-xl font-bold text-vintage-blue-grey mb-4 border-b border-vintage-blue-grey pb-1">
                  Matrix Preferences
                </h3>
                {/* View Preference */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-vintage-brown">Default View</span>
                  <span className="font-bold text-vintage-red cursor-pointer hover:underline">Grid »</span>
                </div>
                {/* Theme Preference */}
                <div className="flex justify-between items-center mb-8">
                  <span className="text-vintage-brown">Task Color Themes</span>
                  <div className="flex space-x-2">
                    <div className="w-4 h-4 rounded-full bg-red-700 border border-gray-400 cursor-pointer hover:scale-110 transition-transform"></div>
                    <div className="w-4 h-4 rounded-full bg-blue-700 border border-gray-400 cursor-pointer hover:scale-110 transition-transform"></div>
                    <div className="w-4 h-4 rounded-full bg-black border border-gray-400 cursor-pointer hover:scale-110 transition-transform"></div>
                  </div>
                </div>
                {/* Save Button Wrapper */}
                <div className="mt-auto flex justify-end">
                  <button
                    className="btn-ticket px-8 py-3 text-lg font-bold tracking-wider"
                    onClick={handleSaveChanges}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      {/* END: MainContent */}

      {/* BEGIN: MainFooter */}
      <footer className="bg-vintage-brown text-vintage-cream py-8 mt-auto border-t-4 border-vintage-red">
        <div className="container mx-auto px-4 text-center">
          <nav className="flex justify-center space-x-8 mb-4">
            <a className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors" href="#">
              Help Center
            </a>
            <a className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors" href="#">
              Terms of Service
            </a>
            <a className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors" href="#">
              Privacy Policy
            </a>
          </nav>
          <p className="text-xs opacity-60 font-serif tracking-widest">
            © 1948 Eisenhower Matrix Systems. All Rights Reserved.
          </p>
        </div>
      </footer>
      {/* END: MainFooter */}
    </div>
  );
}