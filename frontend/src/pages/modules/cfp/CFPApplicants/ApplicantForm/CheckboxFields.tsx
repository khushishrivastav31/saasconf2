import type { ApplicantFormData } from './types';

interface Props {
  formData: ApplicantFormData;
  setFormData: React.Dispatch<React.SetStateAction<ApplicantFormData>>;
}

export default function CheckboxFields({ formData, setFormData }: Props) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="needs_accessibility"
            checked={formData.needs_accessibility}
            onChange={(e) => {
              const checked = e.target.checked;
              setFormData((d) => ({
                ...d,
                needs_accessibility: checked,
                accessibility_details: checked ? d.accessibility_details : '',
              }));
            }}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="needs_accessibility" className="flex-1">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Needs accessibility accommodations
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Check if this user requires accessibility accommodations for the conference.
            </span>
          </label>
        </div>

        {formData.needs_accessibility && (
          <div className="ml-7">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Please describe your accessibility needs
            </label>
            <textarea
              value={formData.accessibility_details}
              onChange={(e) =>
                setFormData((d) => ({ ...d, accessibility_details: e.target.value }))
              }
              placeholder="e.g., wheelchair access, sign language interpreter, dietary requirements, etc."
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="agrees_to_recording"
          checked={formData.agrees_to_recording}
          onChange={(e) => setFormData((d) => ({ ...d, agrees_to_recording: e.target.checked }))}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="agrees_to_recording" className="flex-1">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Agrees to session recording
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The user agrees that any selected session from them can be recorded and shared publicly.
          </span>
        </label>
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="allow_out_of_timeframe"
          checked={formData.allow_out_of_timeframe}
          onChange={(e) => setFormData((d) => ({ ...d, allow_out_of_timeframe: e.target.checked }))}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="allow_out_of_timeframe" className="flex-1">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Allow out-of-timeframe submissions
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Allow this user to submit papers even outside the CFP open/close dates.
          </span>
        </label>
      </div>
    </>
  );
}
