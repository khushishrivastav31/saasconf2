import type { ProfileRegistration } from '../types';
import { REG_STATUS_COLORS, formatCurrency, formatDate } from '../constants';
import { labelCls, sectionCls, sectionHeadingCls } from './styles';

interface Props {
  registrations: ProfileRegistration[];
}

export default function RegistrationsList({ registrations }: Props) {
  const sorted = [...registrations].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

  return (
    <div className={sectionCls}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h4 className={sectionHeadingCls}>
          Registrations
          {registrations.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
              ({registrations.length})
            </span>
          )}
        </h4>
      </div>
      {registrations.length === 0 ? (
        <div className="px-6 py-5">
          <p className="text-sm text-gray-400 dark:text-gray-500">No registrations.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {sorted.map((reg) => (
            <RegistrationRow key={reg.registration_id} reg={reg} />
          ))}
        </div>
      )}
    </div>
  );
}

function RegistrationRow({ reg }: { reg: ProfileRegistration }) {
  const contactName = [reg.contact_first_name, reg.contact_last_name].filter(Boolean).join(' ');
  const addressLine = [
    reg.street,
    [reg.postal_code, reg.city].filter(Boolean).join(' '),
    reg.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-3 mb-3">
        <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {reg.training_name}
        </h5>
        {reg.training_date && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatDate(reg.training_date)}
          </span>
        )}
        <span
          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${REG_STATUS_COLORS[reg.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
        >
          {reg.status.charAt(0).toUpperCase() + reg.status.slice(1)}
        </span>
        {reg.location_name && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {reg.location_name}
            {reg.location_city ? `, ${reg.location_city}` : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div className="space-y-2">
          {contactName && (
            <div>
              <span className={labelCls}>Contact: </span>
              <span className="text-gray-900 dark:text-gray-100">{contactName}</span>
            </div>
          )}
          {reg.contact_email && (
            <div>
              <span className={labelCls}>Email: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.contact_email}</span>
            </div>
          )}
          {reg.contact_phone && (
            <div>
              <span className={labelCls}>Phone: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.contact_phone}</span>
            </div>
          )}
          {reg.company_name && (
            <div>
              <span className={labelCls}>Company: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.company_name}</span>
            </div>
          )}
          {(reg.street || reg.city) && (
            <div>
              <span className={labelCls}>Address: </span>
              <span className="text-gray-900 dark:text-gray-100">{addressLine}</span>
            </div>
          )}
          {reg.vat_number && (
            <div>
              <span className={labelCls}>VAT: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.vat_number}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {reg.payment_method && (
            <div>
              <span className={labelCls}>Payment: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.payment_method}</span>
            </div>
          )}
          {reg.po_number && (
            <div>
              <span className={labelCls}>PO Number: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.po_number}</span>
            </div>
          )}
          {reg.discount_code && (
            <div>
              <span className={labelCls}>Discount: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.discount_code}</span>
            </div>
          )}
          {reg.total && (
            <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between">
                <span className={labelCls}>Subtotal</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(reg.subtotal, reg.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={labelCls}>Tax</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(reg.vat_amount, reg.currency)}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span className={labelCls}>Total</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatCurrency(reg.total, reg.currency)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {reg.exam_mode && (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <div>
            <span className={labelCls}>Exam: </span>
            <span className="text-gray-900 dark:text-gray-100">{reg.exam_mode}</span>
          </div>
          {reg.exam_language && (
            <div>
              <span className={labelCls}>Language: </span>
              <span className="text-gray-900 dark:text-gray-100">{reg.exam_language}</span>
            </div>
          )}
          {reg.extra_time && (
            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
              Extra Time
            </span>
          )}
        </div>
      )}

      {reg.notes && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{reg.notes}</p>
      )}

      {reg.created_at && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Registered {formatDate(reg.created_at)}
        </p>
      )}
    </div>
  );
}
