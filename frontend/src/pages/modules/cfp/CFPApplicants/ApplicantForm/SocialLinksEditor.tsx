import { useState } from 'react';
import { SPEAKER_SOCIAL_PLATFORMS } from '../../../../../config/socialPlatforms';
import { DeleteIcon } from '../../../../ConferenceDetail/icons';
import type { ApplicantFormData } from './types';

interface Props {
  formData: ApplicantFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicantFormData>>;
}

export default function SocialLinksEditor({ formData, setFormData }: Props) {
  const [addPlatform, setAddPlatform] = useState('');
  const [customPlatformName, setCustomPlatformName] = useState('');

  const knownKeys = new Set(SPEAKER_SOCIAL_PLATFORMS.map((p) => p.key));
  const allEntries: { key: string; label: string; placeholder: string }[] = [];

  for (const p of SPEAKER_SOCIAL_PLATFORMS) {
    if (formData.social_links[p.key] !== undefined) {
      allEntries.push(p);
    }
  }
  for (const key of Object.keys(formData.social_links)) {
    if (!knownKeys.has(key)) {
      allEntries.push({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
        placeholder: 'Enter URL...',
      });
    }
  }

  const availablePlatforms = SPEAKER_SOCIAL_PLATFORMS.filter(
    (p) => formData.social_links[p.key] === undefined
  );

  const handleAddPlatform = () => {
    const key =
      addPlatform === '__custom__'
        ? customPlatformName.trim().toLowerCase().replace(/\s+/g, '_')
        : addPlatform;
    if (!key || formData.social_links[key] !== undefined) return;
    setFormData((d) => ({
      ...d,
      social_links: { ...d.social_links, [key]: '' },
    }));
    setAddPlatform('');
    setCustomPlatformName('');
  };

  const handleDeletePlatform = (key: string) => {
    setFormData((d) => {
      const newLinks = { ...d.social_links };
      delete newLinks[key];
      return { ...d, social_links: newLinks };
    });
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Social Media Profiles
      </label>

      {allEntries.length > 0 ? (
        <div className="space-y-2 mb-3">
          {allEntries.map((platform) => (
            <div key={platform.key} className="flex items-center gap-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0">
                {platform.label}
              </label>
              <input
                type="url"
                placeholder={platform.placeholder}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
                value={formData.social_links[platform.key] || ''}
                onChange={(e) =>
                  setFormData((d) => ({
                    ...d,
                    social_links: {
                      ...d.social_links,
                      [platform.key]: e.target.value,
                    },
                  }))
                }
              />
              <button
                type="button"
                onClick={() => handleDeletePlatform(platform.key)}
                className="flex-shrink-0 p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                title={`Remove ${platform.label}`}
                aria-label={`Remove ${platform.label}`}
              >
                <DeleteIcon />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 mb-3">
          No social media links added yet.
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={addPlatform}
          onChange={(e) => {
            setAddPlatform(e.target.value);
            if (e.target.value !== '__custom__') setCustomPlatformName('');
          }}
          className="border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
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
            className="border border-gray-300 dark:border-gray-600 rounded-md py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100 w-32"
          />
        )}
        <button
          type="button"
          onClick={handleAddPlatform}
          disabled={!addPlatform || (addPlatform === '__custom__' && !customPlatformName.trim())}
          className="inline-flex items-center px-2.5 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add
        </button>
      </div>
    </div>
  );
}
