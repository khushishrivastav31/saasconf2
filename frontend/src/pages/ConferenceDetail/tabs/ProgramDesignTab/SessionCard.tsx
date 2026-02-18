import { memo, useState, useRef, useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ProgramSession } from '../../../../types';

interface SessionCardProps {
  session: ProgramSession;
  draggableId?: string;
  onClick: () => void;
  onDelete: (sessionId: string) => void;
  onResize?: (sessionId: string, slotSpan: number, trackSpan: number) => void;
  onUnassignPaper?: (sessionId: string) => void;
  isAdmin: boolean;
  isDraggable?: boolean;
  isDragging?: boolean;
  gridCellHeight?: number; // Height of one grid cell in pixels
  gridCellWidth?: number; // Width of one grid cell in pixels
}

function SessionCard({
  session,
  draggableId,
  onClick,
  onDelete,
  onResize,
  onUnassignPaper,
  isAdmin,
  isDraggable = true,
  isDragging,
  gridCellHeight = 80,
  gridCellWidth = 150,
}: SessionCardProps) {
  const canDrag = isAdmin && isDraggable;
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: draggableId || session.id,
    data: { type: 'session', session },
    disabled: !canDrag,
  });

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    slotSpan: number;
    trackSpan: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  // General events use gray, regular sessions use their color or default blue
  const bgColor = session.is_general_event
    ? session.color || '#6B7280'
    : session.color || '#3B82F6';

  // Compute actual cell counts from visible_cells when available
  const { actualSlots, actualTracks } = useMemo(() => {
    const visibleCells = session.settings?.visible_cells as
      | Array<{ slot_id: string; track_id: string }>
      | undefined;
    if (visibleCells && visibleCells.length > 0) {
      const uniqueSlots = new Set(visibleCells.map((c) => c.slot_id));
      const uniqueTracks = new Set(visibleCells.map((c) => c.track_id));
      return { actualSlots: uniqueSlots.size, actualTracks: uniqueTracks.size };
    }
    return { actualSlots: session.slot_span, actualTracks: session.track_span };
  }, [session.slot_span, session.track_span, session.settings]);

  // Handle resize start
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, type: 'vertical' | 'horizontal' | 'both') => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        slotSpan: session.slot_span,
        trackSpan: session.is_general_event ? 0 : session.track_span,
      };

      // Mouse move is tracked; actual resize computed on mouseUp
      const handleMouseMove = () => {};

      const handleMouseUp = (upEvent: MouseEvent) => {
        if (!resizeStartRef.current || !onResize) {
          setIsResizing(false);
          return;
        }

        const deltaX = upEvent.clientX - resizeStartRef.current.x;
        const deltaY = upEvent.clientY - resizeStartRef.current.y;

        let newSlotSpan = resizeStartRef.current.slotSpan;
        let newTrackSpan = resizeStartRef.current.trackSpan;

        if (type === 'vertical' || type === 'both') {
          const slotDelta = Math.round(deltaY / gridCellHeight);
          newSlotSpan = Math.max(1, resizeStartRef.current.slotSpan + slotDelta);
        }

        if ((type === 'horizontal' || type === 'both') && !session.is_general_event) {
          const trackDelta = Math.round(deltaX / gridCellWidth);
          newTrackSpan = Math.max(1, resizeStartRef.current.trackSpan + trackDelta);
        }

        // Only call onResize if values changed
        if (
          newSlotSpan !== resizeStartRef.current.slotSpan ||
          newTrackSpan !== resizeStartRef.current.trackSpan
        ) {
          onResize(session.id, newSlotSpan, newTrackSpan);
        }

        setIsResizing(false);
        resizeStartRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [session, onResize, gridCellHeight, gridCellWidth]
  );

  // Build tooltip with full info
  const tooltipParts = [session.title];
  if (session.speaker_name) tooltipParts.push(`Speaker: ${session.speaker_name}`);
  if (session.session_type_name && !session.is_general_event)
    tooltipParts.push(`Type: ${session.session_type_name}`);
  if (actualSlots > 1 || actualTracks > 1) {
    const spanParts = [];
    if (actualSlots > 1) spanParts.push(`${actualSlots} slots`);
    if (actualTracks > 1) spanParts.push(`${actualTracks} tracks`);
    tooltipParts.push(spanParts.join(' × '));
  }
  if (session.allow_in_session_free) tooltipParts.push('Spans break');
  const tooltip = tooltipParts.join('\n');

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      data-session-card
      style={style}
      {...(canDrag && !isResizing ? { ...attributes, ...listeners } : {})}
      onClick={() => {
        if (!isResizing) onClick();
      }}
      className={`
        group h-full p-2 rounded-md text-white cursor-pointer
        transition-shadow hover:shadow-lg relative
        ${isDragging ? 'opacity-50 shadow-2xl' : ''}
        ${canDrag && !isResizing ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isResizing ? 'z-50' : ''}
      `}
      title={tooltip}
    >
      <div
        className="h-full flex flex-col rounded-md overflow-hidden"
        style={{ backgroundColor: bgColor }}
      >
        <div className="flex-1 p-1.5 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-medium leading-tight truncate">{session.title}</h4>
            {session.speaker_name && (
              <p className="text-xs opacity-80 leading-tight truncate">{session.speaker_name}</p>
            )}
            {session.session_type_name && !session.is_general_event && (
              <p className="text-xs opacity-65 leading-tight truncate">
                {session.session_type_name}
              </p>
            )}
            {/* Show span info when spanning multiple cells */}
            {(actualSlots > 1 || actualTracks > 1) && (
              <p className="text-xs opacity-60 leading-tight truncate">
                {actualSlots > 1 && `${actualSlots} slots`}
                {actualSlots > 1 && actualTracks > 1 && ' × '}
                {actualTracks > 1 && `${actualTracks} tracks`}
              </p>
            )}
            {session.allow_in_session_free && (
              <p className="text-xs opacity-70 leading-tight">Spans break</p>
            )}
          </div>
        </div>

        {/* Unmerge button - shows on hover for multi-span sessions */}
        {isAdmin && (session.slot_span > 1 || session.track_span > 1) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
            className="absolute top-1 left-1 p-1 rounded bg-black/20 opacity-0 group-hover:opacity-100 hover:bg-amber-500 transition-all"
            title="Unmerge cells"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
        )}

        {/* Delete button - shows on hover for admins */}
        {isAdmin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
            className="absolute top-1 right-1 p-1 rounded bg-black/20 opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
            title="Delete session"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}

        {/* Unassign paper button - shows on hover when paper assigned */}
        {onUnassignPaper && session.paper_id && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnassignPaper(session.id);
            }}
            className="absolute bottom-1 right-1 p-1 rounded bg-black/20 opacity-0 group-hover:opacity-100 hover:bg-amber-500 transition-all"
            title="Unassign paper"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
              />
            </svg>
          </button>
        )}

        {/* Resize handles - only show for admins */}
        {isAdmin && onResize && (
          <>
            {/* Bottom resize handle (vertical - slot span) */}
            <div
              onMouseDown={(e) => handleResizeStart(e, 'vertical')}
              className={`
                absolute bottom-0 left-2 right-2 h-2 cursor-ns-resize
                opacity-0 group-hover:opacity-100 hover:opacity-100
                transition-opacity
              `}
              title="Drag to change time span"
            >
              <div className="h-1 bg-white/50 rounded-full mx-auto w-12" />
            </div>

            {/* Right resize handle (horizontal - track span) - not for general events */}
            {!session.is_general_event && (
              <div
                onMouseDown={(e) => handleResizeStart(e, 'horizontal')}
                className={`
                  absolute top-2 bottom-2 right-0 w-2 cursor-ew-resize
                  opacity-0 group-hover:opacity-100 hover:opacity-100
                  transition-opacity
                `}
                title="Drag to change track span"
              >
                <div className="w-1 h-12 bg-white/50 rounded-full my-auto absolute top-1/2 -translate-y-1/2" />
              </div>
            )}

            {/* Corner resize handle (both) - not for general events */}
            {!session.is_general_event && (
              <div
                onMouseDown={(e) => handleResizeStart(e, 'both')}
                className={`
                  absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize
                  opacity-0 group-hover:opacity-100 hover:opacity-100
                  transition-opacity
                `}
                title="Drag to resize"
              >
                <svg
                  className="w-3 h-3 text-white/70 absolute bottom-0.5 right-0.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default memo(SessionCard);

// Overlay version for drag preview
export function SessionCardOverlay({ session }: { session: ProgramSession }) {
  const bgColor = session.is_general_event
    ? session.color || '#6B7280'
    : session.color || '#3B82F6';

  return (
    <div
      className="p-2 rounded-md text-white shadow-2xl opacity-90"
      style={{ backgroundColor: bgColor, minWidth: 150 }}
    >
      <h4 className="text-sm font-medium leading-tight">{session.title}</h4>
    </div>
  );
}
