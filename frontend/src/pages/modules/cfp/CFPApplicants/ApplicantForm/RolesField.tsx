import type { UserRole } from '../../../../../types';
import type { ApplicantFormData } from './types';

interface Props {
  formData: ApplicantFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicantFormData>>;
  userRoles: UserRole[];
}

export default function RolesField({ formData, setFormData, userRoles }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Roles
      </label>
      <div className="flex flex-wrap gap-2">
        {userRoles.map((role) => {
          const isSelected = formData.role_ids.includes(role.id);
          return (
            <button
              key={role.id}
              type="button"
              onClick={() =>
                setFormData((d) => ({
                  ...d,
                  role_ids: isSelected
                    ? d.role_ids.filter((id) => id !== role.id)
                    : [...d.role_ids, role.id],
                }))
              }
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                isSelected
                  ? 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
              }`}
            >
              {isSelected && (
                <svg
                  className="w-3.5 h-3.5 mr-1.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {role.name}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Click to toggle role assignment
      </p>
    </div>
  );
}
