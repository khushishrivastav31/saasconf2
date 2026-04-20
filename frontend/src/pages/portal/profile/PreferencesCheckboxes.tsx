interface Props {
  needsAccessibility: boolean;
  accessibilityDetails: string;
  agreesToRecording: boolean;
  messageNotifications: boolean;
  onNeedsAccessibilityChange: (v: boolean) => void;
  onAccessibilityDetailsChange: (v: string) => void;
  onAgreesToRecordingChange: (v: boolean) => void;
  onMessageNotificationsChange: (v: boolean) => void;
}

export default function PreferencesCheckboxes({
  needsAccessibility,
  accessibilityDetails,
  agreesToRecording,
  messageNotifications,
  onNeedsAccessibilityChange,
  onAccessibilityDetailsChange,
  onAgreesToRecordingChange,
  onMessageNotificationsChange,
}: Props) {
  return (
    <>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="needs_accessibility"
            checked={needsAccessibility}
            onChange={(e) => {
              const checked = e.target.checked;
              onNeedsAccessibilityChange(checked);
              if (!checked) onAccessibilityDetailsChange('');
            }}
            className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="needs_accessibility" className="flex-1">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              I need accessibility accommodations
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Check if you require accessibility accommodations for the conference.
            </span>
          </label>
        </div>
        {needsAccessibility && (
          <div className="ml-7 mt-3">
            <textarea
              rows={2}
              value={accessibilityDetails}
              onChange={(e) => onAccessibilityDetailsChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
              placeholder="e.g., wheelchair access, sign language interpreter, dietary requirements..."
            />
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="agrees_to_recording"
          checked={agreesToRecording}
          onChange={(e) => onAgreesToRecordingChange(e.target.checked)}
          className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
        />
        <label htmlFor="agrees_to_recording" className="flex-1">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            I agree to being recorded
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            I agree that any selected session from me can be recorded and shared publicly.
          </span>
        </label>
      </div>

      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="message_notifications"
          checked={messageNotifications}
          onChange={(e) => onMessageNotificationsChange(e.target.checked)}
          className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
        />
        <label htmlFor="message_notifications" className="flex-1">
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email notifications for new messages
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Receive an email when you get a new message on the platform.
          </span>
        </label>
      </div>
    </>
  );
}
