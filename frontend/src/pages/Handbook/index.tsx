import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { handbookSections, handbookCategories } from './handbookSections';
import { useAuth } from '../../hooks/useAuth';

export default function Handbook() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState(handbookSections[0]?.id || '');
  const [tocOpen, setTocOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [sectionTexts, setSectionTexts] = useState<Record<string, string>>({});

  // After first render, extract text content from each section for search indexing
  useEffect(() => {
    const texts: Record<string, string> = {};
    for (const section of handbookSections) {
      const el = sectionRefs.current[section.id];
      texts[section.id] = (el?.textContent ?? section.title).toLowerCase();
    }
    setSectionTexts(texts);
  }, []);

  // Scroll-aware active section tracking
  useEffect(() => {
    if (searchQuery) return; // disable scroll tracking while searching
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
  }, [searchQuery]);

  // Scroll to hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && sectionRefs.current[hash]) {
      sectionRefs.current[hash]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setTocOpen(false);
    setSearchQuery('');
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const matchingSectionIds = useMemo(() => {
    if (!searchQuery.trim()) return null; // null = show all
    const q = searchQuery.toLowerCase();
    return new Set(
      handbookSections
        .filter((s) => (sectionTexts[s.id] ?? s.title.toLowerCase()).includes(q))
        .map((s) => s.id)
    );
  }, [searchQuery, sectionTexts]);

  const resultCount = matchingSectionIds?.size ?? handbookSections.length;

  // Filter categories by user modules
  const visibleCategories = useMemo(() => {
    return handbookCategories.filter((category) => {
      // Show if no moduleCode (general content)
      if (!category.moduleCode) return true;
      // Show if user has this module enabled
      return user?.modules?.includes(category.moduleCode);
    });
  }, [user?.modules]);

  // Toggle category collapse
  const toggleCategory = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  return (
    <>
      {/* Sticky search header - always visible on mobile and desktop */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 hidden sm:block">
              Admin Handbook
            </h1>
            <div className="relative flex-1 sm:max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search handbook..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="hidden sm:inline-flex text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {resultCount === 0
                  ? 'No results'
                  : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {searchQuery && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 sm:hidden">
            {resultCount === 0
              ? 'No sections match your search.'
              : `${resultCount} section${resultCount === 1 ? '' : 's'} matching "${searchQuery}"`}
          </p>
        )}

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
                {visibleCategories.map((category) => {
                  const isCollapsed = collapsedCategories.has(category.id);
                  const hasVisibleSections = category.sections.some(
                    (s) => !matchingSectionIds || matchingSectionIds.has(s.id)
                  );

                  if (!hasVisibleSections && searchQuery) return null;

                  return (
                    <div key={category.id} className="mb-2">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                      >
                        <span>{category.name}</span>
                        <svg
                          className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                      {!isCollapsed && (
                        <div className="ml-3 mt-1">
                          {category.sections.map((section) => {
                            const hidden =
                              matchingSectionIds && !matchingSectionIds.has(section.id);
                            if (hidden) return null;

                            return (
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
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            )}
          </div>

          {/* Desktop sticky TOC sidebar with categories */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="sticky top-20 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2">
                Contents
              </h2>
              {visibleCategories.map((category) => {
                const isCollapsed = collapsedCategories.has(category.id);
                const hasVisibleSections = category.sections.some(
                  (s) => !matchingSectionIds || matchingSectionIds.has(s.id)
                );

                if (!hasVisibleSections && searchQuery) return null;

                return (
                  <div key={category.id} className="mb-2">
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                    >
                      <span className="flex items-center gap-2">
                        {category.moduleCode && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
                        )}
                        {category.name}
                      </span>
                      <svg
                        className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                    {!isCollapsed && (
                      <div className="ml-3 mt-1">
                        {category.sections.map((section) => {
                          const hidden = matchingSectionIds && !matchingSectionIds.has(section.id);
                          if (hidden) return null;

                          return (
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Content area */}
          <div className="flex-1 min-w-0 space-y-8">
            {handbookSections.map((section) => {
              const hidden = matchingSectionIds && !matchingSectionIds.has(section.id);
              return (
                <section
                  key={section.id}
                  id={section.id}
                  ref={(el) => {
                    sectionRefs.current[section.id] = el;
                  }}
                  className={`scroll-mt-20 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6${hidden ? ' hidden' : ''}`}
                >
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    {section.title}
                  </h2>
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-a:text-primary-600 dark:prose-a:text-primary-400">
                    {section.content()}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
