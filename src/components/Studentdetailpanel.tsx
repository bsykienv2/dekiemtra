import React, { useEffect, useMemo, useState } from 'react';
import { StudentDetail, ResultDetail, AssignmentAttempt } from './types';
import { fetchStudentDetail, fetchResultDetail, getAssignmentAttempts } from './services/sheetService';
import Loading from './Loading';
import { X, Eye, ClipboardList } from 'lucide-react';

interface StudentDetailPanelProps {
  email: string;
  onClose: () => void;
}

const StudentDetailPanel: React.FC<StudentDetailPanelProps> = ({ email, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const [resultDetail, setResultDetail] = useState<ResultDetail | null>(null);
  const [resultLoading, setResultLoading] = useState(false);

  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attempts, setAttempts] = useState<AssignmentAttempt[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setDetail(null);
      setResultDetail(null);
      try {
        const d = await fetchStudentDetail(email);
        setDetail(d);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [email]);

  const loadResult = async (resultId: string) => {
    setResultLoading(true);
    try {
      const rd = await fetchResultDetail(resultId);
      setResultDetail(rd);
    } finally {
      setResultLoading(false);
    }
  };

  const loadAttempts = async () => {
    setAttemptsLoading(true);
    try {
      // Gọi với assignmentId = '' để lấy tất cả attempts của email (backend đã filter theo email)
      const list = await getAssignmentAttempts('', email);
      setAttempts(list);
    } finally {
      setAttemptsLoading(false);
    }
  };

  const user = detail?.user;

  const results = useMemo(() => detail?.results || [], [detail]);
  const violations = useMemo(() => detail?.violations || [], [detail]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Chi tiết học sinh</div>
            <div className="text-xl font-bold text-gray-800">{email}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
            <X />
          </button>
        </div>

        {loading ? (
          <div className="p-6"><Loading message="Đang tải chi tiết..." /></div>
        ) : !detail || !user ? (
          <div className="p-6 text-gray-500">Không tìm thấy học sinh.</div>
        ) : (
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: profile */}
            <div className="lg:col-span-1">
              <div className="border rounded-2xl p-4">
                <div className="font-bold text-teal-800 text-lg">{user.name}</div>
                <div className="text-sm text-gray-600 mt-1">{user.email}</div>
                <div className="text-sm text-gray-600 mt-1">Lớp: <span className="font-semibold">{user.class}</span></div>
                <div className="text-sm text-gray-600 mt-1">Tổng điểm: <span className="font-semibold">{user.totalScore}</span></div>
                <div className="text-sm text-gray-600 mt-1">Level hiện tại: <span className="font-semibold">{user.currentLevel ?? '—'}</span></div>

                <button
                  onClick={loadAttempts}
                  className="mt-4 w-full px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center justify-center gap-2"
                >
                  <ClipboardList size={18} /> Xem lịch sử làm “đề được giao”
                </button>
              </div>

              {/* Attempts */}
              <div className="mt-4 border rounded-2xl p-4">
                <div className="font-bold text-gray-800 mb-2">Attempts (Assignments)</div>
                {attemptsLoading ? (
                  <Loading message="Đang tải attempts..." />
                ) : attempts.length === 0 ? (
                  <div className="text-gray-500 text-sm">Chưa có attempt nào.</div>
                ) : (
                  <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                    {attempts.map((a) => (
                      <div key={a.attemptId} className="border rounded-2xl p-3">
                        <div className="text-xs text-gray-500">assignmentId: <span className="font-mono">{a.assignmentId}</span></div>
                        <div className="text-xs text-gray-500">started: {a.startedAt}</div>
                        <div className="text-xs text-gray-500">submitted: {a.submittedAt || '—'}</div>
                        <div className="mt-1 flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-800">{a.status}</div>
                          <div className="text-sm font-extrabold text-teal-700">{a.percentage ?? '—'}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Violations */}
              <div className="mt-4 border rounded-2xl p-4">
                <div className="font-bold text-gray-800 mb-2">Vi phạm</div>
                {violations.length === 0 ? (
                  <div className="text-gray-500 text-sm">Không có.</div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
                    {violations.map((v) => (
                      <div key={v.id} className="border rounded-2xl p-3">
                        <div className="font-semibold text-red-600">{v.type}</div>
                        <div className="text-xs text-gray-500 mt-1">{v.timestamp}</div>
                        <div className="text-xs text-gray-600 mt-1">{typeof v.details === 'string' ? v.details : JSON.stringify(v.details)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: results list */}
            <div className="lg:col-span-2">
              <div className="border rounded-2xl p-4">
                <div className="font-bold text-gray-800 mb-3">Kết quả (Results)</div>

                {results.length === 0 ? (
                  <div className="text-gray-500 text-sm">Chưa có kết quả.</div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                    {results.map((r) => (
                      <div key={r.resultId} className="border rounded-2xl p-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{r.topic}</div>
                          <div className="text-xs text-gray-500 mt-1">{r.timestamp}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Score: {r.score}/{r.totalQuestions} • {r.percentage}% • {r.submissionReason}
                          </div>
                        </div>
                        <button
                          onClick={() => loadResult(r.resultId)}
                          className="px-3 py-2 rounded-xl bg-teal-50 text-teal-800 font-semibold flex items-center gap-2"
                        >
                          <Eye size={18} /> Xem
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Result detail */}
              <div className="mt-4 border rounded-2xl p-4">
                <div className="font-bold text-gray-800 mb-2">Chi tiết bài làm</div>

                {resultLoading ? (
                  <Loading message="Đang tải chi tiết bài..." />
                ) : !resultDetail ? (
                  <div className="text-gray-500 text-sm">Chọn 1 kết quả để xem chi tiết.</div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold">{resultDetail.topic}</span> • {resultDetail.percentage}% • {resultDetail.timeSpent}s
                    </div>
                    <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                      {resultDetail.answers?.map((a: any, idx: number) => (
                        <div key={idx} className="border rounded-2xl p-3">
                          <div className="text-sm font-semibold text-gray-800">Câu {idx + 1}</div>
                          <div className="text-xs text-gray-600 mt-1">Trả lời: <span className="font-mono">{String(a.userAnswer ?? '')}</span></div>
                          <div className="text-xs text-gray-600 mt-1">Đáp án: <span className="font-mono">{String(a.answer_key ?? '')}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDetailPanel;
