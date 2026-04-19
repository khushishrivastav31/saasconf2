const RIGHTS: { title: string; body: string }[] = [
  {
    title: 'Access your data (Art. 15)',
    body: 'Ask the organizer what personal data they hold about you. You are entitled to a copy in a readable format.',
  },
  {
    title: 'Correct your data (Art. 16)',
    body: 'Most fields you can fix here yourself — name, contact info, bio. For anything you cannot edit, ask the organizer to correct it.',
  },
  {
    title: 'Delete your data (Art. 17)',
    body: 'Ask the organizer to delete your personal data. Note: paid invoices must be retained under German tax law (HGB §257) for up to 10 years — the organizer will explain which records must stay.',
  },
  {
    title: 'Portable export (Art. 20)',
    body: 'Ask for your data in a machine-readable format (JSON) so you can move it to another service. Covered by the same export as access.',
  },
  {
    title: 'Object to processing (Art. 21)',
    body: 'Ask the organizer to stop sending you marketing or reminder emails, or to stop using your data for a specific purpose.',
  },
  {
    title: 'Complain to a supervisory authority',
    body: 'If you are not satisfied with how the organizer handles your request, you can complain to the data-protection authority in your country.',
  },
];

export default function DataRightsPanel() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
        Under the EU General Data Protection Regulation you have the following rights. The event
        organizer (not this platform) is your contact point &mdash; reach them via the contact
        address in the event&apos;s Privacy Policy.
      </p>
      <ul className="space-y-4">
        {RIGHTS.map((r) => (
          <li key={r.title}>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.title}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{r.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-5">
        The organizer must respond within one month. Responses are free of charge; you do not need
        to justify your request.
      </p>
    </div>
  );
}
