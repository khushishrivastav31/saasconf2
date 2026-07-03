import RichTextEditor from '../../../../components/common/RichTextEditor';
import type {
  SyllabusCreate,
  SyllabusUpdate,
  CertificationBody,
  TrainingLanguage,
} from '../../../../types/training';

const inputCls =
  'mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300';

export default function SyllabusForm({
  form,
  setForm,
  onSubmit,
  isPending,
  isCreate,
  certBodies,
  languages,
  onCancelCreate,
}: {
  form: SyllabusCreate | SyllabusUpdate;
  setForm: (f: SyllabusCreate | SyllabusUpdate) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  isCreate: boolean;
  certBodies: CertificationBody[];
  languages: TrainingLanguage[];
  onCancelCreate: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Slug *</label>
          <input
            type="text"
            required
            className={inputCls}
            value={form.slug || ''}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="e.g. aws-cloud-practitioner"
          />
        </div>
        <div>
          <label className={labelCls}>Name *</label>
          <input
            type="text"
            required
            className={inputCls}
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <RichTextEditor
          value={form.description || ''}
          onChange={(html) => setForm({ ...form, description: html })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Exam Price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            value={form.price ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                price: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Exam Cost</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputCls}
            value={form.exam_cost ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                exam_cost: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Certification Body</label>
          <select
            className={inputCls}
            value={form.certification_body_id || ''}
            onChange={(e) =>
              setForm({
                ...form,
                certification_body_id: e.target.value || null,
              })
            }
          >
            <option value="">None</option>
            {certBodies.map((cb) => (
              <option key={cb.id} value={cb.id}>
                {cb.company_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <select
            className={inputCls}
            value={form.language_id || ''}
            onChange={(e) =>
              setForm({
                ...form,
                language_id: e.target.value || null,
              })
            }
          >
            <option value="">None</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : isCreate ? 'Create' : 'Save'}
        </button>
        {isCreate && (
          <button
            type="button"
            onClick={onCancelCreate}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
