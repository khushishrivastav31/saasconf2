import { useState, useEffect, useCallback, useContext } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../../config/api';
import type { Conference, SocialLinks } from '../../../types';
import { CONFERENCE_SOCIAL_PLATFORMS } from '../../../config/socialPlatforms';
import { DirtyContext } from '../DirtyContext';

function ConferenceSocialTab({
  conference,
  onUpdate,
  isAdmin,
}: {
  conference: Conference;
  onUpdate: () => void;
  isAdmin: boolean;
}) {
  const reportDirty = useContext(DirtyContext);
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(conference.social_links || {});
  const [isDirty, setIsDirty] = useState(false);
  const [addPlatform, setAddPlatform] = useState('');
  const [customPlatformName, setCustomPlatformName] = useState('');

  // Sync server data when not dirty
  useEffect(() => {
    if (!isDirty) {
      setSocialLinks(conference.social_links || {});
    }
  }, [conference.social_links, isDirty]);

  // Report dirty state to parent for tab-switch guarding
  useEffect(() => {
    reportDirty(isDirty);
    return () => reportDirty(false);
  }, [isDirty, reportDirty]);

  const updateMutation = useMutation({
    mutationFn: async (links: SocialLinks) => {
      await api.put(`/conferences/${conference.id}`, { social_links: links });
    },
    onSuccess: () => {
      setIsDirty(false);
      onUpdate();
    },
  });

  const handleLinkChange = useCallback((platform: string, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value || undefined }));
    setIsDirty(true);
  }, []);

  const handleDelete = useCallback((platform: string) => {
    setSocialLinks((prev) => {
      const newLinks = { ...prev };
      delete newLinks[platform];
      return newLinks;
    });
    setIsDirty(true);
  }, []);

  const handleAdd = useCallback(() => {
    const key =
      addPlatform === '__custom__'
        ? customPlatformName.trim().toLowerCase().replace(/\s+/g, '_')
        : addPlatform;
    if (!key || socialLinks[key] !== undefined) return;
    setSocialLinks((prev) => ({ ...prev, [key]: '' }));
    setAddPlatform('');
    setCustomPlatformName('');
    setIsDirty(true);
  }, [addPlatform, customPlatformName, socialLinks]);

  const handleSave = useCallback(() => {
    updateMutation.mutate(socialLinks);
  }, [socialLinks, updateMutation]);

  const handleDiscard = useCallback(() => {
    setSocialLinks(conference.social_links || {});
    setIsDirty(false);
  }, [conference.social_links]);

  // Build the list of active entries: known platforms + any custom keys
  const knownKeys = new Set(CONFERENCE_SOCIAL_PLATFORMS.map((p) => p.key as string));
  const allEntries: { key: string; label: string; placeholder: string }[] = [];

  // First add known platforms that are present
  for (const p of CONFERENCE_SOCIAL_PLATFORMS) {
    if (socialLinks[p.key] !== undefined) {
      allEntries.push(p);
    }
  }
  // Then add custom keys (any key not in the known set)
  for (const key of Object.keys(socialLinks)) {
    if (!knownKeys.has(key)) {
      allEntries.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        placeholder: 'Enter URL...',
      });
    }
  }

  // Known platforms available to add (not yet in socialLinks)
  const availablePlatforms = CONFERENCE_SOCIAL_PLATFORMS.filter(
    (p) => socialLinks[p.key] === undefined
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Social Media Links</h4>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Discard
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Existing social links */}
      {allEntries.length > 0 ? (
        <div className="space-y-3 mb-4">
          {allEntries.map((platform) => (
            <div key={platform.key} className="flex items-center gap-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 w-28 flex-shrink-0">
                {platform.label}
              </label>
              <input
                type="text"
                placeholder={platform.placeholder}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={socialLinks[platform.key] || ''}
                onChange={(e) => handleLinkChange(platform.key, e.target.value)}
                disabled={!isAdmin}
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(platform.key)}
                  className="flex-shrink-0 p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                  title={`Remove ${platform.label}`}
                  aria-label={`Remove ${platform.label}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 mb-4">
          No social media links added yet.
        </div>
      )}

      {/* Add new social link */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <select
            value={addPlatform}
            onChange={(e) => {
              setAddPlatform(e.target.value);
              if (e.target.value !== '__custom__') setCustomPlatformName('');
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Select platform...</option>
            {availablePlatforms.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="__custom__">Custom...</option>
          </select>
          {addPlatform === '__custom__' && (
            <input
              type="text"
              placeholder="Platform name"
              value={customPlatformName}
              onChange={(e) => setCustomPlatformName(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 w-40"
            />
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={!addPlatform || (addPlatform === '__custom__' && !customPlatformName.trim())}
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Channel
          </button>
        </div>
      )}
    </div>
  );
}

export default ConferenceSocialTab;
