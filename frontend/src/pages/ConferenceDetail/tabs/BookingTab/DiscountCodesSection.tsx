import type {
  BookingOption,
  DiscountCode,
} from "../../../../types";

export interface DiscountCodesSectionProps {
  isAdmin: boolean;
  discountCodes: DiscountCode[] | undefined;
  bookingOptions: BookingOption[];
  onAddDiscount: () => void;
  onEditDiscount: (discount: DiscountCode) => void;
  onDeleteTarget: (target: { type: "period" | "option" | "discount"; id: string; name: string }) => void;
}

export default function DiscountCodesSection({
  isAdmin,
  discountCodes,
  bookingOptions,
  onAddDiscount,
  onEditDiscount,
  onDeleteTarget,
}: DiscountCodesSectionProps) {
  return (
    <div className="mt-10">
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Discount Codes</h3>
          <p className="mt-0.5 text-sm text-gray-500">Manage discount codes for attendee bookings.</p>
        </div>
        {isAdmin && (
          <button
            onClick={onAddDiscount}
            className="mt-2 sm:mt-0 inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            + Discount Code
          </button>
        )}
      </div>

      {/* Discount Codes List */}
      {(discountCodes || []).length === 0 ? (
        <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
          <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <p className="mt-2 text-sm text-gray-500">No discount codes yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Discount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Applies To</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Valid Period</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Max Uses</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-[80px]"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(discountCodes || []).map((dc) => (
                <tr key={dc.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono font-medium text-gray-900">{dc.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">{dc.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {dc.discount_type === "percentage"
                        ? `${dc.discount_value}%`
                        : `${dc.currency || ""} ${dc.discount_value}`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {dc.applicable_option_ids.length === 0 ? (
                      <span className="text-xs text-gray-400">All options</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {dc.applicable_option_ids.map((optId) => {
                          const opt = bookingOptions.find((o) => o.id === optId);
                          return opt ? (
                            <span key={optId} className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                              {opt.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {dc.start_date || dc.end_date ? (
                      <>
                        {dc.start_date ? new Date(dc.start_date + "T00:00:00").toLocaleDateString() : "---"}
                        {" — "}
                        {dc.end_date ? new Date(dc.end_date + "T00:00:00").toLocaleDateString() : "---"}
                      </>
                    ) : (
                      <span className="text-gray-400">No expiry</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {dc.max_uses === 0 ? "Unlimited" : dc.max_uses}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${dc.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {dc.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => onEditDiscount(dc)}
                          className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteTarget({ type: "discount", id: dc.id, name: dc.code })}
                          className="text-xs text-red-400 hover:text-red-600 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
