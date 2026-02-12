// ============================================================================
// LMS THẦY PHÚC - MAIN APP (FIXED VERSION)
// Các sửa đổi:
// 1. Chuyển tab 1 lần là nộp bài (thay vì 3 lần)
// 2. Ẩn lý thuyết khi mở chuyên đề, chỉ hiện sau khi làm bài không đạt
// 3. Thêm icon khóa cho level chưa mở
// 4. Xử lý reminders sau khi đăng nhập
// 5. Sửa submissionReason khi cheat_tab
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
import type { ReminderItem } from './services/sheetService';
import { askAITutor, incrementHintLevel, resetAllHints } from './services/geminiService';
import MathText from './components/MathText';
import QuestionImage from './components/QuestionImage';
import ContentWithInlineImages from './components/ContentWithInlineImages';  // ← THÊM DÒNG NÀY

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

  // ==================== DUOLINGO-LIKE REMINDERS ====================
  const [loginReminders, setLoginReminders] = useState<ReminderItem[]>([]);
  const [showLoginReminder, setShowLoginReminder] = useState(false);

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
  
  // ★ THÊM: State để lưu user progress (dùng cho khóa level)
  const [userProgress, setUserProgress] = useState<Record<string, number>>({});

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

  const formatTime = (sec: number | undefined | null): string => {
    if (sec === undefined || sec === null || isNaN(Number(sec)) || !isFinite(Number(sec))) {
      return '0:00';
    }
    const safeSec = Math.max(0, Math.floor(Number(sec)));
    const m = Math.floor(safeSec / 60);
    const s = safeSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const scrollChatToBottom = () => {
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };
  
  // ★ THÊM: Helper kiểm tra level đã mở khóa chưa
  const isLevelUnlocked = (level: number): boolean => {
    if (level === 1) return true; // Level 1 luôn mở
    const progressKey = `${selectedGrade}_${selectedTopic}`;
    const currentUnlockedLevel = userProgress[progressKey] || 1;
    return level <= currentUnlockedLevel;
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

    setUser(session.user);
    setSessionToken(session.sessionToken);
    setSelectedGrade(Number((session.user as any)?.grade || 6) || 6);
    setView(ViewState.DASHBOARD);
    setDashboardTab('topics');
    
    // ★ THÊM: Load user progress để biết level nào đã mở
    if (session.user?.progress) {
      setUserProgress(session.user.progress);
    }

    (async () => {
      try {
        const t = await fetchTopics(selectedGrade);
        setTopics(t);
      } catch {}
    })();

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

  // ★ SỬA: Chuyển tab 1 lần là nộp bài ngay (thay vì 3 lần)
  useEffect(() => {
    if (view !== ViewState.QUIZ || quizState.isComplete) return;
    if (quizState.tabSwitchCount >= 1) {  // ★ ĐỔI TỪ 3 THÀNH 1
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
      } catch (e) {}
    })();
  }, [selectedGrade, view]);

  // ==================== AUTO START ASSIGNMENT IF URL HAS assignmentId ====================
  useEffect(() => {
    if (!pendingAssignmentId) return;
    if (!user) return;
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
      
      // ★ THÊM: Xử lý reminders
      if (session.reminders && session.reminders.length > 0) {
        setLoginReminders(session.reminders);
        setShowLoginReminder(true);
      }
      
      // ★ THÊM: Load user progress
      if (session.user?.progress) {
        setUserProgress(session.user.progress);
      }
      
      setView(ViewState.DASHBOARD);

      try {
        const t = await fetchTopics(selectedGrade);
        setTopics(t);
      } catch {}

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
    setLoginReminders([]);
    setShowLoginReminder(false);
    setView(ViewState.LOGIN);
    setQuizResult(null);
    setTheory(null);
    setUserProgress({});
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

      loadAssignedExams();
    } finally {
      setLoading(false);
    }
  };

  // ==================== TOPIC FLOW ====================
  // ★ SỬA: Không load theory khi chọn topic, chỉ load user progress
  const handleSelectTopic = async (topic: string) => {
    setSelectedTopic(topic);
    setError(null);
    setLoading(true);
    setTheory(null); // ★ Reset theory - không load ở đây
    try {
      // ★ Chỉ load user progress để biết level nào đã mở
      if (user) {
        try { 
          const progress = await fetchUserProgress(user.email); 
          if (progress?.progress) {
            setUserProgress(progress.progress);
          }
        } catch {}
      }
      setView(ViewState.TOPIC_SELECT);
    } catch (e: any) {
      setError(e?.message || 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuiz = async (level: number) => {
    // ★ THÊM: Kiểm tra level có được mở không
    if (!isLevelUnlocked(level)) {
      setError(`Bạn cần hoàn thành Level ${level - 1} với điểm ≥80% để mở khóa Level ${level}`);
      return;
    }
    
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

    // ★ SỬA: Set submissionReason trước khi gọi API
    setQuizState(prev => ({ ...prev, isComplete: true, score: correctCount, endTime: Date.now(), submissionReason: reason }));

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
          submissionReason: reason, // ★ Đảm bảo truyền đúng reason
          violations: reason !== 'normal' ? [{ type: reason, timestamp: Date.now() }] : []
        };

        if (activeAttempt) {
          payload.assignmentId = activeAttempt.assignmentId;
          payload.attemptId = activeAttempt.attemptId;
          payload.examId = activeAttempt.examId;
          payload.startedAt = activeAttempt.startedAt;
        }

        const result = await submitQuiz(payload);
        if (result) {
          // ★ SỬA: Ghi đè submissionReason từ client để đảm bảo đúng
          result.submissionReason = reason;
          setQuizResult({
  ...result,
  score: result.score ?? correctCount,
  totalQuestions: result.totalQuestions ?? quizState.questions.length,
  submissionReason: reason
});
          
          // ★ THÊM: Load theory khi không đạt (< 80%)
          if (!result.passed && result.percentage < 80) {
            try {
              const th = await fetchTheory(selectedGrade, selectedTopic, currentLevel);
              setTheory(th || null);
            } catch {}
          } else {
            setTheory(null);
          }
          
          // ★ THÊM: Cập nhật userProgress nếu đạt
          if (result.passed && result.canAdvance) {
            const progressKey = `${selectedGrade}_${selectedTopic}`;
            setUserProgress(prev => ({
              ...prev,
              [progressKey]: currentLevel + 1
            }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      const pct = Math.round((correctCount / quizState.questions.length) * 100);
      const passed = pct >= 80 && reason === 'normal';
      setQuizResult({
        email: 'guest',
        topic: selectedTopic,
        grade: selectedGrade,
        level: 1,
        score: correctCount,
        totalQuestions: quizState.questions.length,
        percentage: pct,
        passed: passed,
        canAdvance: false,
        timeSpent: elapsedTime,
        submissionReason: reason, // ★ Đảm bảo đúng reason
        message: reason !== 'normal' 
          ? `Bài thi bị nộp do: ${reason === 'cheat_tab' ? 'Chuyển tab' : reason}` 
          : 'Kết quả bài thi thử',
        answers,
        timestamp: new Date().toISOString()
      });
      
      // ★ THÊM: Load theory cho guest khi không đạt
      if (!passed) {
        try {
          const th = await fetchTheory(selectedGrade, selectedTopic, 1);
          setTheory(th || null);
        } catch {}
      }
    }

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
        question: currentQ ? ((currentQ as any).question_text || (currentQ as any).question || (currentQ as any).questionText || '') : '',
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
  const questionText = (q as any).question_text || (q as any).question || (q as any).questionText || '';
  
  // ✨ Kiểm tra xem có dùng inline images không
  const hasInlineImages = questionText.includes('[IMAGE:') || questionText.includes('[IMG:');
  
  return (
    <div className="space-y-4">
      {hasInlineImages ? (
        // ✨ MỚI: Dùng ContentWithInlineImages nếu có [IMAGE:id]
        <ContentWithInlineImages 
          content={questionText}
          className="text-gray-900 text-lg leading-relaxed"
        />
      ) : (
        // CŨ: Giữ nguyên cho tương thích
        <>
          <div className="text-gray-900 text-lg leading-relaxed">
            <MathText content={questionText} />
          </div>
          {(q as any).image_id && (
            <QuestionImage imageId={(q as any).image_id} alt={`Câu ${quizState.currentQuestionIndex + 1}`} />
          )}
        </>
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
                   {/* ✨ THAY ĐỔI DÒNG NÀY */}
                    {(o.text || '').includes('[IMAGE:') || (o.text || '').includes('[IMG:') ? (
                      <ContentWithInlineImages content={o.text || ''} className="" />
                    ) : (
                      <MathText content={o.text || ''} />
                    )}
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
      {parts.map((p, idx) => {
        const text = getText(p) || '';
        
        return (
          <div key={p} className="bg-white p-4 rounded-2xl border border-gray-200 flex flex-col md:flex-row items-center gap-4">
            <div className="font-bold text-teal-700 w-10">{p})</div>
            
            {/* ✨ THAY ĐỔI: Dùng ContentWithInlineImages thay cho MathText */}
            <div className="flex-1 text-gray-900">
              <ContentWithInlineImages content={text} className="" />
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
        );
      })}
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
                * Chế độ này dành cho "đề theo mã" (không cần đăng nhập). Đề được giao theo lớp thì cần đăng nhập.
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
        {/* ★ Duolingo-like reminder */}
        {showLoginReminder && loginReminders.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-black text-amber-900 flex items-center gap-2">
                <Zap size={18} /> Nhắc học hôm nay
              </div>
              <div className="text-sm text-amber-900 mt-1">Hôm qua bạn đã làm:</div>

              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {loginReminders.map((r, idx) => (
                  <li
                    key={`${r.grade}-${r.topic}-${idx}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="font-semibold truncate">Lớp {r.grade} • {r.topic}</span>
                    <span className="shrink-0 px-2 py-0.5 rounded-lg bg-amber-200 text-amber-900 font-black">
                      {r.count} lần
                    </span>
                  </li>
                ))}
              </ul>

              <div className="text-xs text-amber-800 mt-2">Gợi ý: làm thêm 1 lượt hôm nay để giữ nhịp học.</div>
            </div>

            <button
              onClick={() => setShowLoginReminder(false)}
              className="shrink-0 px-3 py-2 rounded-xl bg-white border border-amber-200 hover:bg-amber-100 font-black text-amber-900"
            >
              Đóng
            </button>
          </div>
        )}

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
                    <div className="text-sm text-slate-600 mt-1">Bấm để chọn mức độ</div>
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

  // ★ SỬA: renderTopicSelect - Ẩn lý thuyết, thêm icon khóa
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

        {/* ★ BỎ: Không hiện lý thuyết ở đây nữa */}

        {/* ★ THÊM: Thông báo lỗi nếu chọn level chưa mở */}
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex gap-2">
            <AlertCircle size={18}/> <div className="font-semibold">{error}</div>
          </div>
        )}

        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
            <Target size={20} className="text-teal-600"/> Chọn mức độ
          </div>
          
          {/* ★ SỬA: Thêm icon khóa và disable cho level chưa mở */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[1,2,3,4,5].map(lv => {
              const unlocked = isLevelUnlocked(lv);
              return (
                <button
                  key={lv}
                  onClick={() => handleStartQuiz(lv)}
                  disabled={!unlocked}
                  className={`py-4 rounded-2xl border font-black flex items-center justify-center gap-2 transition-all ${
                    unlocked 
                      ? 'border-slate-200 hover:border-teal-300 hover:bg-teal-50 text-slate-800 cursor-pointer' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {!unlocked && <Lock size={16} className="text-slate-400"/>}
                  Level {lv}
                  {unlocked && lv === 1 && <Star size={14} className="text-amber-500"/>}
                </button>
              );
            })}
          </div>
          
          {/* ★ THÊM: Gợi ý */}
          <div className="mt-4 text-sm text-slate-500 flex items-center gap-2">
            <Lock size={14}/> 
            <span>Hoàn thành level trước với ≥80% để mở khóa level tiếp theo</span>
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

  // ★ SỬA: renderResult - Hiển thị lý thuyết đẹp khi không đạt
  const renderResult = () => {
    if (!quizResult) return null;
    const passed = quizResult.passed;

    // Xử lý các giá trị có thể undefined/NaN
    const score = typeof quizResult.score === 'number' && !isNaN(quizResult.score) 
      ? quizResult.score : 0;
    const totalQuestions = typeof quizResult.totalQuestions === 'number' && 
      !isNaN(quizResult.totalQuestions) && quizResult.totalQuestions > 0 
      ? quizResult.totalQuestions 
      : (quizState.questions.length > 0 ? quizState.questions.length : 1);
    const percentage = typeof quizResult.percentage === 'number' && !isNaN(quizResult.percentage) 
      ? quizResult.percentage : Math.round((score / totalQuestions) * 100);
    const timeSpent = typeof quizResult.timeSpent === 'number' && !isNaN(quizResult.timeSpent) 
      ? quizResult.timeSpent : elapsedTime || 0;
    
    // ★ THÊM: Lấy submissionReason đúng
    const submissionReason = quizResult.submissionReason || 'normal';
    const isCheat = submissionReason !== 'normal';

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Kết quả chính */}
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
            <div className="flex items-center gap-4">
              <div className={`h-14 w-14 rounded-3xl flex items-center justify-center ${passed ? 'bg-emerald-600' : isCheat ? 'bg-orange-600' : 'bg-rose-600'} text-white`}>
                {passed ? <CheckCircle size={28}/> : isCheat ? <AlertTriangle size={28}/> : <XCircle size={28}/>}
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900">
                  {passed ? 'Đạt' : isCheat ? 'Vi phạm' : 'Chưa đạt'}
                </div>
                <div className="text-slate-600 font-semibold">{quizResult.message || 'Kết quả bài thi'}</div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-black text-slate-500 uppercase">Điểm</div>
                <div className="text-2xl font-black text-slate-900">{score}/{totalQuestions}</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-black text-slate-500 uppercase">Tỷ lệ</div>
                <div className={`text-2xl font-black ${percentage >= 80 ? 'text-emerald-600' : 'text-rose-600'}`}>{percentage}%</div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-black text-slate-500 uppercase">Thời gian</div>
                <div className="text-2xl font-black text-slate-900">{formatTime(timeSpent)}</div>
              </div>
              <div className={`p-4 rounded-2xl border ${isCheat ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="text-xs font-black text-slate-500 uppercase">Lý do nộp</div>
                <div className={`text-sm font-black ${isCheat ? 'text-orange-700' : 'text-slate-900'}`}>
                  {submissionReason === 'normal' ? '✓ Bình thường' : 
                   submissionReason === 'cheat_tab' ? '⚠ Chuyển tab' :
                   submissionReason === 'cheat_conflict' ? '⚠ Đa thiết bị' :
                   submissionReason === 'timeout' ? '⏱ Hết giờ' : submissionReason}
                </div>
              </div>
            </div>

            {/* ★ THÊM: Cảnh báo khi vi phạm */}
            {isCheat && (
              <div className="mt-6 p-4 rounded-2xl bg-orange-50 border border-orange-200">
                <div className="flex items-center gap-2 text-orange-800">
                  <AlertTriangle size={20}/>
                  <span className="font-black">Bài thi bị nộp tự động do vi phạm quy chế thi</span>
                </div>
                <div className="mt-2 text-sm text-orange-700">
                  {submissionReason === 'cheat_tab' && 'Bạn đã chuyển sang tab/ứng dụng khác trong khi làm bài.'}
                  {submissionReason === 'cheat_conflict' && 'Phát hiện đăng nhập từ thiết bị khác.'}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-col md:flex-row gap-3">
              <button
                onClick={() => { setView(ViewState.DASHBOARD); setQuizResult(null); setActiveAttempt(null); setTheory(null); }}
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

          {/* ✨ Chi tiết từng câu */}
          {quizResult.answers && quizResult.answers.length > 0 && (
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
              <div className="text-xl font-black text-slate-900 mb-6">Chi tiết bài làm</div>
              
              {quizResult.answers.map((ans: any, idx: number) => {
                const q = quizState.questions[idx];
                if (!q) return null;
                
                return (
                  <div key={idx} className="mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white font-bold ${
                        ans.correct ? 'bg-green-500' : 'bg-red-500'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="font-bold text-slate-900">
                        Câu {idx + 1}: {ans.correct ? '✓ Đúng' : '✗ Sai'}
                      </div>
                    </div>
                    
                    <ContentWithInlineImages 
                      content={q.question_text || ''} 
                      className="text-slate-700 mb-4" 
                    />
                    
                    {q.question_type === 'Trắc nghiệm' && (
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map(key => {
                          const optionText = (q as any)[`option_${key}`] || '';
                          const isUserAnswer = ans.userAnswer === key;
                          const isCorrect = q.answer_key === key;
                          
                          return (
                            <div 
                              key={key}
                              className={`p-3 rounded-xl flex items-start gap-2 ${
                                isCorrect ? 'bg-green-50 border-2 border-green-500' : 
                                isUserAnswer ? 'bg-red-50 border-2 border-red-500' : 
                                'bg-white border border-slate-200'
                              }`}
                            >
                              <span className="font-bold shrink-0">{key}.</span>
                              <div className="flex-1">
                                <ContentWithInlineImages content={optionText} className="" />
                              </div>
                              {isCorrect && <span className="text-green-600 font-bold shrink-0">✓ Đáp án</span>}
                              {isUserAnswer && !isCorrect && <span className="text-red-600 font-bold shrink-0">✗ Bạn chọn</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {q.question_type === 'Đúng/Sai' && (
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map((key, i) => {
                          const optionText = (q as any)[`option_${key}`] || '';
                          const userAnswers = String(ans.userAnswer || '?-?-?-?').split('-');
                          const correctAnswers = String(q.answer_key || 'Đ-Đ-Đ-Đ').split('-');
                          const isCorrect = userAnswers[i] === correctAnswers[i];
                          
                          return (
                            <div 
                              key={key}
                              className={`p-3 rounded-xl flex items-start gap-2 ${
                                isCorrect ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300'
                              }`}
                            >
                              <span className="font-bold shrink-0">{key})</span>
                              <div className="flex-1">
                                <ContentWithInlineImages content={optionText} className="" />
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  correctAnswers[i] === 'Đ' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  Đáp án: {correctAnswers[i]}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                  isCorrect ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
                                }`}>
                                  Bạn: {userAnswers[i] || '?'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {q.solution && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <div className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                          <Lightbulb size={16} />
                          Giải thích:
                        </div>
                        <ContentWithInlineImages content={q.solution} className="text-slate-700 text-sm" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* ★ THÊM: Hiển thị lý thuyết khi không đạt */}
          {!passed && theory && (
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-amber-200 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <BookMarked className="text-amber-600" size={24}/>
                </div>
                <div>
                  <div className="text-xl font-black text-slate-900">📚 Xem lại lý thuyết</div>
                  <div className="text-sm text-slate-500">Ôn tập để làm tốt hơn lần sau</div>
                </div>
              </div>
              
              <div className="text-2xl font-black text-slate-900 mb-4">{theory.title}</div>
              
              <div className="prose max-w-none text-slate-700 leading-relaxed">
                <ContentWithInlineImages content={theory.content || ''} className="" />
              </div>
              
              {theory.examples && (
                <div className="mt-6 p-5 bg-blue-50 rounded-2xl border border-blue-100">
                  <div className="text-sm font-black text-blue-800 uppercase mb-2 flex items-center gap-2">
                    <Lightbulb size={16}/> Ví dụ minh họa
                  </div>
                  <div className="text-slate-700">
                    <ContentWithInlineImages content={theory.examples} className="" />
                  </div>
                </div>
              )}
              
              {theory.tips && (
                <div className="mt-4 p-5 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="text-sm font-black text-amber-800 uppercase mb-2 flex items-center gap-2">
                    <Star size={16}/> Mẹo & Lưu ý
                  </div>
                  <div className="text-slate-700">{theory.tips}</div>
                </div>
              )}
              
              <button
                onClick={() => handleSelectTopic(selectedTopic)}
                className="mt-6 w-full py-4 rounded-2xl bg-amber-500 text-white font-black hover:bg-amber-600 flex items-center justify-center gap-2"
              >
                <RotateCcw size={18}/> Làm lại bài
              </button>
            </div>
          )}
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
