import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import Modal from './Modal';
import { useToast } from './Toast';
import api from '../config/api';
import { parseApiError } from '../utils/apiError';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) => {
      const response = await api.patch('/auth/me/password', data);
      return response.data;
    },
    onSuccess: () => {
      showToast('Password changed successfully', 'success');
      handleClose();
    },
    onError: (err) => {
      setError(parseApiError(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError(
        'Password must contain at least one uppercase letter, one lowercase letter, and one digit.'
      );
      return;
    }

    mutation.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  return (
    <Modal open={open} onClose={handleClose} title="Change Password" size="max-w-md">
      <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
        {error && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded text-sm"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="current-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Current Password
          </label>
          <input
            id="current-password"
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            At least 8 characters with uppercase, lowercase, and a digit.
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Confirm New Password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
