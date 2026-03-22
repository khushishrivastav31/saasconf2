/**
 * Registration Answers Panel
 *
 * Shows applicant answers to registration questions for admin viewing.
 * Displayed within the Registration Questions settings tab.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { Conference } from '../../../../types';

interface QuestionAnswer {
  id: string;
  question_id: string;
  question_text: string | null;
  answer_value: string;
  answered_at: string;
}

interface ApplicantAnswers {
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  answers: QuestionAnswer[];
  completed_at: string | null;
}

interface AnswersListResponse {
  items: ApplicantAnswers[];
  total: number;
}

interface RegistrationAnswersPanelProps {
  conference: Conference;
}

export default function RegistrationAnswersPanel({ conference }: RegistrationAnswersPanelProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: [
      ...queryKeys.conferences.detail(conference.id),
      'registration-question-answers',
      search,
      page,
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (search) params.search = search;
      const res = await api.get<AnswersListResponse>(
        `/conferences/${conference.id}/registration-question-answers`,
        { params }
      );
      return res.data;
    },
  });

  const totalPages = useMemo(() => Math.ceil((data?.total ?? 0) / pageSize), [data?.total]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const formatAnswer = (answer: QuestionAnswer) => {
    if (answer.answer_value === 'true') return 'Yes';
    if (answer.answer_value === 'false') return 'No';
    return answer.answer_value;
  };

  return (
    <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Submitted Answers
        </h4>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {data?.total ?? 0} respondent{(data?.total ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name or email..."
          className="w-full max-w-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : !data?.items.length ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
          No answers submitted yet.
        </p>
      ) : (
        <div className="space-y-4">
          {data.items.map((applicant) => (
            <div
              key={applicant.applicant_id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {applicant.applicant_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {applicant.applicant_email}
                  </p>
                </div>
                {applicant.completed_at && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDate(applicant.completed_at)}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {applicant.answers.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400 min-w-0 flex-shrink-0">
                      {a.question_text || 'Deleted question'}:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatAnswer(a)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
