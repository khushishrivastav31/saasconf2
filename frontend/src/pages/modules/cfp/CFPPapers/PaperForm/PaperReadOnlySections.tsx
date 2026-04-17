import type { Paper } from '../../../../../types';
import type { PaperAssignment } from '../../../../../types/review';
import { formatDate } from '../../../../../utils/formatDate';

interface Props {
  paper: Paper | null;
  assignments: PaperAssignment[];
}

export default function PaperReadOnlySections({ paper, assignments }: Props) {
  if (!paper) return null;

  return (
    <>
      {paper.comments.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Committee Comments
          </label>
          <div className="space-y-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            {paper.comments.map((comment) => (
              <div
                key={comment.id}
                className="bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {`${comment.committee_member_first_name} ${comment.committee_member_last_name}`.trim() ||
                      'Committee Member'}
                    {comment.committee_member_role && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-normal ml-1.5 capitalize">
                        ({comment.committee_member_role.replace('_', ' ')})
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Assigned Reviewers
          {assignments.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
              ({assignments.length})
            </span>
          )}
        </label>
        {assignments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {assignments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
              >
                {`${a.committee_member_first_name} ${a.committee_member_last_name}`.trim()}
                {a.is_anonymous && (
                  <span className="px-1 rounded text-[9px] bg-yellow-100 text-yellow-700">
                    anon
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            No reviewers assigned yet.
          </p>
        )}
      </div>
    </>
  );
}
