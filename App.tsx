// ============================================================================
// LMS THẦY PHÚC - MAIN APP (STABLE + LMS ASSIGNMENTS)
// - Giữ luồng cũ: Login/Chuyên đề/Thi/Lý thuyết/LeaderBoard/Anti-cheat/AI Tutor
// - Bổ sung LMS: "Đề được giao" (Assignments) + Start Attempt + Submit kèm assignmentId/attemptId
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ViewState, User, Question, QuizState, Theory, ChatMessage, TutorContext, QuizResult, LeaderboardEntry } from './types';
import {
  loginUser,
  logoutUser,
  fetchQuestions,
  fetchTopics,
  fetchTheory,
  fetchLeaderboard,
  fetchUserProgress,
  submitQuiz,
  sendHeartbeat,
  reportViolation,
  getSession,
  clearSession,
  GOOGLE_SCRIPT_URL,
  fetchExamByLink
} from './services/sheetService';
import { askAITutor, incrementHintLevel, resetAllHints } from './services/geminiService';
import MathText from './components/MathText';
import QuestionImage from './components/QuestionImage';
import { AdminPanel } from './components/AdminPanel';
import Loading from './components/Loading'; 
import { BookOpen, Award, LogOut, User as UserIcon, Send, CheckCircle, XCircle, Trophy, BrainCircuit, Loader2, Lock, AlertTriangle, Monitor, Eye, EyeOff, ChevronRight, ChevronLeft, Lightbulb, RefreshCw, Star, Target, ArrowRight, ShieldAlert, BookMarked, Settings, RotateCcw, List, AlertCircle, Zap, Medal } from 'lucide-react';

type DashboardTab = 'assigned' | 'topics';

type AssignedExam = {
  assignmentId: string;
  examId: string;
  examTitle: string;
  grade: number | string;
  className: string;
  assignedBy?: string;
  openAt?: string;
  dueAt?: string;
  durationMinutes?: number;
  maxAttempts?: number;
  state?: 'OPEN' | 'UPCOMING' | 'CLOSED';
  attemptsUsed?: number;
  bestPercentage?: number | string;
  lastSubmittedAt?: string;
};

type ActiveAttempt = {
  assignmentId: string;
  attemptId: string;
  examId: string;
  startedAt: string;
  durationMinutes?: number;
  maxAttempts?: number;
  examTitle?: string;
};

