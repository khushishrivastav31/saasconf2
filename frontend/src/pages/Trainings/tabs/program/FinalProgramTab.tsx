interface Props {
  year: number;
}

export default function FinalProgramTab({ year }: Props) {
  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        Final Program {year}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Coming soon. Review and publish the finalized program for {year}.
      </p>
    </div>
  );
}
