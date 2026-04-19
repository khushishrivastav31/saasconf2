import type { EditableProfile } from '../../types';
import { fieldInputCls, fieldLabelCls } from '../styles';

type UpdateField = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => void;

interface Props {
  formData: EditableProfile;
  updateField: UpdateField;
}

export default function IdentitySection({ formData, updateField }: Props) {
  return (
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
      <div className="sm:col-span-2">
        <label className={fieldLabelCls}>Company</label>
        <input
          type="text"
          value={formData.company}
          onChange={(e) => updateField('company', e.target.value)}
          className={fieldInputCls}
        />
      </div>
    </div>
  );
}
