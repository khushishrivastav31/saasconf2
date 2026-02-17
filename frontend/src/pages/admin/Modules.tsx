import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';
import type { Module, PaginatedResponse } from '../../types';

// Define the correct module order
const MODULE_ORDER = [
  'conference',
  'news',
  'locations',
  'sponsors',
  'cfp',
  'speakers',
  'sessions',
  'attendees',
  'analytics',
  'volunteers',
  'service_providers',
  'program',
  'invoices',
  'registration',
];

function sortModules(modules: Module[]): Module[] {
  return [...modules].sort((a, b) => {
    const indexA = MODULE_ORDER.indexOf(a.code);
    const indexB = MODULE_ORDER.indexOf(b.code);
    // If module not in order list, put at end
    const orderA = indexA === -1 ? MODULE_ORDER.length : indexA;
    const orderB = indexB === -1 ? MODULE_ORDER.length : indexB;
    return orderA - orderB;
  });
}

export default function Modules() {
  const { data, isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Module>>('/admin/modules');
      return response.data;
    },
  });

  const sortedModules = data?.items ? sortModules(data.items) : [];

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modules</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage platform modules that can be assigned to companies
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedModules.map((module) => (
            <div key={module.id} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">{module.name}</h3>
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      module.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {module.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{module.code}</p>
                {module.description && (
                  <p className="mt-3 text-sm text-gray-600">{module.description}</p>
                )}
                <div className="mt-4 flex items-center text-sm text-gray-500">
                  <svg
                    className="w-4 h-4 mr-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5"
                    />
                  </svg>
                  {module.tenant_count} companies using this module
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
