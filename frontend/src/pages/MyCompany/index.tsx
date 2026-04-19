import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import CompanyForm from './CompanyForm';
import EmailSettingsTab from './EmailSettingsTab';
import PrivacyRequestsTab from './PrivacyRequestsTab';
import type { Tenant } from '../../types';
import type { MyCompanyTab } from './types';

export default function MyCompany() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MyCompanyTab>('company');

  const {
    data: tenant,
    isLoading,
    error,
  } = useQuery<Tenant>({
    queryKey: ['my-company'],
    queryFn: async () => {
      const res = await api.get('/my-company');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load company information</p>
      </div>
    );
  }

  const tabs: { key: MyCompanyTab; label: string }[] = [
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email Settings' },
    { key: 'privacy', label: 'Privacy Requests' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Company</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your company information, email settings, and templates
        </p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'company' && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="p-6">
            <CompanyForm
              tenant={tenant}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ['my-company'] })}
            />
          </div>
        </div>
      )}

      {activeTab === 'email' && (
        <EmailSettingsTab
          tenant={tenant}
          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['my-company'] })}
        />
      )}

      {activeTab === 'privacy' && <PrivacyRequestsTab />}
    </div>
  );
}
