import { COUNTRIES_BY_CONTINENT } from '../../../../../../config/countries';
import type { EditableProfile } from '../../types';
import { fieldInputCls, fieldLabelCls } from '../styles';

type UpdateField = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => void;

interface Props {
  formData: EditableProfile;
  updateField: UpdateField;
}

export default function AddressSection({ formData, updateField }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={fieldLabelCls}>Address Line 1</label>
          <input
            type="text"
            value={formData.address_line1}
            onChange={(e) => updateField('address_line1', e.target.value)}
            className={fieldInputCls}
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Address Line 2</label>
          <input
            type="text"
            value={formData.address_line2}
            onChange={(e) => updateField('address_line2', e.target.value)}
            className={fieldInputCls}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={fieldLabelCls}>City</label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => updateField('city', e.target.value)}
            className={fieldInputCls}
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Postal Code</label>
          <input
            type="text"
            value={formData.postal_code}
            onChange={(e) => updateField('postal_code', e.target.value)}
            className={fieldInputCls}
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Country</label>
          <select
            value={formData.country}
            onChange={(e) => updateField('country', e.target.value)}
            className={fieldInputCls}
          >
            <option value="">— Select country —</option>
            {COUNTRIES_BY_CONTINENT.map((group) => (
              <optgroup key={group.continent} label={group.continent}>
                {group.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
