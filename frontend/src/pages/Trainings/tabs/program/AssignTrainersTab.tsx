interface Props {
  year: number;
}

export default function AssignTrainersTab({ year }: Props) {
  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        Assign Trainers {year}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Coming soon. Assign trainers to training instances for {year}.
      </p>
    </div>
  );
}
