import type { ReviewCriterion, ReviewQuestion } from '../../../../../types';
import RichTextDisplay from '../../../../../components/common/RichTextDisplay';
import StatusBadge from '../../../../../components/common/StatusBadge';
import { EditIcon, DeleteIcon, ChevronRightIcon } from '../../../icons';

export default function CriterionCard({
  criterion,
  isExpanded,
  isAdmin,
  onToggle,
  onEdit,
  onDelete,
  onAddQuestion,
  onEditQuestion,
  onDeleteQuestion,
  onToggleActive,
  onToggleQuestionActive,
}: {
  criterion: ReviewCriterion;
  isExpanded: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: ReviewQuestion) => void;
  onDeleteQuestion: (q: ReviewQuestion) => void;
  onToggleActive: (active: boolean) => void;
  onToggleQuestionActive: (questionId: string, active: boolean) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow sm:rounded-lg overflow-hidden">
      {/* Card Header */}
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3">
          <span
            className={`text-gray-400 dark:text-gray-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
          >
            <ChevronRightIcon />
          </span>
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {criterion.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Order: {criterion.display_order} | Questions: {criterion.questions.length}
            </p>
          </div>
          <StatusBadge
            isActive={criterion.is_active}
            onClick={isAdmin ? onToggleActive : undefined}
          />
        </div>
        {isAdmin && (
          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors"
              title="Edit Criterion"
              aria-label="Edit Criterion"
            >
              <EditIcon />
            </button>
            <button
              onClick={onDelete}
              className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors"
              title="Delete Criterion"
              aria-label="Delete Criterion"
            >
              <DeleteIcon />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          {/* Description */}
          {criterion.description && (
            <div className="mb-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Description
              </h4>
              <RichTextDisplay
                content={criterion.description}
                className="text-sm text-gray-700 dark:text-gray-300"
              />
            </div>
          )}

          {/* Questions Table */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Questions
            </h4>
            {isAdmin && (
              <button
                onClick={onAddQuestion}
                className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 shadow-sm text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Add Question
              </button>
            )}
          </div>

          {criterion.questions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4 text-center">
              No questions added yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Text
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Scale
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Weight
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Comment Req
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Active
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {criterion.questions.map((question) => (
                    <tr key={question.id}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">
                        {question.text}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {question.question_type}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {question.score_scale?.name || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {question.weight}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {question.comment_requirement}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <StatusBadge
                          isActive={question.is_active}
                          onClick={
                            isAdmin
                              ? (active) => onToggleQuestionActive(question.id, active)
                              : undefined
                          }
                        />
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => onEditQuestion(question)}
                            className="text-gray-400 dark:text-gray-500 hover:text-primary-600 p-1 rounded transition-colors mr-1"
                            title="Edit Question"
                            aria-label="Edit Question"
                          >
                            <EditIcon />
                          </button>
                          <button
                            onClick={() => onDeleteQuestion(question)}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-500 p-1 rounded transition-colors"
                            title="Delete Question"
                            aria-label="Delete Question"
                          >
                            <DeleteIcon />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
