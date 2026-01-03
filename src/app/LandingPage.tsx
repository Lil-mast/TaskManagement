import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-vintage-cream">
      {/* Header */}
      <header className="bg-vintage-red text-white py-2 shadow-md z-10 relative border-b-4 border-vintage-beige">
        <div className="container mx-auto px-4 flex items-center h-24 justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0 bg-vintage-cream rounded-full p-2 border-2 border-vintage-brown shadow-lg">
              <img 
                alt="Vintage Logo" 
                className="h-16 w-auto object-contain" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuClh1wBhppDn7g7ZGbLIbvhN1q-G69K0HXXF7gqgRBRsQiuwe1Fcdf91mVvOzTpaSyPhANT6JHeGgTlOsdf4LeGjqN6Hz3UwBY_qCmu3xVX0PJIG91txI2uyfk3F1p7Dr38wtoRxwkq2KLfINvbSh95TstMRt2dinBjGQoCmr5waqrw8Nc8rvG2w3Hwvm_-Q9kaJt0Bt4xTRVHyWDbS5HtesEYb_eqjqqXCV7giCGcfmx1PrK9wPI8cMi8A7EPzEp8DNsb8ooe1Qdc"
              />
            </div>
            <div className="hidden md:block">
              <h1 className="text-2xl md:text-3xl font-bold tracking-wide border-b-2 border-vintage-cream inline-block pb-1 text-shadow-sm">
                Eisenhower Matrix
              </h1>
              <p className="text-sm md:text-base italic opacity-90 mt-1 font-serif">
                Task Management System
              </p>
            </div>
          </div>
          <nav className="flex gap-4">
            <Link 
              to="/login" 
              className="text-vintage-cream hover:text-white font-bold border-b border-transparent hover:border-white transition-colors"
            >
              Login
            </Link>
            <Link 
              to="/signup" 
              className="text-vintage-cream hover:text-white font-bold border-b border-transparent hover:border-white transition-colors"
            >
              Register
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-vintage-blue-grey text-white py-16 shadow-inner relative z-0 border-b border-vintage-brown">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-6xl font-serif font-bold tracking-wider uppercase mb-6 drop-shadow-md">
            Master Your Time
          </h2>
          <p className="text-xl md:text-2xl font-serif italic opacity-90 max-w-2xl mx-auto mb-10 leading-relaxed">
            "What is important is seldom urgent, and what is urgent is seldom important."
          </p>
          <Link 
            to="/signup" 
            className="btn-ticket px-10 py-4 text-xl font-bold tracking-wider inline-flex items-center justify-center gap-2"
          >
            Start Organizing
            <span className="material-symbols-outlined text-2xl">arrow_forward</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow bg-grain py-16">
        <div className="container mx-auto px-4" style={{ maxWidth: '1100px' }}>
          {/* Method Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-24">
            <div className="vintage-card p-8 rounded-sm transform rotate-1">
              <h3 className="text-3xl font-bold text-vintage-red mb-4 border-b-2 border-vintage-red pb-2 inline-block">
                The Method
              </h3>
              <p className="text-vintage-brown text-lg leading-relaxed mb-4">
                Based on the principles of Dwight D. Eisenhower, this application helps you distinguish between the urgent and the important.
              </p>
              <ul className="space-y-3 mt-6 text-vintage-brown font-semibold">
                <li className="flex items-center">
                  <span className="material-symbols-outlined text-vintage-red mr-3">check_box</span>
                  Do First (Urgent & Important)
                </li>
                <li className="flex items-center">
                  <span className="material-symbols-outlined text-vintage-blue-grey mr-3">calendar_month</span>
                  Schedule (Less Urgent, Important)
                </li>
                <li className="flex items-center">
                  <span className="material-symbols-outlined text-vintage-brown mr-3">group</span>
                  Delegate (Urgent, Less Important)
                </li>
                <li className="flex items-center">
                  <span className="material-symbols-outlined text-gray-500 mr-3">delete</span>
                  Don't Do (Neither)
                </li>
              </ul>
            </div>
            <div className="relative h-64 md:h-80 bg-vintage-beige border-8 border-white shadow-xl flex items-center justify-center -rotate-1">
              <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                <div className="bg-vintage-red bg-opacity-80 flex items-center justify-center text-white font-bold text-2xl border border-white">
                  DO
                </div>
                <div className="bg-vintage-blue-grey bg-opacity-80 flex items-center justify-center text-white font-bold text-2xl border border-white">
                  PLAN
                </div>
                <div className="bg-vintage-brown bg-opacity-80 flex items-center justify-center text-white font-bold text-2xl border border-white">
                  DELEGATE
                </div>
                <div className="bg-gray-400 bg-opacity-80 flex items-center justify-center text-white font-bold text-2xl border border-white">
                  ELIMINATE
                </div>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mb-24">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-vintage-brown uppercase tracking-widest inline-block border-b-4 border-vintage-red pb-2">
                How This App Helps
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="vintage-card p-6 rounded-sm text-center hover:-translate-y-1 transition-transform duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-vintage-beige border-2 border-vintage-red mb-4 shadow-sm">
                  <span className="material-symbols-outlined text-3xl text-vintage-red">grid_view</span>
                </div>
                <h4 className="text-xl font-bold text-vintage-brown mb-2">Structured Clarity</h4>
                <p className="text-vintage-blue-grey font-serif text-sm leading-relaxed">
                  Instantly organize your chaotic task list into four distinct, actionable quadrants.
                </p>
              </div>
              <div className="vintage-card p-6 rounded-sm text-center hover:-translate-y-1 transition-transform duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-vintage-beige border-2 border-vintage-blue-grey mb-4 shadow-sm">
                  <span className="material-symbols-outlined text-3xl text-vintage-blue-grey">visibility</span>
                </div>
                <h4 className="text-xl font-bold text-vintage-brown mb-2">Visual Priorities</h4>
                <p className="text-vintage-blue-grey font-serif text-sm leading-relaxed">
                  See what matters at a single glance and stop guessing what to work on next.
                </p>
              </div>
              <div className="vintage-card p-6 rounded-sm text-center hover:-translate-y-1 transition-transform duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-vintage-beige border-2 border-vintage-brown mb-4 shadow-sm">
                  <span className="material-symbols-outlined text-3xl text-vintage-brown">spa</span>
                </div>
                <h4 className="text-xl font-bold text-vintage-brown mb-2">End Overwhelm</h4>
                <p className="text-vintage-blue-grey font-serif text-sm leading-relaxed">
                  Eliminate stress by focusing effortlessly on high-impact work that moves the needle.
                </p>
              </div>
              <div className="vintage-card p-6 rounded-sm text-center hover:-translate-y-1 transition-transform duration-300">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-vintage-beige border-2 border-gray-500 mb-4 shadow-sm">
                  <span className="material-symbols-outlined text-3xl text-gray-600">event_repeat</span>
                </div>
                <h4 className="text-xl font-bold text-vintage-brown mb-2">Build Habits</h4>
                <p className="text-vintage-blue-grey font-serif text-sm leading-relaxed">
                  Forge powerful daily and weekly planning routines for consistent, long-term success.
                </p>
              </div>
            </div>
          </div>

          {/* About Section */}
          <section className="relative">
            <div className="absolute top-0 left-0 w-full h-full border-t border-b border-vintage-brown opacity-10 pointer-events-none"></div>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-vintage-brown uppercase tracking-widest inline-block border-b-4 border-vintage-red pb-2">
                Who Orchestrated This
              </h2>
            </div>
            <div className="vintage-card bg-white p-8 md:p-12 rounded-sm shadow-lg max-w-4xl mx-auto border-t-8 border-vintage-blue-grey">
              <div className="flex flex-col md:flex-row items-start gap-8">
                <div className="flex-shrink-0 mx-auto md:mx-0">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-vintage-beige border-4 border-vintage-brown flex items-center justify-center shadow-inner overflow-hidden">
                    <img 
                      src="/assets/profile-image.jpg" 
                      alt="Christian Tazma" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-grow text-center md:text-left">
                  <h3 className="text-3xl font-bold text-vintage-red mb-1">Christian Tazma</h3>
                  <p className="text-lg text-vintage-blue-grey font-bold mb-4 uppercase tracking-wide text-sm">
                    Software Developer & AI Specialist
                  </p>
                  <div className="bg-vintage-cream p-6 border border-dashed border-vintage-brown rounded-sm mb-6 relative">
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-vintage-beige opacity-80 rotate-1 shadow-sm border border-white"></div>
                    <p className="text-vintage-brown text-lg italic leading-relaxed">
                      "Christian is a creative and forward-thinking Software Developer based in Nairobi. He specializes in building powerful systems that harness AI to tackle real-world challenges."
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center md:justify-start gap-4">
                    <a 
                      className="group flex items-center gap-2 px-4 py-2 bg-vintage-brown text-vintage-cream rounded-sm hover:bg-vintage-red transition-colors duration-300" 
                      href="mailto:christiantazma77@gmail.com"
                    >
                      <span className="material-symbols-outlined group-hover:animate-pulse">mail</span>
                      <span className="font-bold tracking-wide">Gmail</span>
                    </a>
                    <a 
                      className="group flex items-center gap-2 px-4 py-2 bg-vintage-blue-grey text-white rounded-sm hover:bg-vintage-brown transition-colors duration-300" 
                      href="https://github.com/Lil-mast" 
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined">code</span>
                      <span className="font-bold tracking-wide">GitHub</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-vintage-brown text-vintage-cream py-10 mt-auto border-t-8 border-vintage-red relative">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-6">
            <span className="material-symbols-outlined text-4xl text-vintage-beige opacity-30">hourglass_top</span>
          </div>
          <nav className="flex justify-center flex-wrap gap-8 mb-6 text-sm uppercase tracking-widest">
            <a href="#" className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors">
              Help Center
            </a>
            <a href="#" className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-white hover:underline decoration-1 underline-offset-4 transition-colors">
              Privacy Policy
            </a>
          </nav>
          <div className="border-t border-vintage-beige border-opacity-20 pt-6 max-w-xs mx-auto">
            <p className="text-xs opacity-60 font-serif tracking-widest">© 2026 Eisenhower Matrix Systems.</p>
            <p className="text-xs opacity-40 font-serif mt-1">Nairobi, Kenya</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
