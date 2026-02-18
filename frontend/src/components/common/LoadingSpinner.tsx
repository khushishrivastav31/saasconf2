export function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label="Loading">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );
}

export function ButtonSpinner({ label = 'Saving...' }: { label?: string }) {
  return (
    <>
      <div
        className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"
        role="status"
        aria-label={label}
      ></div>
      {label}
    </>
  );
}
