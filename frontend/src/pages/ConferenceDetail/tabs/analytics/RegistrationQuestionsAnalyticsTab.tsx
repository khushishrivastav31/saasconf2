/**
 * Registration Questions Analytics Tab
 *
 * Shows statistics, CSV export, and individual responses for registration question answers.
 */
import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import { useToast } from '../../../../components/Toast';
import { parseApiError } from '../../../../utils/apiError';
import RegistrationAnswersPanel from '../settings/RegistrationAnswersPanel';
import type { Conference } from '../../../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OptionStat {
  label: string;
  count: number;
  percentage: number;
}

interface TextAnswer {
  applicant_name: string;
  answer_value: string;
}

interface QuestionStat {
  question_id: string;
  question_text: string;
  question_type: 'checkbox' | 'text' | 'radio' | 'dropdown';
  total_answers: number;
  option_stats?: OptionStat[];
  text_answers?: TextAnswer[];
}

interface StatsResponse {
  total_respondents: number;
  questions: QuestionStat[];
}

interface RegistrationQuestionsAnalyticsTabProps {
  conference: Conference;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  radio: 'Radio',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  text: 'Text',
};

const TYPE_COLORS: Record<string, string> = {
  radio: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  dropdown: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  checkbox: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  text: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

function QuestionStatCard({ question }: { question: QuestionStat }) {
  const [textExpanded, setTextExpanded] = useState(false);
  const hasOptions =
    question.question_type === 'radio' ||
    question.question_type === 'dropdown' ||
    question.question_type === 'checkbox';
  const hasText = question.question_type === 'text';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1 mr-2">
          {question.question_text}
        </h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full ${TYPE_COLORS[question.question_type] ?? TYPE_COLORS.text}`}
          >
            {TYPE_LABELS[question.question_type] ?? question.question_type}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {question.total_answers} answer{question.total_answers !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Option-based stats (radio, dropdown, checkbox) */}
      {hasOptions && question.option_stats && (
        <div className="space-y-2">
          {question.option_stats.map((opt) => (
            <div key={opt.label} className="flex items-center gap-3">
              <span
                className="text-sm text-gray-700 dark:text-gray-300 min-w-35 w-2/5 shrink-0"
                title={opt.label}
              >
                {opt.label}
              </span>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                <div
                  className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(opt.percentage, 1)}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right flex-shrink-0">
                {opt.count} ({opt.percentage.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Text answers — collapsible list */}
      {hasText && question.text_answers && (
        <div>
          <button
            type="button"
            onClick={() => setTextExpanded((prev) => !prev)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-2"
          >
            {textExpanded
              ? 'Hide answers'
              : `Show ${question.text_answers.length} answer${question.text_answers.length !== 1 ? 's' : ''}`}
          </button>
          {textExpanded && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {question.text_answers.map((ta, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {ta.applicant_name}:
                  </span>
                  <span className="text-gray-900 dark:text-gray-100">{ta.answer_value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RegistrationQuestionsAnalyticsTab({
  conference,
  isAdmin,
}: RegistrationQuestionsAnalyticsTabProps) {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  // Stats query
  const statsKey = useMemo(
    () => [
      ...queryKeys.conferences.detail(conference.id),
      'registration-question-answers',
      'stats',
    ],
    [conference.id]
  );

  const {
    data: stats,
    isLoading,
    isError,
  } = useQuery({
    queryKey: statsKey,
    queryFn: async () => {
      const res = await api.get<StatsResponse>(
        `/conferences/${conference.id}/registration-question-answers/stats`
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  // CSV export handler
  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await api.get(
        `/conferences/${conference.id}/registration-question-answers/export`,
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `registration-questions-${conference.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(parseApiError(err, 'Failed to export CSV'), 'error');
    } finally {
      setIsExporting(false);
    }
  }, [conference.id, showToast]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400">Failed to load analytics data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Registration Questions Analytics
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            View statistics and responses for registration questions.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Total respondents */}
      {stats && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Respondents</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {stats.total_respondents}
          </p>
        </div>
      )}

      {/* Question statistics */}
      {stats && stats.questions.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Question Statistics
          </h4>
          {stats.questions.map((q) => (
            <QuestionStatCard key={q.question_id} question={q} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <p className="text-sm">No question data available yet.</p>
          <p className="text-xs mt-1">Statistics will appear once attendees submit answers.</p>
        </div>
      )}

      {/* Individual Responses */}
      <RegistrationAnswersPanel conference={conference} />
    </div>
  );
}
