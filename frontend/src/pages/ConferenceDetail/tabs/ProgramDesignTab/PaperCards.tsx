import { useDraggable } from '@dnd-kit/core';
import type { Paper, ProgramSession } from '../../../../types';

// Draggable paper card component
export function DraggablePaperCard({
  paper,
  selectedSession,
  selectedSessionDuration,
  selectedSessionId,
  onAssignPaper,
  isAdmin,
}: {
  paper: Paper;
  selectedSession: ProgramSession | null;
  selectedSessionDuration: number;
  selectedSessionId: string | null;
  onAssignPaper: (paperId: string, sessionId: string) => void;
  isAdmin: boolean;
}) {
  const canDrag = isAdmin;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `paper-${paper.id}`,
    data: { type: 'paper', paper },
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  const durationWarning =
    selectedSession &&
    paper.session_type_duration &&
    paper.session_type_duration > selectedSessionDuration;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      className={`
        p-2 hover:bg-gray-50 dark:hover:bg-gray-700
        ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isDragging ? 'opacity-50 z-50' : ''}
      `}
    >
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
        {paper.title}
      </h4>

      {speakerName && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{speakerName}</p>
      )}

      {durationWarning && (
        <div className="mt-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded text-xs text-amber-700 dark:text-amber-300">
          Duration ({paper.session_type_duration} min) exceeds session ({selectedSessionDuration}{' '}
          min)
        </div>
      )}

      {isAdmin && (
        <div className="mt-1">
          {selectedSessionId ? (
            <button
              onClick={() => onAssignPaper(paper.id, selectedSessionId)}
              className="px-2 py-0.5 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700"
            >
              Assign
            </button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              Drag to a session
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Assigned paper card (non-draggable)
export function AssignedPaperCard({
  paper,
  session,
  onUnassignPaper,
}: {
  paper: Paper;
  session: ProgramSession;
  onUnassignPaper: (sessionId: string) => void;
}) {
  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  return (
    <div className="p-2 hover:bg-green-50/80 dark:hover:bg-green-900/20">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1 leading-tight">
        {paper.title}
      </h4>
      {speakerName && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{speakerName}</p>
      )}
      <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 truncate">
        {session.session_type_name || session.title}
      </p>
      <button
        onClick={() => onUnassignPaper(session.id)}
        className="mt-1 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
      >
        Unassign
      </button>
    </div>
  );
}

// Drag overlay for paper being dragged
export function PaperCardOverlay({ paper }: { paper: Paper }) {
  const speakerName = paper.main_speaker
    ? `${paper.main_speaker.first_name || ''} ${paper.main_speaker.last_name || ''}`.trim()
    : null;

  return (
    <div className="p-2 bg-white dark:bg-gray-800 border border-primary-300 rounded-md shadow-2xl opacity-90 max-w-[250px]">
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
        {paper.title}
      </h4>
      {speakerName && (
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{speakerName}</p>
      )}
      {paper.session_type_name && (
        <span className="inline-block mt-1 px-1.5 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
          {paper.session_type_name}
        </span>
      )}
    </div>
  );
}
