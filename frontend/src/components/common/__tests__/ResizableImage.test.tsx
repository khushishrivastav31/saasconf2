import { describe, it, expect, vi } from 'vitest';
import { ResizableImage } from '../ResizableImage';

// We test the Tiptap extension object (exported as ResizableImage)
// and the ResizableImageView component behavior through the extension's configuration

describe('ResizableImage extension', () => {
  describe('extension configuration', () => {
    it("has name 'image'", () => {
      expect(ResizableImage.name).toBe('image');
    });

    it('is draggable', () => {
      expect(ResizableImage.config.draggable).toBe(true);
    });

    it('has default options', () => {
      const options = ResizableImage.options;
      expect(options.inline).toBe(false);
      expect(options.allowBase64).toBe(true);
      expect(options.HTMLAttributes).toEqual({});
    });

    it('defines src, alt, title, and width attributes', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      expect(attributes).toBeDefined();
      expect(attributes).toHaveProperty('src');
      expect(attributes).toHaveProperty('alt');
      expect(attributes).toHaveProperty('title');
      expect(attributes).toHaveProperty('width');
    });

    it('parses HTML from img[src] tags', () => {
      const parseRules = ResizableImage.config.parseHTML?.call(ResizableImage);
      expect(parseRules).toBeDefined();
      expect(parseRules).toHaveLength(1);
      expect(parseRules![0]).toHaveProperty('tag', 'img[src]');
    });

    it('renders as img tag in HTML output', () => {
      const renderResult = ResizableImage.config.renderHTML?.call(ResizableImage, {
        HTMLAttributes: { src: 'test.png', alt: 'test' },
      });
      expect(renderResult).toBeDefined();
      expect(renderResult![0]).toBe('img');
    });
  });

  describe('width attribute parsing', () => {
    it('parses width from element attribute', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      const widthConfig = attributes?.width;

      // Create mock element with getAttribute
      const mockElement = {
        getAttribute: vi.fn().mockReturnValue('300'),
        style: { width: '' },
      } as unknown as HTMLElement;

      const parsed = widthConfig?.parseHTML?.(mockElement);
      expect(parsed).toBe(300);
    });

    it('parses width from element style', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      const widthConfig = attributes?.width;

      const mockElement = {
        getAttribute: vi.fn().mockReturnValue(null),
        style: { width: '250px' },
      } as unknown as HTMLElement;

      const parsed = widthConfig?.parseHTML?.(mockElement);
      expect(parsed).toBe(250);
    });

    it('returns null when no width is set', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      const widthConfig = attributes?.width;

      const mockElement = {
        getAttribute: vi.fn().mockReturnValue(null),
        style: { width: '' },
      } as unknown as HTMLElement;

      const parsed = widthConfig?.parseHTML?.(mockElement);
      expect(parsed).toBeNull();
    });

    it('renders width attribute when present', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      const widthConfig = attributes?.width;

      const result = widthConfig?.renderHTML?.({ width: 400 });
      expect(result).toEqual({ width: 400 });
    });

    it('returns empty object when width is not set', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      const widthConfig = attributes?.width;

      const result = widthConfig?.renderHTML?.({ width: null });
      expect(result).toEqual({});
    });

    it('has null as default width', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      expect(attributes?.width?.default).toBeNull();
    });

    it('has null as default src', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      expect(attributes?.src?.default).toBeNull();
    });

    it('has null as default alt', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      expect(attributes?.alt?.default).toBeNull();
    });

    it('has null as default title', () => {
      const attributes = ResizableImage.config.addAttributes?.call(ResizableImage);
      expect(attributes?.title?.default).toBeNull();
    });
  });

  describe('group configuration', () => {
    it("returns 'block' group when not inline", () => {
      const group = ResizableImage.config.group?.call({
        ...ResizableImage,
        options: { ...ResizableImage.options, inline: false },
      });
      expect(group).toBe('block');
    });

    it("returns 'inline' group when inline option is true", () => {
      const group = ResizableImage.config.group?.call({
        ...ResizableImage,
        options: { ...ResizableImage.options, inline: true },
      });
      expect(group).toBe('inline');
    });
  });

  describe('commands', () => {
    it('defines setImage command', () => {
      const addCommands = ResizableImage.config.addCommands;
      expect(addCommands).toBeDefined();
    });
  });
});
