import RichTextEditor from '../../../../../../components/common/RichTextEditor';
import type { EditableProfile } from '../../types';
import { fieldLabelCls } from '../styles';

type UpdateField = <K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) => void;

interface Props {
  formData: EditableProfile;
  updateField: UpdateField;
}

export default function BioSection({ formData, updateField }: Props) {
  return (
    <div>
      <label className={fieldLabelCls}>Short Bio</label>
      <RichTextEditor
        value={formData.bio}
        onChange={(html) => updateField('bio', html)}
        placeholder="Write a short bio..."
        rows={4}
        maxRows={10}
      />
    </div>
  );
}
