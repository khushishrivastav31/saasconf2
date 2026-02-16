import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

// Extend Tiptap's Commands interface so `setImage` is recognized globally
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string; title?: string; width?: number }) => ReturnType;
    };
  }
}

// ---------------------------------------------------------------------------
// React component rendered inside the editor for each image node
// ---------------------------------------------------------------------------

function ResizableImageView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const img = imgRef.current;
      if (!img) return;
      startX.current = e.clientX;
      startWidth.current = img.offsetWidth;
      setResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      if (imgRef.current) {
        imgRef.current.style.width = `${newWidth}px`;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      setResizing(false);
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(50, startWidth.current + diff);
      updateAttributes({ width: newWidth });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing, updateAttributes]);

  const { src, alt, title, width } = node.attrs;

  return (
    <NodeViewWrapper className="relative inline-block" data-drag-handle>
      <div className={`relative inline-block group ${selected ? "ring-2 ring-primary-500 rounded" : ""}`}>
        <img
          ref={imgRef}
          src={src as string}
          alt={(alt as string) ?? ""}
          title={(title as string) ?? undefined}
          className="max-w-full h-auto rounded block"
          style={{ width: width ? `${width}px` : undefined }}
          draggable={false}
        />
        {/* Right-edge resize handle — visible on hover or when selected */}
        <div
          onMouseDown={onMouseDown}
          className={`absolute top-0 right-0 w-2 h-full cursor-col-resize ${
            selected || resizing
              ? "bg-primary-500/30"
              : "bg-transparent group-hover:bg-gray-400/30"
          }`}
          title="Drag to resize"
        />
        {/* Bottom-right corner handle */}
        <div
          onMouseDown={onMouseDown}
          className={`absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize rounded-tl ${
            selected || resizing
              ? "bg-primary-500"
              : "bg-transparent group-hover:bg-gray-400"
          }`}
        />
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Custom Tiptap node extension that replaces the default Image node
// ---------------------------------------------------------------------------

export const ResizableImage = Node.create({
  name: "image",

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {} as Record<string, unknown>,
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? "inline" : "block";
  },

  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const width = element.getAttribute("width") || element.style.width;
          return width ? parseInt(String(width), 10) || null : null;
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string; width?: number }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});
