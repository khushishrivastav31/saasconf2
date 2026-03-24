interface Props {
  year: number;
}

export default function DesignProgramTab({ year }: Props) {
  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        Design Program {year}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Coming soon. Plan which trainings from the catalog will be offered in {year}.
      </p>
    </div>
  );
}
