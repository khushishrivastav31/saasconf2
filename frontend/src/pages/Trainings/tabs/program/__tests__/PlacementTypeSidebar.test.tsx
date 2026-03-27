import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlacementTypeSidebar from '../PlacementTypeSidebar';

// Mock @dnd-kit/core to avoid DnD context requirement
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('PlacementTypeSidebar', () => {
  it('renders "Type" heading', () => {
    render(<PlacementTypeSidebar />);
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('shows Inhouse draggable item', () => {
    render(<PlacementTypeSidebar />);
    expect(screen.getByText('Inhouse')).toBeInTheDocument();
  });

  it('shows Hybrid draggable item', () => {
    render(<PlacementTypeSidebar />);
    expect(screen.getByText('Hybrid')).toBeInTheDocument();
  });

  it('renders exactly 2 placement type items', () => {
    render(<PlacementTypeSidebar />);
    const items = screen.getAllByText(/^(Inhouse|Hybrid)$/);
    expect(items).toHaveLength(2);
  });

  it('items have correct labels', () => {
    render(<PlacementTypeSidebar />);
    const inhouse = screen.getByText('Inhouse');
    const hybrid = screen.getByText('Hybrid');
    expect(inhouse).toBeInTheDocument();
    expect(hybrid).toBeInTheDocument();
  });

  it('items are rendered as draggable elements', () => {
    const { container } = render(<PlacementTypeSidebar />);
    // Each item should have cursor-grab class
    const draggables = container.querySelectorAll('.cursor-grab');
    expect(draggables.length).toBe(2);
  });
});
