import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { GlobalUnreadCountResponse } from '../../types/messaging';

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<GlobalUnreadCountResponse>({
    queryKey: queryKeys.admin.globalUnread,
    queryFn: () => api.get('/messaging/unread-count').then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const totalUnread = data?.total_unread_count ?? 0;
  const conferences = useMemo(() => data?.conferences ?? [], [data]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        bellRef.current &&
        !bellRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        bellRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        aria-label="Notifications"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
        title={totalUnread > 0 ? `${totalUnread} unread message(s)` : 'No unread messages'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 mt-1 w-72 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 dark:ring-gray-700 z-50 py-1"
        >
          {conferences.length > 0 ? (
            conferences.map((c) => (
              <Link
                key={c.conference_id}
                role="menuitem"
                to={`/modules/conferences/${c.conference_id}?tab=messaging`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
              >
                <span>{c.conference_name}</span>
                <span className="ml-2 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full">
                  {c.unread_count}
                </span>
              </Link>
            ))
          ) : totalUnread > 0 ? (
            <div
              role="menuitem"
              aria-disabled="true"
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 select-none"
            >
              You have {totalUnread} unread message(s)
            </div>
          ) : (
            <div
              role="menuitem"
              aria-disabled="true"
              className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 select-none"
            >
              No new notifications
            </div>
          )}
        </div>
      )}
    </div>
  );
}
