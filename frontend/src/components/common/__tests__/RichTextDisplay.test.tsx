import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RichTextDisplay from "../RichTextDisplay";

// Mock DOMPurify
vi.mock("dompurify", () => ({
  default: {
    sanitize: (html: string) => html, // Pass through for testing
  },
}));

// Mock the richText utilities
vi.mock("../../../utils/richText", () => ({
  isHtml: (str: string) => /<[a-z][\s\S]*>/i.test(str),
  stripHtml: (html: string) => {
    // Simple implementation for testing
    return html.replace(/<[^>]*>/g, "");
  },
}));

describe("RichTextDisplay", () => {
  describe("empty content handling", () => {
    it("renders fallback when content is null", () => {
      render(<RichTextDisplay content={null} />);
      expect(screen.getByText("--")).toBeInTheDocument();
    });

    it("renders fallback when content is undefined", () => {
      render(<RichTextDisplay content={undefined} />);
      expect(screen.getByText("--")).toBeInTheDocument();
    });

    it("renders fallback when content is empty string", () => {
      render(<RichTextDisplay content="" />);
      expect(screen.getByText("--")).toBeInTheDocument();
    });

    it("renders fallback when content is whitespace only", () => {
      render(<RichTextDisplay content="   " />);
      expect(screen.getByText("--")).toBeInTheDocument();
    });

    it("renders custom fallback when provided", () => {
      render(<RichTextDisplay content={null} fallback="No content" />);
      expect(screen.getByText("No content")).toBeInTheDocument();
    });

    it("applies gray text color to fallback", () => {
      render(<RichTextDisplay content={null} />);
      const fallback = screen.getByText("--");
      expect(fallback).toHaveClass("text-gray-400");
    });
  });

  describe("plain text content", () => {
    it("renders plain text content in a paragraph", () => {
      render(<RichTextDisplay content="Hello, World!" />);
      expect(screen.getByText("Hello, World!")).toBeInTheDocument();
    });

    it("applies whitespace-pre-wrap class to plain text", () => {
      render(<RichTextDisplay content="Plain text content" />);
      const paragraph = screen.getByText("Plain text content");
      expect(paragraph.tagName).toBe("P");
      expect(paragraph).toHaveClass("whitespace-pre-wrap");
    });

    it("preserves line breaks in plain text", () => {
      render(<RichTextDisplay content={"Line 1\nLine 2"} />);
      // The literal string with \n gets rendered as "Line 1\nLine 2" in JSX
      const paragraph = screen.getByText(/Line 1/);
      expect(paragraph).toBeInTheDocument();
      expect(paragraph).toHaveClass("whitespace-pre-wrap");
    });
  });

  describe("HTML content", () => {
    it("renders HTML content with dangerouslySetInnerHTML", () => {
      render(<RichTextDisplay content="<p>HTML content</p>" />);
      expect(screen.getByText("HTML content")).toBeInTheDocument();
    });

    it("renders complex HTML content", () => {
      render(
        <RichTextDisplay content="<strong>Bold</strong> and <em>italic</em>" />
      );
      expect(screen.getByText("Bold")).toBeInTheDocument();
      expect(screen.getByText("and")).toBeInTheDocument();
      expect(screen.getByText("italic")).toBeInTheDocument();
    });

    it("applies prose styling to HTML content", () => {
      const { container } = render(
        <RichTextDisplay content="<p>HTML content</p>" />
      );
      const div = container.querySelector("div.prose");
      expect(div).toBeInTheDocument();
      expect(div).toHaveClass("prose-sm", "max-w-none");
    });

    it("renders nested HTML elements", () => {
      render(
        <RichTextDisplay content="<ul><li>Item 1</li><li>Item 2</li></ul>" />
      );
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });
  });

  describe("truncate mode", () => {
    it("renders truncated plain text", () => {
      render(<RichTextDisplay content="Long text content" truncate={true} />);
      const span = screen.getByText("Long text content");
      expect(span.tagName).toBe("SPAN");
      expect(span).toHaveClass("truncate", "block");
    });

    it("strips HTML and renders as plain text when truncate is true", () => {
      render(
        <RichTextDisplay content="<p>HTML content here</p>" truncate={true} />
      );
      expect(screen.getByText("HTML content here")).toBeInTheDocument();
    });

    it("sets title attribute with full text when truncating", () => {
      render(
        <RichTextDisplay
          content="<p>Some long content</p>"
          truncate={true}
        />
      );
      const span = screen.getByText("Some long content");
      expect(span).toHaveAttribute("title", "Some long content");
    });

    it("handles plain text in truncate mode", () => {
      render(<RichTextDisplay content="Plain text" truncate={true} />);
      const span = screen.getByText("Plain text");
      expect(span).toHaveClass("truncate");
      expect(span).toHaveAttribute("title", "Plain text");
    });
  });

  describe("className prop", () => {
    it("applies custom className to fallback", () => {
      render(
        <RichTextDisplay content={null} className="custom-class" />
      );
      const fallback = screen.getByText("--");
      expect(fallback).toHaveClass("custom-class");
    });

    it("applies custom className to plain text", () => {
      render(
        <RichTextDisplay content="Plain text" className="custom-class" />
      );
      const paragraph = screen.getByText("Plain text");
      expect(paragraph).toHaveClass("custom-class");
    });

    it("applies custom className to HTML content", () => {
      const { container } = render(
        <RichTextDisplay content="<p>HTML</p>" className="custom-class" />
      );
      const div = container.querySelector("div.prose");
      expect(div).toHaveClass("custom-class");
    });

    it("applies custom className to truncated content", () => {
      render(
        <RichTextDisplay
          content="Truncated"
          truncate={true}
          className="custom-class"
        />
      );
      const span = screen.getByText("Truncated");
      expect(span).toHaveClass("custom-class");
    });
  });

  describe("fallback prop variations", () => {
    it("renders N/A fallback", () => {
      render(<RichTextDisplay content={null} fallback="N/A" />);
      expect(screen.getByText("N/A")).toBeInTheDocument();
    });

    it("renders empty fallback", () => {
      const { container } = render(
        <RichTextDisplay content={null} fallback="" />
      );
      const span = container.querySelector("span.text-gray-400");
      expect(span).toBeInTheDocument();
      expect(span?.textContent).toBe("");
    });

    it("renders descriptive fallback", () => {
      render(
        <RichTextDisplay
          content={null}
          fallback="No description available"
        />
      );
      expect(screen.getByText("No description available")).toBeInTheDocument();
    });
  });

  describe("HTML detection", () => {
    it("treats content without tags as plain text", () => {
      render(<RichTextDisplay content="No HTML here" />);
      const paragraph = screen.getByText("No HTML here");
      expect(paragraph.tagName).toBe("P");
    });

    it("treats content with < but no valid tags as plain text", () => {
      render(<RichTextDisplay content="1 < 2 and 3 > 2" />);
      const content = screen.getByText("1 < 2 and 3 > 2");
      // This should be treated as plain text since it doesn't match the HTML regex
      expect(content.tagName).toBe("P");
    });

    it("treats content with valid HTML tag as HTML", () => {
      const { container } = render(
        <RichTextDisplay content="<div>Content</div>" />
      );
      const div = container.querySelector("div.prose");
      expect(div).toBeInTheDocument();
    });

    it("handles self-closing tags", () => {
      const { container } = render(
        <RichTextDisplay content="Line 1<br/>Line 2" />
      );
      const div = container.querySelector("div.prose");
      expect(div).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles special characters in plain text", () => {
      render(<RichTextDisplay content={'Special chars: &amp; < > " \''} />);
      expect(
        screen.getByText('Special chars: &amp; < > " \'')
      ).toBeInTheDocument();
    });

    it("handles very long content", () => {
      const longContent = "a".repeat(1000);
      render(<RichTextDisplay content={longContent} />);
      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it("handles content with only whitespace after stripping HTML", () => {
      // This tests the edge case where HTML contains only whitespace
      const { container } = render(<RichTextDisplay content="<p>   </p>" truncate={true} />);
      // After stripping HTML, we should get whitespace - find by class
      const span = container.querySelector("span.truncate");
      expect(span).toBeInTheDocument();
      expect(span).toHaveAttribute("title");
    });

    it("handles mixed content with HTML and plain text patterns", () => {
      render(
        <RichTextDisplay content="Price: $50 < $100, use <code>discount</code>" />
      );
      // Should be detected as HTML due to <code> tag
      expect(screen.getByText(/discount/)).toBeInTheDocument();
    });
  });
});