const App: React.FC = () => {
  // ==================== CORE STATE ====================
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>(ViewState.LOGIN);
  const [sessionToken, setSessionToken] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==================== LOGIN UI STATE ====================
  const [loginMode, setLoginMode] = useState<'account' | 'instant'>('account');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Instant exam
  const [instantExamId, setInstantExamId] = useState('');
  const [isExamLoading, setIsExamLoading] = useState(false);
  const [examLoadError, setExamLoadError] = useState<string | null>(null);

  // ==================== STUDY / QUIZ STATE ====================
  const [selectedGrade, setSelectedGrade] = useState<number>(6);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [currentLevel, setCurrentLevel] = useState<number>(1);

  const [theory, setTheory] = useState<Theory | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  const [quizState, setQuizState] = useState<QuizState>({
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: [],
    startTime: Date.now(),
    tabSwitchCount: 0,
    isComplete: false,
    score: 0,
    submissionReason: 'normal'
  });

  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // ==================== LEADERBOARD ====================
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // ==================== CHAT / AI TUTOR ====================
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatThinking, setChatThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ==================== LMS ASSIGNMENTS ====================
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('topics');
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<ActiveAttempt | null>(null);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);

  // ==================== HELPERS ====================
  const formatDateTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('vi-VN');
    } catch {
      return iso;
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const scrollChatToBottom = () => {
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  // ==================== GAS DIRECT CALL (FOR LMS ACTIONS) ====================
  const callGAS = useCallback(async <T,>(action: string, payload: any): Promise<T> => {
    if (!GOOGLE_SCRIPT_URL) throw new Error('Thiếu GOOGLE_SCRIPT_URL');
    const params = new URLSearchParams({
      action,
      payload: JSON.stringify(payload ?? {})
    });
    const url = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.error || json.message || 'API error');
    return json.data as T;
  }, []);

  const loadAssignedExams = useCallback(async () => {
    if (!user) return;
    setAssignedLoading(true);
    try {
      const data = await callGAS<AssignedExam[]>('getAssignedExamsForStudent', { email: user.email, sessionToken });
      setAssignedExams(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // Không chặn app nếu LMS lỗi
      console.error(e);
    } finally {
      setAssignedLoading(false);
    }
  }, [user, sessionToken, callGAS]);

  // ==================== URL PARAMS: examId / assignmentId ====================
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const examId = searchParams.get('examId') || null;
    const assignmentId = searchParams.get('assignmentId') || null;

    if (assignmentId) {
      setPendingAssignmentId(assignmentId);
      // Nếu chưa login, đưa về LOGIN và chọn tab account
      setLoginMode('account');
      setView(ViewState.LOGIN);
    }

    if (examId) {
      handleLoadInstantExam(examId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== AUTO RESTORE SESSION ====================
  useEffect(() => {
    const session = getSession();
    if (!session) return;

    // restore
    setUser(session.user);
    setSessionToken(session.sessionToken);
    setSelectedGrade(Number((session.user as any)?.grade || 6) || 6);
    setView(ViewState.DASHBOARD);
    setDashboardTab('topics');

    // load initial
    (async () => {
      try {
        const t = await fetchTopics(selectedGrade);
        setTopics(t);
      } catch {}
    })();

    // Load assignments for student
    if (session.user?.role === 'student' || !session.user?.role) {
      setDashboardTab('assigned');
      loadAssignedExams();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== HEARTBEAT ====================
  useEffect(() => {
    if (!user || !sessionToken) return;
    const id = window.setInterval(() => {
      sendHeartbeat();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [user, sessionToken]);

  // ==================== QUIZ TIMER ====================
  useEffect(() => {
    if (view !== ViewState.QUIZ || quizState.isComplete) return;

    const id = window.setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - quizState.startTime) / 1000));
    }, 1000);

    return () => window.clearInterval(id);
  }, [view, quizState.startTime, quizState.isComplete]);

  // ==================== ANTI-CHEAT (TAB SWITCH / VISIBILITY) ====================
  useEffect(() => {
    if (view !== ViewState.QUIZ || quizState.isComplete) return;

    const onVisibility = () => {
      if (document.hidden) {
        setQuizState(prev => ({ ...prev, tabSwitchCount: prev.tabSwitchCount + 1 }));
        if (user && sessionToken) {
          reportViolation(
            user.email,
            'cheat_tab',
            { hidden: true, at: Date.now() },
            { topic: selectedTopic, grade: selectedGrade, level: currentLevel, qIndex: quizState.currentQuestionIndex }
          );
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [view, quizState.isComplete]);

  // Auto submit on too many tab switches (optional threshold)
  useEffect(() => {
    if (view !== ViewState.QUIZ || quizState.isComplete) return;
    if (quizState.tabSwitchCount >= 3) {
      handleFinishQuiz('cheat_tab');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizState.tabSwitchCount, view, quizState.isComplete]);

  // ==================== LOAD TOPICS WHEN GRADE CHANGES ====================
  useEffect(() => {
    if (view === ViewState.LOGIN) return;
    (async () => {
      try {
        const t = await fetchTopics(selectedGrade);
        setTopics(t);
      } catch (e) {
        // ignore
      }
    })();
  }, [selectedGrade, view]);

  // ==================== AUTO START ASSIGNMENT IF URL HAS assignmentId ====================
  useEffect(() => {
    if (!pendingAssignmentId) return;
    if (!user) return; // wait login
    // Only students
    if (user.role && user.role !== 'student') return;

    (async () => {
      try {
        await startAssignmentAttempt(pendingAssignmentId);
      } catch {}
      finally {
        setPendingAssignmentId(null);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAssignmentId, user]);

  // ==================== AUTH HANDLERS ====================
  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const session = await loginUser(emailInput, passwordInput);
      if (!session) {
        setError('Đăng nhập thất bại. Kiểm tra email/mật khẩu.');
        return;
      }
      setUser(session.user);
      setSessionToken(session.sessionToken);
      setView(ViewState.DASHBOARD);

      // initial data
      try {
        const t = await fetchTopics(selectedGrade);
        setTopics(t);
      } catch {}

      // dashboard default
      if (session.user?.role === 'teacher' || session.user?.role === 'admin') {
        setDashboardTab('topics');
      } else {
        setDashboardTab('assigned');
        loadAssignedExams();
      }
    } catch (e: any) {
      setError(e?.message || 'Lỗi đăng nhập');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await logoutUser();
    } catch {}
    clearSession();
    setUser(null);
    setSessionToken('');
    setView(ViewState.LOGIN);
    setQuizResult(null);
    setTheory(null);
    setQuizState({
      questions: [],
      currentQuestionIndex: 0,
      userAnswers: [],
      startTime: Date.now(),
      tabSwitchCount: 0,
      isComplete: false,
      score: 0,
      submissionReason: 'normal'
    });
    setAssignedExams([]);
    setActiveAttempt(null);
    setDashboardTab('topics');
    setLoading(false);
  };

  // ==================== INSTANT EXAM ====================
  const handleLoadInstantExam = async (examId: string) => {
    if (!examId?.trim()) return;
    setIsExamLoading(true);
    setExamLoadError(null);
    try {
      const examData: any = await fetchExamByLink(examId.trim());
      if (!examData || !Array.isArray(examData.questions)) {
        setExamLoadError('Không tìm thấy đề thi. Kiểm tra mã đề hoặc backend.');
        return;
      }

      setSelectedTopic(examData.title || 'Đề thi');
      setSelectedGrade(Number(examData.grade || 6));
      setCurrentLevel(1);
      setActiveAttempt(null);

      const qs: Question[] = examData.questions;
      setQuizState({
        questions: qs,
        currentQuestionIndex: 0,
        userAnswers: new Array(qs.length).fill(null),
        startTime: Date.now(),
        tabSwitchCount: 0,
        isComplete: false,
        score: 0,
        submissionReason: 'normal'
      });
      setElapsedTime(0);
      resetAllHints();
      setChatMessages([{ id: 'sys', role: 'assistant', content: 'Bạn đang làm đề thi. Nếu cần, hãy hỏi trợ lý AI!', timestamp: Date.now() }]);
      setView(ViewState.QUIZ);

      // cleanup URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
      console.error(e);
      setExamLoadError('Lỗi kết nối khi tải đề thi. Vui lòng thử lại.');
    } finally {
      setIsExamLoading(false);
    }
  };

  // ==================== LMS: START ATTEMPT ====================
  const startAssignmentAttempt = async (assignmentId: string) => {
    if (!user) throw new Error('Chưa đăng nhập');
    setLoading(true);
    setError(null);
    try {
      const data: any = await callGAS<any>('startAssignmentAttempt', { assignmentId, email: user.email, sessionToken });
      const examData = data?.exam;
      if (!examData || !Array.isArray(examData.questions)) {
        throw new Error('Không tải được đề (exam JSON trống)');
      }

      const attempt: ActiveAttempt = {
        assignmentId: data.assignmentId || assignmentId,
        attemptId: data.attemptId,
        examId: data.examId || examData.examId || '',
        startedAt: data.startedAt,
        durationMinutes: data.assignment?.durationMinutes || data.assignment?.duration_minutes || data.durationMinutes,
        maxAttempts: data.assignment?.maxAttempts || data.assignment?.max_attempts,
        examTitle: data.assignment?.examTitle || examData.title
      };
      setActiveAttempt(attempt);

      setSelectedTopic(examData.title || attempt.examTitle || 'Đề được giao');
      setSelectedGrade(Number(examData.grade || selectedGrade));
      setCurrentLevel(1);

      const qs: Question[] = examData.questions;
      setQuizState({
        questions: qs,
        currentQuestionIndex: 0,
        userAnswers: new Array(qs.length).fill(null),
        startTime: Date.now(),
        tabSwitchCount: 0,
        isComplete: false,
        score: 0,
        submissionReason: 'normal'
      });
      setElapsedTime(0);
      resetAllHints();
      setChatMessages([{ id: 'sys', role: 'assistant', content: 'Bạn đang làm đề được giao. Chúc bạn làm bài tốt!', timestamp: Date.now() }]);
      setView(ViewState.QUIZ);

      // refresh assigned list after starting (to update attempts used)
      loadAssignedExams();
    } finally {
      setLoading(false);
    }
  };

  // ==================== TOPIC FLOW ====================
  const handleSelectTopic = async (topic: string) => {
    setSelectedTopic(topic);
    setError(null);
    setLoading(true);
    try {
      const th = await fetchTheory(selectedGrade, topic, 1);
      setTheory(th || null);
      // progress
      if (user) {
        try { await fetchUserProgress(user.email); } catch {}
      }
      setView(ViewState.TOPIC_SELECT);
    } catch (e: any) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuiz = async (level: number) => {
    setError(null);
    setLoading(true);
    try {
      setCurrentLevel(level);
      setActiveAttempt(null);

      const questions = await fetchQuestions(selectedGrade, selectedTopic, level);
      if (!questions || questions.length === 0) {
        setError('Chưa có câu hỏi cho chuyên đề này.');
        return;
      }
      setQuizState({
        questions,
        currentQuestionIndex: 0,
        userAnswers: new Array(questions.length).fill(null),
        startTime: Date.now(),
        tabSwitchCount: 0,
        isComplete: false,
        score: 0,
        submissionReason: 'normal'
      });
      setElapsedTime(0);
      resetAllHints();
      setChatMessages([{ id: 'sys', role: 'assistant', content: 'Bắt đầu làm bài. Bạn có thể hỏi trợ lý AI bất cứ lúc nào.', timestamp: Date.now() }]);
      setView(ViewState.QUIZ);
    } catch (e: any) {
      setError(e?.message || 'Không tải được câu hỏi');
    } finally {
      setLoading(false);
    }
  };

  // ==================== QUIZ ANSWERS ====================
  const currentQ = quizState.questions[quizState.currentQuestionIndex];

  const setAnswerForCurrent = (value: string) => {
    setQuizState(prev => {
      const next = [...prev.userAnswers];
      next[prev.currentQuestionIndex] = value;
      return { ...prev, userAnswers: next };
    });
  };

  const handleSelectChoice = (choice: 'A'|'B'|'C'|'D') => setAnswerForCurrent(choice);

  const handleTrueFalseUpdate = (subPart: 'A'|'B'|'C'|'D', value: 'Đ'|'S') => {
    const idxMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const idx = idxMap[subPart];
    const current = String(quizState.userAnswers[quizState.currentQuestionIndex] || '?-?-?-?').replace(/\s/g,'');
    const parts = current.split('-');
    while (parts.length < 4) parts.push('?');
    parts[idx] = value;
    setAnswerForCurrent(parts.join('-'));
  };

  const handleShortAnswerChange = (value: string) => setAnswerForCurrent(value);

  const handleNextQuestion = () => {
    setQuizState(prev => {
      if (prev.currentQuestionIndex >= prev.questions.length - 1) return prev;
      return { ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 };
    });
  };

  const handlePrevQuestion = () => {
    setQuizState(prev => {
      if (prev.currentQuestionIndex <= 0) return prev;
      return { ...prev, currentQuestionIndex: prev.currentQuestionIndex - 1 };
    });
  };

  // ==================== SUBMIT QUIZ ====================
  const handleFinishQuiz = async (reason: QuizState['submissionReason'] = 'normal') => {
    if (quizState.isComplete || quizState.questions.length === 0) return;

    // compute score
    let correctCount = 0;
    const answers = quizState.questions.map((q, idx) => {
      const userAns = String(quizState.userAnswers[idx] ?? '');
      let isCorrect = false;
      if (q.question_type === 'Trắc nghiệm') isCorrect = userAns === q.answer_key;
      else if (q.question_type === 'Đúng/Sai') isCorrect = userAns === q.answer_key;
      else if (q.question_type === 'Trả lời ngắn') isCorrect = userAns.trim().toLowerCase() === String(q.answer_key || '').trim().toLowerCase();
      if (isCorrect) correctCount++;
      return { questionId: q.exam_id, userAnswer: userAns, correct: isCorrect };
    });

    setQuizState(prev => ({ ...prev, isComplete: true, score: correctCount, endTime: Date.now(), submissionReason: reason }));

    // send to backend if logged in; else local result
    if (user) {
      try {
        const payload: any = {
          email: user.email,
          sessionToken,
          topic: selectedTopic,
          grade: selectedGrade,
          level: currentLevel,
          score: correctCount,
          totalQuestions: quizState.questions.length,
          answers,
          timeSpent: elapsedTime,
          submissionReason: reason,
          violations: reason !== 'normal' ? [{ type: reason, timestamp: Date.now() }] : []
        };

        // LMS extra
        if (activeAttempt) {
          payload.assignmentId = activeAttempt.assignmentId;
          payload.attemptId = activeAttempt.attemptId;
          payload.examId = activeAttempt.examId;
          payload.startedAt = activeAttempt.startedAt;
        }

        const result = await submitQuiz(payload);
        if (result) {
          setQuizResult(result);
          if (result.theory) setTheory(result.theory);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      const pct = Math.round((correctCount / quizState.questions.length) * 100);
      setQuizResult({
        email: 'guest',
        topic: selectedTopic,
        grade: selectedGrade,
        level: 1,
        score: correctCount,
        totalQuestions: quizState.questions.length,
        percentage: pct,
        passed: pct >= 80,
        canAdvance: false,
        timeSpent: elapsedTime,
        submissionReason: reason,
        message: 'Kết quả bài thi thử',
        answers,
        timestamp: new Date().toISOString()
      });
    }

    // refresh assigned list after submit
    if (activeAttempt) {
      loadAssignedExams();
    }

    setView(ViewState.RESULT);
  };

  // ==================== LEADERBOARD ====================
  const handleOpenLeaderboard = async () => {
    setLeaderboardLoading(true);
    setError(null);
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data || []);
      setView(ViewState.LEADERBOARD);
    } catch (e: any) {
      setError(e?.message || 'Không tải được bảng xếp hạng');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // ==================== AI TUTOR CHAT ====================
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatThinking) return;
    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatThinking(true);
    scrollChatToBottom();

    try {
      const context: TutorContext = {
        grade: selectedGrade,
        topic: selectedTopic,
        level: currentLevel,
        question: currentQ ? currentQ.question : '',
        questionType: currentQ ? currentQ.question_type : 'Trắc nghiệm',
        userAnswer: currentQ ? String(quizState.userAnswers[quizState.currentQuestionIndex] ?? '') : '',
        correctAnswer: currentQ ? currentQ.answer_key : ''
      };

      const reply = await askAITutor(chatMessages, userMessage.content, context);
      const aiMessage: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: reply, timestamp: Date.now() };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (e) {
      const aiMessage: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Mình gặp lỗi khi trả lời. Bạn thử lại nhé.', timestamp: Date.now() };
      setChatMessages(prev => [...prev, aiMessage]);
    } finally {
      setChatThinking(false);
      scrollChatToBottom();
    }
  };

  // ==================== RENDER HELPERS ====================
  const renderQuestionContent = (q: Question) => {
    return (
      <div className="space-y-4">
        <div className="text-gray-900 text-lg leading-relaxed">
          <MathText content={q.question || ''} />
        </div>
        {(q as any).image_id && (
          <QuestionImage imageId={(q as any).image_id} alt={`Câu ${quizState.currentQuestionIndex + 1}`} />
        )}
      </div>
    );
  };

  const renderQuizQuestion = () => {
    if (!currentQ) return null;

    const selectedAnswer = quizState.userAnswers[quizState.currentQuestionIndex] ?? '';

    if (currentQ.question_type === 'Trắc nghiệm') {
      const opts = [
        { key: 'A' as const, text: currentQ.option_A },
        { key: 'B' as const, text: currentQ.option_B },
        { key: 'C' as const, text: currentQ.option_C },
        { key: 'D' as const, text: currentQ.option_D },
      ];

      return (
        <div className="space-y-3">
          {opts.map(o => {
            const active = selectedAnswer === o.key;
            return (
              <button
                key={o.key}
                onClick={() => handleSelectChoice(o.key)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  active ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex gap-3 items-start">
                  <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center font-black ${
                    active ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>{o.key}</div>
                  <div className="flex-1 text-gray-900">
                    <MathText content={o.text || ''} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (currentQ.question_type === 'Đúng/Sai') {
      const parts = ['A','B','C','D'] as const;
      const userParts = String(selectedAnswer || '?-?-?-?').split('-');
      while (userParts.length < 4) userParts.push('?');

      const getText = (k: typeof parts[number]) => {
        const map: any = { A: 'option_A', B: 'option_B', C: 'option_C', D: 'option_D' };
        return (currentQ as any)[map[k]] as string;
      };

      return (
        <div className="space-y-3">
          {parts.map((p, idx) => (
            <div key={p} className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row items-center gap-4">
              <div className="font-bold text-teal-700 w-10">{p})</div>
              <div className="flex-1 text-gray-900">
                <MathText content={getText(p) || ''} />
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleTrueFalseUpdate(p, 'Đ')}
                  className={`px-4 py-2 rounded-xl font-bold border ${userParts[idx] === 'Đ' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  Đúng
                </button>
                <button
                  onClick={() => handleTrueFalseUpdate(p, 'S')}
                  className={`px-4 py-2 rounded-xl font-bold border ${userParts[idx] === 'S' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
                >
                  Sai
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Trả lời ngắn
    return (
      <div className="bg-white p-6 rounded-2xl border border-gray-200">
        <p className="mb-2 text-sm text-gray-500 font-semibold">Nhập đáp số của bạn:</p>
        <input
          type="text"
          value={String(selectedAnswer || '')}
          onChange={(e) => handleShortAnswerChange(e.target.value)}
          className="w-full p-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none font-mono text-gray-900"
          placeholder="Ví dụ: 12,5"
        />
      </div>
    );
  };

  const renderChatWidget = () => (
    <div className="fixed bottom-6 right-6 w-[95vw] max-w-md bg-white border border-gray-200 rounded-3xl shadow-2xl overflow-hidden z-50">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
        <div className="font-black flex items-center gap-2"><BrainCircuit size={18}/> Trợ lý AI</div>
        <button onClick={() => setChatOpen(false)} className="p-2 hover:bg-white/10 rounded-xl"><XCircle size={18}/></button>
      </div>
      <div ref={chatScrollRef} className="h-80 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {chatMessages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
              m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
            }`}>
              <MathText content={m.content} />
            </div>
          </div>
        ))}
        {chatThinking && (
          <div className="flex justify-start">
            <div className="max-w-[85%] p-3 rounded-2xl text-sm bg-white border border-gray-200 text-gray-700 flex items-center gap-2">
              <Loader2 className="animate-spin" size={16}/> Đang suy nghĩ...
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-gray-200 bg-white">
        <div className="flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
            className="flex-1 px-4 py-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
            placeholder="Hỏi trợ lý..."
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim() || chatThinking}
            className="px-4 py-3 rounded-2xl font-black bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Send size={18}/>
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== VIEWS ====================
  const renderLogin = () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-50 p-4">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
        <div className="p-8 bg-gradient-to-r from-teal-600 to-emerald-600 text-white">
          <div className="text-3xl font-black flex items-center gap-3"><BookOpen size={28}/> LMS Thầy Phúc</div>
          <div className="text-white/90 mt-2 font-semibold">Học & Thi Toán • Giao đề cho lớp • Chống gian lận</div>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-6">
            <button
              className={`flex-1 py-3 rounded-2xl font-black border ${loginMode === 'account' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-white border-gray-200 text-gray-600'}`}
              onClick={() => setLoginMode('account')}
            >
              Đăng nhập
            </button>
            <button
              className={`flex-1 py-3 rounded-2xl font-black border ${loginMode === 'instant' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-white border-gray-200 text-gray-600'}`}
              onClick={() => setLoginMode('instant')}
            >
              Vào đề (mã)
            </button>
          </div>

          {pendingAssignmentId && (
            <div className="mb-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 flex gap-2">
              <AlertTriangle size={18}/>
              <div className="font-semibold">
                Bạn đang mở <b>đề được giao</b>. Vui lòng đăng nhập để vào làm bài.
              </div>
            </div>
          )}

          {loginMode === 'account' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Email</label>
                <input
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="mt-2 w-full px-4 py-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
                  placeholder="email@school.vn"
                />
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Mật khẩu</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type={passwordVisible ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="flex-1 px-4 py-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    onClick={() => setPasswordVisible(v => !v)}
                    className="p-3 rounded-2xl border border-gray-200 hover:bg-gray-50"
                    aria-label="toggle password"
                  >
                    {passwordVisible ? <EyeOff size={18}/> : <Eye size={18}/>}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex gap-2">
                  <AlertCircle size={18}/> <div className="font-semibold">{error}</div>
                </div>
              )}

              <button
                onClick={handleLogin}
                disabled={loading || !emailInput.trim() || !passwordInput.trim()}
                className="w-full py-4 rounded-2xl font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={18}/> : <Lock size={18}/>}
                Đăng nhập
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Mã đề</label>
                <input
                  value={instantExamId}
                  onChange={(e) => setInstantExamId(e.target.value)}
                  className="mt-2 w-full px-4 py-3 rounded-2xl border border-gray-300 focus:ring-2 focus:ring-teal-200 outline-none"
                  placeholder="Ví dụ: E_abc123..."
                />
              </div>

              {examLoadError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex gap-2">
                  <AlertCircle size={18}/> <div className="font-semibold">{examLoadError}</div>
                </div>
              )}

              <button
                onClick={() => handleLoadInstantExam(instantExamId)}
                disabled={isExamLoading || !instantExamId.trim()}
                className="w-full py-4 rounded-2xl font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isExamLoading ? <Loader2 className="animate-spin" size={18}/> : <ArrowRight size={18}/>}
                Vào làm bài
              </button>

              <div className="text-xs text-gray-500">
                * Chế độ này dành cho “đề theo mã” (không cần đăng nhập). Đề được giao theo lớp thì cần đăng nhập.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black">
              {user?.name?.slice(0,1)?.toUpperCase() || 'P'}
            </div>
            <div>
              <div className="font-black text-slate-900">{user?.name || 'Học sinh'}</div>
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <span className="font-semibold">{user?.class || ''}</span>
                {user?.role && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">{user.role}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenLeaderboard}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-2"
            >
              <Trophy size={18}/> BXH
            </button>
            {(user?.role === 'teacher' || user?.role === 'admin') && (
              <button
                onClick={() => setView(ViewState.ADMIN_PANEL)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 font-black flex items-center gap-2"
              >
                <Settings size={18}/> Quản trị
              </button>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-black flex items-center gap-2"
            >
              <LogOut size={18}/> Thoát
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        {(user?.role === 'student' || !user?.role) && (
          <div className="bg-white p-2 rounded-2xl border border-slate-200 inline-flex gap-2">
            <button
              onClick={() => { setDashboardTab('assigned'); loadAssignedExams(); }}
              className={`px-5 py-3 rounded-2xl font-black flex items-center gap-2 ${dashboardTab === 'assigned' ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <List size={18}/> Đề được giao
            </button>
            <button
              onClick={() => setDashboardTab('topics')}
              className={`px-5 py-3 rounded-2xl font-black flex items-center gap-2 ${dashboardTab === 'topics' ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <BookMarked size={18}/> Chuyên đề
            </button>
          </div>
        )}

        {/* Assigned Exams */}
        {dashboardTab === 'assigned' && (user?.role === 'student' || !user?.role) && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <ShieldAlert size={22} className="text-teal-600"/> Danh sách đề được giao
              </div>
              <button
                onClick={loadAssignedExams}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-2"
              >
                <RefreshCw size={18}/> Tải lại
              </button>
            </div>

            {assignedLoading ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <Loader2 className="animate-spin" size={18}/> Đang tải...
              </div>
            ) : assignedExams.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600">
                Chưa có đề nào được giao cho lớp của bạn.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedExams.map((a) => {
                  const state = a.state || 'OPEN';
                  const stateBadge =
                    state === 'OPEN'
                      ? <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black">ĐANG MỞ</span>
                      : state === 'UPCOMING'
                      ? <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-black">SẮP MỞ</span>
                      : <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-black">ĐÃ ĐÓNG</span>;

                  const canStart = state === 'OPEN';

                  return (
                    <div key={a.assignmentId} className="p-5 rounded-3xl border border-slate-200 hover:shadow-md transition-all bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-slate-900 text-lg truncate">{a.examTitle || 'Đề được giao'}</div>
                          <div className="mt-1 text-xs text-slate-500 truncate">Mã giao: {a.assignmentId}</div>
                        </div>
                        {stateBadge}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-black text-slate-500 uppercase">Mở</div>
                          <div className="font-semibold text-slate-800">{a.openAt ? formatDateTime(a.openAt) : '-'}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-black text-slate-500 uppercase">Đóng</div>
                          <div className="font-semibold text-slate-800">{a.dueAt ? formatDateTime(a.dueAt) : '-'}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-black text-slate-500 uppercase">Thời lượng</div>
                          <div className="font-semibold text-slate-800">{a.durationMinutes ? `${a.durationMinutes} phút` : '-'}</div>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                          <div className="text-xs font-black text-slate-500 uppercase">Lần làm</div>
                          <div className="font-semibold text-slate-800">{(a.attemptsUsed ?? 0)}/{a.maxAttempts ?? 1}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                          {a.bestPercentage !== undefined && a.bestPercentage !== '' ? (
                            <span className="font-bold">Điểm tốt nhất: {a.bestPercentage}%</span>
                          ) : (
                            <span className="font-semibold">Chưa làm</span>
                          )}
                        </div>
                        <button
                          onClick={() => startAssignmentAttempt(a.assignmentId)}
                          disabled={!canStart}
                          className={`px-5 py-3 rounded-2xl font-black text-white flex items-center gap-2 ${
                            canStart ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-300 cursor-not-allowed'
                          }`}
                        >
                          <ArrowRight size={18}/> Vào làm bài
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Topics */}
        {(dashboardTab === 'topics' || user?.role === 'teacher' || user?.role === 'admin') && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <BookMarked size={22} className="text-teal-600"/> Chuyên đề
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(Number(e.target.value))}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700"
                >
                  {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Lớp {g}</option>)}
                </select>
              </div>
            </div>

            {topics.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600">
                Chưa có chuyên đề.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {topics.map(t => (
                  <button
                    key={t}
                    onClick={() => handleSelectTopic(t)}
                    className="p-5 rounded-3xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition-all text-left"
                  >
                    <div className="font-black text-slate-900">{t}</div>
                    <div className="text-sm text-slate-600 mt-1">Bấm để xem lý thuyết & chọn mức độ</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Chat Button */}
      {view !== ViewState.QUIZ && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 p-4 rounded-3xl bg-slate-900 text-white shadow-xl hover:bg-slate-800 flex items-center gap-2 z-40"
        >
          <BrainCircuit size={20}/>
          <span className="font-semibold hidden md:inline">Hỏi Trợ Lý AI</span>
        </button>
      )}
      {chatOpen && view !== ViewState.QUIZ && renderChatWidget()}
    </div>
  );

  const renderTopicSelect = () => (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setView(ViewState.DASHBOARD)}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-2"
          >
            <ChevronLeft size={18}/> Quay lại
          </button>
          <div className="font-black text-slate-900 text-lg">{selectedTopic}</div>
          <div />
        </div>

        {theory && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm mb-6">
            <div className="text-2xl font-black text-slate-900 mb-3">{theory.title || 'Lý thuyết'}</div>
            <div className="prose max-w-none">
              <MathText content={theory.content || ''} />
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2"><Target size={20} className="text-teal-600"/> Chọn mức độ</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[1,2,3,4,5].map(lv => (
              <button
                key={lv}
                onClick={() => handleStartQuiz(lv)}
                className="py-4 rounded-2xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50 font-black text-slate-800"
              >
                Level {lv}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4">
        {activeAttempt && (
          <div className="mb-4 p-4 rounded-2xl border border-teal-200 bg-teal-50 text-teal-800 flex items-center justify-between">
            <div className="font-black flex items-center gap-2"><ShieldAlert size={18}/> Đề được giao</div>
            <div className="text-sm font-bold">
              {activeAttempt.durationMinutes ? `⏱ ${activeAttempt.durationMinutes} phút` : ''}
            </div>
          </div>
        )}

        {/* Top Bar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm mb-4 flex justify-between items-center sticky top-4 z-10 border-l-4 border-teal-500">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Chuyên đề</p>
              <p className="text-lg font-black text-gray-900">{selectedTopic}</p>
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Mức</p>
              <p className="text-lg font-bold text-gray-700">{currentLevel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 font-mono text-sm">
              {formatTime(elapsedTime)}
            </div>
            <button
              onClick={() => setChatOpen(true)}
              className="p-3 rounded-xl border border-gray-200 hover:bg-gray-50"
              title="Hỏi trợ lý AI"
            >
              <BrainCircuit size={18}/>
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div
            className="h-2 bg-teal-600"
            style={{ width: `${((quizState.currentQuestionIndex + 1) / quizState.questions.length) * 100}%` }}
          />
        </div>

        {/* Question Card */}
        <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-200">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black">
                {quizState.currentQuestionIndex + 1}
              </div>
              <div className="text-sm text-gray-500 font-semibold">
                / {quizState.questions.length}
              </div>
            </div>

            <button
              onClick={() => handleFinishQuiz('normal')}
              className="px-4 py-3 rounded-2xl bg-slate-900 text-white hover:bg-slate-800 font-black flex items-center gap-2"
            >
              <CheckCircle size={18}/> Nộp bài
            </button>
          </div>

          {currentQ && renderQuestionContent(currentQ)}
          <div className="mt-8">{renderQuizQuestion()}</div>

          <div className="mt-8 flex justify-between items-center">
            <button
              onClick={handlePrevQuestion}
              disabled={quizState.currentQuestionIndex === 0}
              className="px-4 py-3 rounded-2xl border border-gray-200 hover:bg-gray-50 font-bold disabled:opacity-50 flex items-center gap-2"
            >
              <ChevronLeft size={18}/> Trước
            </button>

            <div className="text-sm text-gray-500 font-semibold">
              Câu {quizState.currentQuestionIndex + 1}/{quizState.questions.length}
            </div>

            {quizState.currentQuestionIndex < quizState.questions.length - 1 ? (
              <button
                onClick={handleNextQuestion}
                className="px-4 py-3 rounded-2xl bg-teal-600 text-white hover:bg-teal-700 font-black flex items-center gap-2"
              >
                Tiếp <ChevronRight size={18}/>
              </button>
            ) : (
              <button
                onClick={() => handleFinishQuiz('normal')}
                className="px-4 py-3 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 font-black flex items-center gap-2"
              >
                Nộp bài <CheckCircle size={18}/>
              </button>
            )}
          </div>
        </div>

        {/* Chat */}
        {chatOpen && renderChatWidget()}
      </div>
    </div>
  );

  const renderResult = () => {
    if (!quizResult) return null;
    const passed = quizResult.passed;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 p-4">
        <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-3xl flex items-center justify-center ${passed ? 'bg-emerald-600' : 'bg-rose-600'} text-white`}>
              {passed ? <CheckCircle size={28}/> : <XCircle size={28}/>}
            </div>
            <div>
              <div className="text-3xl font-black text-slate-900">{passed ? 'Đạt' : 'Chưa đạt'}</div>
              <div className="text-slate-600 font-semibold">{quizResult.message}</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-black text-slate-500 uppercase">Điểm</div>
              <div className="text-2xl font-black text-slate-900">{quizResult.score}/{quizResult.totalQuestions}</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-black text-slate-500 uppercase">Tỷ lệ</div>
              <div className="text-2xl font-black text-slate-900">{quizResult.percentage}%</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-black text-slate-500 uppercase">Thời gian</div>
              <div className="text-2xl font-black text-slate-900">{formatTime(quizResult.timeSpent)}</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-black text-slate-500 uppercase">Lý do nộp</div>
              <div className="text-sm font-black text-slate-900">{quizResult.submissionReason}</div>
            </div>
          </div>

          <div className="mt-8 flex flex-col md:flex-row gap-3">
            <button
              onClick={() => { setView(ViewState.DASHBOARD); setQuizResult(null); setActiveAttempt(null); }}
              className="flex-1 py-4 rounded-2xl bg-teal-600 text-white font-black hover:bg-teal-700"
            >
              Về trang chính
            </button>
            <button
              onClick={handleOpenLeaderboard}
              className="flex-1 py-4 rounded-2xl border border-slate-200 font-black text-slate-800 hover:bg-slate-50"
            >
              Xem BXH
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setView(ViewState.DASHBOARD)}
            className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-2"
          >
            <ChevronLeft size={18}/> Quay lại
          </button>
          <div className="text-2xl font-black text-slate-900 flex items-center gap-2"><Trophy size={22} className="text-amber-500"/> Bảng xếp hạng</div>
          <div />
        </div>

        {leaderboardLoading ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
            <Loader2 className="animate-spin" size={18}/> Đang tải...
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-slate-100">
              {leaderboard.map((u, idx) => (
                <div key={u.email} className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 text-center font-black text-slate-500">{idx + 1}</div>
                    <div className="h-10 w-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black">
                      {u.name?.slice(0,1)?.toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-slate-900 truncate">{u.name}</div>
                      <div className="text-xs text-slate-500 truncate">{u.className || u.class || ''}</div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 flex items-center gap-2">
                    <Zap className="text-amber-500" size={18}/> {u.totalScore}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================
  return (
    <div className="min-h-screen">
      {loading && view !== ViewState.LOGIN && <Loading />}

      {view === ViewState.LOGIN && renderLogin()}
      {view === ViewState.DASHBOARD && renderDashboard()}
      {view === ViewState.TOPIC_SELECT && renderTopicSelect()}
      {view === ViewState.QUIZ && renderQuiz()}
      {view === ViewState.RESULT && renderResult()}
      {view === ViewState.LEADERBOARD && renderLeaderboard()}

      {view === ViewState.ADMIN_PANEL && (
        <div className="min-h-screen bg-slate-50">
          <div className="max-w-6xl mx-auto p-4">
            <button
              onClick={() => setView(ViewState.DASHBOARD)}
              className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 flex items-center gap-2"
            >
              <ChevronLeft size={18}/> Quay lại
            </button>
          </div>
          <AdminPanel onLogout={handleLogout} />
        </div>
      )}
    </div>
  );
};

export default App;
