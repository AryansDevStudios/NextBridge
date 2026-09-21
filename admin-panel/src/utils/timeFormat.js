// Time formatting & Period Analytics Utilities

export function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats seconds into human-readable hours, minutes, and seconds.
 * Examples:
 *  - 6976 -> "1 hr 56 mins" (or "1h 56m" if compact)
 *  - 308  -> "5 mins"       (or "5m 8s" if compact with showSeconds)
 *  - 45   -> "45 secs"      (or "45s")
 *  - 0    -> "0 mins"       (or "0m")
 */
export function formatDuration(seconds, options = {}) {
  const { showSeconds = false, compact = false } = options;
  if (!seconds || isNaN(seconds) || seconds <= 0) {
    return compact ? '0m' : '0 mins';
  }

  const totalSecs = Math.round(seconds);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  if (compact) {
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return showSeconds && s > 0 ? `${m}m ${s}s` : `${m}m`;
    return `${s}s`;
  }

  if (h > 0) {
    const hrStr = `${h} hr${h > 1 ? 's' : ''}`;
    const minStr = m > 0 ? ` ${m} min${m !== 1 ? 's' : ''}` : '';
    return `${hrStr}${minStr}`.trim();
  }

  if (m > 0) {
    const minStr = `${m} min${m !== 1 ? 's' : ''}`;
    if (showSeconds && s > 0) return `${minStr} ${s}s`;
    return minStr;
  }

  return `${s} sec${s !== 1 ? 's' : ''}`;
}

/**
 * Calculates a student's screen time, video time, notes time, and study time
 * for a specific time period ('all', 'today', 'yesterday', 'week', 'month').
 */
export function getStudentTimeForPeriod(student, period = 'all') {
  if (!student) {
    return { screenTime: 0, videoTime: 0, notesTime: 0, studyTime: 0 };
  }

  if (period === 'all') {
    const screenTime = student.totalScreenTime || 0;
    const videoTime = student.totalVideoTime || 0;
    const notesTime = student.totalNotesTime || 0;
    return {
      screenTime,
      videoTime,
      notesTime,
      studyTime: videoTime + notesTime
    };
  }

  const now = new Date();
  const todayKey = getLocalDateKey(now);
  let targetDates = [];

  if (period === 'today') {
    targetDates = [todayKey];
  } else if (period === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    targetDates = [getLocalDateKey(yesterday)];
  } else if (period === 'week') {
    // Last 7 days
    targetDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      return getLocalDateKey(d);
    });
  } else if (period === 'month') {
    // Last 30 days
    targetDates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      return getLocalDateKey(d);
    });
  }

  const dailyScreen = student.dailyScreenTime || {};
  const dailyVideo = student.dailyVideoTime || {};
  const dailyNotes = student.dailyNotesTime || {};

  let screenTime = 0;
  let videoTime = 0;
  let notesTime = 0;

  targetDates.forEach(dateKey => {
    screenTime += (dailyScreen[dateKey] || 0);
    videoTime += (dailyVideo[dateKey] || 0);
    notesTime += (dailyNotes[dateKey] || 0);
  });

  // Fallback: If no daily breakdown exists yet but student only has lifetime total and was active today
  if (period === 'today' && screenTime === 0 && !student.dailyScreenTime) {
    if (student.lastActive && getLocalDateKey(new Date(student.lastActive)) === todayKey) {
      screenTime = student.totalScreenTime || 0;
      videoTime = student.totalVideoTime || 0;
      notesTime = student.totalNotesTime || 0;
    }
  }

  return {
    screenTime,
    videoTime,
    notesTime,
    studyTime: videoTime + notesTime
  };
}

/**
 * Returns daily breakdown data for the last 7 days for charts.
 */
export function getLast7DaysBreakdown(student) {
  const days = [];
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dailyScreen = student?.dailyScreenTime || {};
  const dailyVideo = student?.dailyVideoTime || {};
  const dailyNotes = student?.dailyNotesTime || {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateKey = getLocalDateKey(d);
    const screenSecs = dailyScreen[dateKey] || 0;
    const videoSecs = dailyVideo[dateKey] || 0;
    const notesSecs = dailyNotes[dateKey] || 0;
    const isToday = i === 0;

    days.push({
      dateKey,
      dayName: dayNames[d.getDay()],
      dayNum: d.getDate(),
      label: isToday ? 'Today' : `${dayNames[d.getDay()]} ${d.getDate()}`,
      screenSecs,
      videoSecs,
      notesSecs,
      totalStudySecs: videoSecs + notesSecs,
      isToday
    });
  }

  return days;
}
