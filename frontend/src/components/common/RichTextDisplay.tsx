import DOMPurify from "dompurify";
import { isHtml, stripHtml } from "../../utils/richText";

interface RichTextDisplayProps {
  content: string | null | undefined;
  fallback?: string;
  className?: string;
  truncate?: boolean;
}

export default function RichTextDisplay({
  content,
  fallback = "--",
  className = "",
  truncate = false,
}: RichTextDisplayProps) {
  if (!content || content.trim() === "") {
    return <span className={`text-gray-400 ${className}`}>{fallback}</span>;
  }

  if (truncate) {
    const text = isHtml(content) ? stripHtml(content) : content;
    return (
      <span className={`truncate block ${className}`} title={text}>
        {text}
      </span>
    );
  }

  if (isHtml(content)) {
    return (
      <div
        className={`prose prose-sm max-w-none ${className}`}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
      />
    );
  }

  return (
    <p className={`whitespace-pre-wrap ${className}`}>{content}</p>
  );
}
