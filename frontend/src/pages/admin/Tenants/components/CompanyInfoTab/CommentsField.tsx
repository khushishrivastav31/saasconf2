import { Controller, useFormContext } from 'react-hook-form';
import RichTextEditor from '../../../../../components/common/RichTextEditor';
import type { CompanyFormData } from './schema';

export default function CommentsField() {
  const { control } = useFormContext<CompanyFormData>();

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Comments / Notes
      </label>
      <Controller
        name="comments"
        control={control}
        render={({ field }) => (
          <RichTextEditor value={field.value} onChange={field.onChange} rows={3} />
        )}
      />
    </div>
  );
}
