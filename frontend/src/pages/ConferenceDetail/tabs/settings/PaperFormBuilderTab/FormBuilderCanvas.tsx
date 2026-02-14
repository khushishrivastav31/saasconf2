import type { PaperFormField } from "../../../../../types";
import FieldCard from "./FieldCard";

interface FormBuilderCanvasProps {
  fields: PaperFormField[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onDeleteField: (field: PaperFormField) => void;
  isAdmin: boolean;
}

export default function FormBuilderCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onDeleteField,
  isAdmin,
}: FormBuilderCanvasProps) {
  // Fields are already sorted by parent component
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <FieldCard
          key={field.id}
          field={field}
          isSelected={selectedFieldId === field.id}
          onSelect={() => onSelectField(field.id)}
          onDelete={() => onDeleteField(field)}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}
