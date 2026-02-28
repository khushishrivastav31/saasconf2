import { useState, useEffect, useRef, useCallback } from 'react';
import { handbookSections } from './handbookSections';

export default function Handbook() {
  const [activeSection, setActiveSection] = useState(handbookSections[0].id);
  const [tocOpen, setTocOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll-aware active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            window.history.replaceState(null, '', `#${entry.target.id}`);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    const refs = sectionRefs.current;
    for (const section of handbookSections) {
      const el = refs[section.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  // Scroll to hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && sectionRefs.current[hash]) {
      sectionRefs.current[hash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setTocOpen(false);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Admin Handbook</h1>

      <div className="lg:flex lg:gap-8">
        {/* Mobile TOC toggle */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <span>Table of Contents</span>
            <svg
              className={`w-4 h-4 transition-transform ${tocOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {tocOpen && (
            <nav className="mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-2 max-h-80 overflow-y-auto">
              {handbookSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`block w-full text-left px-3 py-1.5 text-sm rounded-md ${
                    activeSection === section.id
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Desktop sticky TOC sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <nav className="sticky top-24 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2">
              Contents
            </h2>
            {handbookSections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`block w-full text-left px-2 py-1.5 text-sm rounded-md ${
                  activeSection === section.id
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-8">
          {handbookSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              ref={(el) => {
                sectionRefs.current[section.id] = el;
              }}
              className="scroll-mt-24 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {section.title}
              </h2>
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-a:text-primary-600 dark:prose-a:text-primary-400">
                {section.content()}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
