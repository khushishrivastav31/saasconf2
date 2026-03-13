import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../../../components/Modal';
import type { Tenant } from '../../../types';
import CompanyInfoTab from './components/CompanyInfoTab';
import UsersTab from './components/UsersTab';
import { AddUserModal } from './components/UsersTab';

export default function TenantDetailModal({
  tenant,
  onClose,
}: {
  tenant: Tenant;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'users'>('info');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const queryClient = useQueryClient();

  const tabs = [
    { id: 'info' as const, name: 'Company Info' },
    { id: 'users' as const, name: 'Users' },
  ];

  return (
    <Modal open={true} onClose={onClose} title={tenant.name} size="max-w-4xl">
      <p className="px-6 -mt-2 pb-2 text-sm text-gray-500">{tenant.slug}</p>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'info' && (
          <CompanyInfoTab
            tenant={tenant}
            onUpdate={() => {
              queryClient.invalidateQueries({ queryKey: ['tenants'] });
            }}
            onClose={onClose}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            tenantId={tenant.id}
            superUserId={tenant.super_user_id}
            onAddUser={() => setIsAddUserOpen(true)}
            onSuperUserChange={() => {
              queryClient.invalidateQueries({ queryKey: ['tenants'] });
            }}
          />
        )}
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <AddUserModal
          tenantId={tenant.id}
          onClose={() => {
            setIsAddUserOpen(false);
            queryClient.invalidateQueries({
              queryKey: ['tenant-users', tenant.id],
            });
          }}
        />
      )}
    </Modal>
  );
}
