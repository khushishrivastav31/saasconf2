import RichTextEditor from '../../../../../components/common/RichTextEditor';
import { COUNTRIES_BY_CONTINENT } from '../../../../../config/countries';
import type { EditableProfile } from '../types';
import { fieldInputCls, fieldLabelCls } from './styles';

type UpdateField = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => void;

interface Props {
  formData: EditableProfile;
  updateField: UpdateField;
}

export default function ProfileFormFields({ formData, updateField }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={fieldLabelCls}>
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => updateField('first_name', e.target.value)}
            className={fieldInputCls}
            required
          />
        </div>
        <div>
          <label className={fieldLabelCls}>
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => updateField('last_name', e.target.value)}
            className={fieldInputCls}
            required
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Pronouns</label>
          <select
            value={formData.pronouns}
            onChange={(e) => updateField('pronouns', e.target.value)}
            className={fieldInputCls}
          >
            <option value="">— Select —</option>
            <option value="He/Him">He/Him</option>
            <option value="She/Her">She/Her</option>
            <option value="They/Them">They/Them</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className={fieldLabelCls}>
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            className={fieldInputCls}
            required
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            className={fieldInputCls}
          />
        </div>
        <div>
          <label className={fieldLabelCls}>Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => updateField('title', e.target.value)}
            className={fieldInputCls}
          />
        </div>
      </div>

      <div>
        <label className={fieldLabelCls}>Company</label>
        <input
          type="text"
          value={formData.company}
          onChange={(e) => updateField('company', e.target.value)}
          className={fieldInputCls}
        />
      </div>

      <div>
        <label className={fieldLabelCls}>Bio</label>
        <RichTextEditor
          value={formData.bio}
          onChange={(html) => updateField('bio', html)}
          placeholder="Write a short bio..."
          rows={4}
          maxRows={10}
        />
      </div>

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
    </>
  );
}
