import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Activity,
  BatteryMedium,
  Bell,
  Footprints,
  HeartPulse,
  Mic,
  Pill,
  Signal,
  Sparkles,
  Wifi,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { Badge } from '@/components/ui/badge';

import { cn } from '@/lib/utils';

import {
  startAlertLoop,
  stopAlertLoop,
  triggerAlert,
} from '@/lib/audioAlerts';

import { toast } from '@/hooks/use-toast';

import {
  DEMO_ELDERS,
  DEMO_VITALS,
} from '@/lib/demoData';

import {
  createSpeechRecognition,
  DEFAULT_MEDICATION_CONTEXT,
  detectLanguageFromText,
  formatWatchTime,
  getLanguageConfig,
  isSpeechRecognitionSupported,
  openYoutubeSearch,
  processVoiceCommand,
  ReminderItem,
  requestMicrophonePermission,
  resolveSpeechLanguage,
  speakText,
  stopSpeaking,
  SupportedLanguage,
} from '@/components/VoiceAssistant';

import { useAppStore } from '@/store';

import {
  useGuardianStore,
  type Reminder,
} from '@/store/guardianStore';

import { apiFetch } from '@/lib/api';

const API_BASE = '/api';

type ConversationTurn = {
  role: 'user' | 'model';
  content: string;
};

interface AssistantChatResponse {
  response: string;
}

interface WatchSimulatorProps {
  buttonClassName?: string;
  buttonVariant?:
    | 'default'
    | 'ghost'
    | 'outline'
    | 'secondary';
}

/*
 * ---------------------------------------------------------
 * RESPONSE TIMING
 * ---------------------------------------------------------
 *
 * The old version removed the response too quickly.
 *
 * Keep normal AI answers visible for at least 45 seconds.
 */
const RESPONSE_TIMEOUT_MS = 45000;
const ASSISTANT_RESPONSE_MIN_DISPLAY_MS = 45000;

const SNOOZE_MS = 2 * 60 * 1000;

const WATCH_ALARM_RESPONSE_TIMEOUT_MS =
  2 * 60 * 1000;

const WATCH_ALARM_COPY: Record<
  SupportedLanguage,
  {
    title: string;
    message: string;
    yes: string;
    no: string;
    snoozed: string;
    dismissed: string;
  }
> = {
  'en-IN': {
    title: 'Tablet time',
    message:
      'It is your time to take tablet.',
    yes: 'Yes',
    no: 'No',
    snoozed:
      'Snoozed for 2 minutes.',
    dismissed:
      'Alarm dismissed.',
  },

  'hi-IN': {
    title: 'दवा का समय',
    message:
      'आपकी टैबलेट लेने का समय हो गया है।',
    yes: 'हाँ',
    no: 'नहीं',
    snoozed:
      '2 मिनट के लिए स्नूज़ किया गया।',
    dismissed:
      'अलार्म बंद कर दिया गया।',
  },

  'kn-IN': {
    title: 'ಮಾತ್ರೆ ಸಮಯ',
    message:
      'ನಿಮ್ಮ ಟ್ಯಾಬ್ಲೆಟ್ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಾಗಿದೆ.',
    yes: 'ಹೌದು',
    no: 'ಇಲ್ಲ',
    snoozed:
      '2 ನಿಮಿಷಗಳ ಕಾಲ ಸ್ನೂಜ್ ಮಾಡಲಾಗಿದೆ.',
    dismissed:
      'ಅಲಾರ್ಮ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.',
  },

  'ta-IN': {
    title: 'மாத்திரை நேரம்',
    message:
      'உங்கள் மாத்திரை எடுக்க வேண்டிய நேரம் இது.',
    yes: 'ஆம்',
    no: 'இல்லை',
    snoozed:
      '2 நிமிடங்களுக்கு ஸ்னூஸ் செய்யப்பட்டது.',
    dismissed:
      'அலாரம் நிறுத்தப்பட்டது.',
  },

  'te-IN': {
    title: 'టాబ్లెట్ సమయం',
    message:
      'మీ టాబ్లెట్ తీసుకునే సమయం వచ్చింది.',
    yes: 'అవును',
    no: 'లేదు',
    snoozed:
      '2 నిమిషాలకు స్నూజ్ చేయబడింది.',
    dismissed:
      'అలారం నిలిపివేయబడింది.',
  },

  'ml-IN': {
    title: 'ഗുളിക സമയം',
    message:
      'നിങ്ങളുടെ ഗുളിക കഴിക്കേണ്ട സമയമായി.',
    yes: 'അതെ',
    no: 'ഇല്ല',
    snoozed:
      '2 മിനിറ്റിന് സ്നൂസ് ചെയ്തു.',
    dismissed:
      'അലാറം നിർത്തി.',
  },
};

const WatchSimulator: React.FC<
  WatchSimulatorProps
> = ({
  buttonClassName,
  buttonVariant = 'outline',
}) => {
  /*
   * -------------------------------------------------------
   * STORE DATA
   * -------------------------------------------------------
   */

  const demoElders = useAppStore(
    (state) => state.demoElders,
  );

  const demoVitals = useAppStore(
    (state) => state.demoVitals,
  );

  const addCaretakerAlert =
    useAppStore(
      (state) => state.addAlert,
    );

  const guardianReminders =
    useGuardianStore(
      (state) => state.reminders,
    );

  const verifyReminder =
    useGuardianStore(
      (state) => state.verifyReminder,
    );

  const guardianUser =
    useGuardianStore(
      (state) => state.guardianUser,
    );

  const addGuardianAlert =
    useGuardianStore(
      (state) => state.addGuardianAlert,
    );

  const setGuardianReminders =
    useGuardianStore(
      (state) => state.setReminders,
    );

  /*
   * -------------------------------------------------------
   * REFS
   * -------------------------------------------------------
   */

  const recognitionRef =
    useRef<
      ReturnType<
        typeof createSpeechRecognition
      > | null
    >(null);

  const responseTimeoutRef =
    useRef<number | null>(null);

  const alarmTimeoutRef =
    useRef<number | null>(null);

  /*
   * -------------------------------------------------------
   * STATE
   * -------------------------------------------------------
   */

  const [open, setOpen] =
    useState(false);

  const [currentTime, setCurrentTime] =
    useState(() => new Date());

  const [isListening, setIsListening] =
    useState(false);

  const [transcript, setTranscript] =
    useState('');

  const [reminders, setReminders] =
    useState<ReminderItem[]>([]);

  const [activeReminderId, setActiveReminderId] =
    useState<string | null>(null);

  const [
    activeGuardianAlarmId,
    setActiveGuardianAlarmId,
  ] = useState<string | null>(null);

  const [
    dismissedGuardianAlarms,
    setDismissedGuardianAlarms,
  ] = useState<
    Record<string, true>
  >({});

  const [
    snoozedGuardianAlarms,
    setSnoozedGuardianAlarms,
  ] = useState<
    Record<string, number>
  >({});

  const [stepCount, setStepCount] =
    useState(2846);

  const [responseText, setResponseText] =
    useState('');

  const [
    showResponseOverlay,
    setShowResponseOverlay,
  ] = useState(false);

  const [
    conversationHistory,
    setConversationHistory,
  ] = useState<
    ConversationTurn[]
  >([]);

  const [
    assistantStatus,
    setAssistantStatus,
  ] = useState<
    | 'idle'
    | 'listening'
    | 'processing'
    | 'speaking'
    | 'error'
  >('idle');

  /*
   * -------------------------------------------------------
   * CONTEXT
   * -------------------------------------------------------
   */

  const medicationContext = useMemo(
    () => DEFAULT_MEDICATION_CONTEXT,
    [],
  );

  const activeElder = useMemo(() => {
    const demoElder =
      demoElders[0] ||
      DEMO_ELDERS[0];

    if (!guardianUser?.elderName) {
      return demoElder;
    }

    return {
      ...demoElder,
      full_name:
        guardianUser.elderName,
    };
  }, [
    demoElders,
    guardianUser?.elderName,
  ]);

  const activeVitals =
    demoVitals[activeElder?.id] ||
    DEMO_VITALS[activeElder?.id] ||
    DEMO_VITALS['elder-1'];

  const profileLanguage =
    resolveSpeechLanguage(
      activeElder?.language_pref,
    );

  const [
    assistantLanguage,
    setAssistantLanguage,
  ] = useState<SupportedLanguage>(
    profileLanguage,
  );

  const languageConfig =
    getLanguageConfig(
      assistantLanguage,
    );

  /*
   * -------------------------------------------------------
   * SYNC REMINDERS
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    if (
      'Notification' in window &&
      Notification.permission ===
        'default'
    ) {
      Notification.requestPermission().catch(
        () => {},
      );
    }

    const syncReminders = () => {
      apiFetch<{
        medications?: any[];
        alarms?: any[];
      }>('/dashboard-data')
        .then((data) => {
          const medReminders = (
            data.medications || []
          )
            .map((med) => {
              const dosage =
                `${med.dose_amount}${med.dose_unit}`;

              return (
                med.times || []
              ).map(
                (
                  time: string,
                  idx: number,
                ) => ({
                  id: `med-${med.id}-${idx}`,
                  elderId:
                    med.elder_id,
                  elderName:
                    demoElders.find(
                      (elder) =>
                        elder.id ===
                        med.elder_id,
                    )?.full_name ||
                    activeElder.full_name,
                  type: 'medication' as const,
                  title:
                    `${med.brand_name} ${dosage}`,
                  time,
                  repeat:
                    'daily' as const,
                  verified: false,
                  pillName:
                    med.brand_name,
                  dosage,
                  photo:
                    med.photo || '',
                  createdAt:
                    new Date().toISOString(),
                }),
              );
            })
            .flat();

          const alarmReminders =
            (
              data.alarms || []
            ).map((alarm) => ({
              id: `alarm-${alarm.id}`,
              elderId:
                alarm.elderId,
              elderName:
                demoElders.find(
                  (elder) =>
                    elder.id ===
                    alarm.elderId,
                )?.full_name ||
                activeElder.full_name,
              type: alarm.type,
              title: alarm.title,
              time: alarm.time,
              repeat:
                'daily' as const,
              verified: false,
              createdAt:
                new Date().toISOString(),
            }));

          setGuardianReminders([
            ...medReminders,
            ...alarmReminders,
          ]);
        })
        .catch((err) => {
          console.error(
            'Failed to sync PWA watch reminders:',
            err,
          );
        });
    };

    syncReminders();

    const interval =
      window.setInterval(
        syncReminders,
        4000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    activeElder.full_name,
    demoElders,
    open,
    setGuardianReminders,
  ]);

  /*
   * -------------------------------------------------------
   * REMINDER DATA
   * -------------------------------------------------------
   */

  const activeReminder =
    reminders.find(
      (reminder) =>
        reminder.id ===
        activeReminderId,
    ) || null;

  const activeGuardianAlarm =
    guardianReminders.find(
      (reminder) =>
        reminder.id ===
        activeGuardianAlarmId,
    ) || null;

  const activeGuardianAlarmElderName =
    activeGuardianAlarm?.elderName ||
    demoElders.find(
      (elder) =>
        elder.id ===
        activeGuardianAlarm?.elderId,
    )?.full_name ||
    activeElder.full_name;

  const alarmCopy =
    WATCH_ALARM_COPY[
      assistantLanguage
    ];

  const upcomingReminders =
    reminders
      .filter(
        (reminder) =>
          !reminder.triggered,
      )
      .sort(
        (a, b) =>
          new Date(
            a.dueAt,
          ).getTime() -
          new Date(
            b.dueAt,
          ).getTime(),
      )
      .slice(0, 3);

  const getScheduleDateKey = (
    date: Date,
  ) =>
    date
      .toISOString()
      .slice(0, 10);

  const getReminderAlarmKey = (
    reminder: Reminder,
    date: Date,
  ) =>
    `${reminder.id}-${
      reminder.repeat === 'once'
        ? 'once'
        : getScheduleDateKey(date)
    }`;

  const getReminderDueAt = (
    reminder: Reminder,
    now: Date,
  ) => {
    const [
      hours = '0',
      minutes = '0',
    ] = (
      reminder.time ||
      '00:00'
    ).split(':');

    const dueAt =
      reminder.appointmentDate
        ? new Date(
            `${reminder.appointmentDate}T00:00:00`,
          )
        : new Date(now);

    dueAt.setHours(
      Number(hours),
      Number(minutes),
      0,
      0,
    );

    return dueAt;
  };

  const isReminderDueNow = (
    reminder: Reminder,
    dueAt: Date,
    now: Date,
  ) => {
    if (
      reminder.repeat ===
        'once' &&
      reminder.appointmentDate &&
      dueAt.toDateString() !==
        now.toDateString()
    ) {
      return false;
    }

    const age =
      now.getTime() -
      dueAt.getTime();

    return (
      age >= 0 &&
      age <
        15 * 60 * 1000
    );
  };

  const upcomingGuardianReminders =
    guardianReminders
      .filter((reminder) => {
        if (reminder.verified) {
          return false;
        }

        if (
          reminder.elderId &&
          activeElder?.id &&
          reminder.elderId !==
            activeElder.id
        ) {
          return false;
        }

        return true;
      })
      .map((reminder) => {
        const dueAt =
          getReminderDueAt(
            reminder,
            currentTime,
          );

        const snoozedUntil =
          snoozedGuardianAlarms[
            reminder.id
          ];

        const displayAt =
          snoozedUntil
            ? new Date(
                snoozedUntil,
              )
            : dueAt;

        return {
          id: reminder.id,
          title:
            reminder.pillName ||
            reminder.title,
          timeLabel:
            formatWatchTime(
              displayAt,
              assistantLanguage,
            ),
          dueAt: displayAt,
        };
      })
      .filter(
        (reminder) =>
          reminder.dueAt.getTime() >=
          currentTime.getTime(),
      )
      .sort(
        (a, b) =>
          a.dueAt.getTime() -
          b.dueAt.getTime(),
      )
      .slice(0, 3);

  const watchUpcomingReminders =
    [
      ...upcomingGuardianReminders,

      ...upcomingReminders.map(
        (reminder) => ({
          id: reminder.id,
          title: reminder.title,
          timeLabel:
            reminder.timeLabel,
          dueAt: new Date(
            reminder.dueAt,
          ),
        }),
      ),
    ]
      .sort(
        (a, b) =>
          a.dueAt.getTime() -
          b.dueAt.getTime(),
      )
      .slice(0, 3);

  /*
   * -------------------------------------------------------
   * DISMISS MEDICATION ALARM
   * -------------------------------------------------------
   */

  const dismissGuardianAlarm =
    useCallback(() => {
      if (!activeGuardianAlarm) {
        return;
      }

      stopAlertLoop(
        'medicine',
      );

      const alarmKey =
        getReminderAlarmKey(
          activeGuardianAlarm,
          currentTime,
        );

      setDismissedGuardianAlarms(
        (current) => ({
          ...current,
          [alarmKey]: true,
        }),
      );

      setSnoozedGuardianAlarms(
        (current) => {
          const next = {
            ...current,
          };

          delete next[
            activeGuardianAlarm.id
          ];

          return next;
        },
      );

      verifyReminder(
        activeGuardianAlarm.id,
      );

      setActiveGuardianAlarmId(
        null,
      );

      window.speechSynthesis?.cancel();

      const medicationName =
        activeGuardianAlarm.pillName ||
        activeGuardianAlarm.title ||
        'medicine';

      const messageText =
        `${activeGuardianAlarmElderName} has taken ${medicationName}.`;

      toast({
        title:
          'Medication Confirmed',
        description:
          messageText,
      });

      if (
        'Notification' in window &&
        Notification.permission ===
          'granted'
      ) {
        new Notification(
          'Medication Confirmed',
          {
            body: messageText,
            icon: '/logo.svg',
          },
        );
      }

      addGuardianAlert({
        id: `ga-accept-${Date.now()}`,
        type: 'medicine_missed',
        severity: 'info',
        message:
          `Taken — ${messageText}`,
        time: new Date().toISOString(),
        acknowledged: true,
        elderName:
          activeGuardianAlarmElderName,
      });

      const caretakerAlert = {
        id: `watch-med-taken-${Date.now()}`,
        elder_name:
          activeGuardianAlarmElderName,
        type: 'med_taken',
        severity: 'info',
        message:
          `${activeGuardianAlarmElderName} has taken ${medicationName}. Watch response: Yes.`,
        time: new Date().toISOString(),
        resolved: false,
      } as const;

      addCaretakerAlert(
        caretakerAlert,
      );

      void apiFetch(
        '/alerts',
        {
          method: 'POST',
          body: JSON.stringify(
            caretakerAlert,
          ),
        },
      ).catch(() => {});
    }, [
      activeGuardianAlarm,
      activeGuardianAlarmElderName,
      currentTime,
      verifyReminder,
      addGuardianAlert,
      addCaretakerAlert,
    ]);

  /*
   * -------------------------------------------------------
   * SNOOZE MEDICATION ALARM
   * -------------------------------------------------------
   */

  const snoozeGuardianAlarm =
    useCallback(() => {
      if (!activeGuardianAlarm) {
        return;
      }

      stopAlertLoop(
        'medicine',
      );

      setSnoozedGuardianAlarms(
        (current) => ({
          ...current,
          [activeGuardianAlarm.id]:
            Date.now() +
            SNOOZE_MS,
        }),
      );

      setActiveGuardianAlarmId(
        null,
      );

      window.speechSynthesis?.cancel();

      const medicationName =
        activeGuardianAlarm.pillName ||
        activeGuardianAlarm.title ||
        'medicine';

      const messageText =
        `${activeGuardianAlarmElderName} has snoozed ${medicationName}. Reminder will repeat in 2 minutes.`;

      toast({
        title:
          'Tablet Snoozed',
        description:
          messageText,
      });

      if (
        'Notification' in window &&
        Notification.permission ===
          'granted'
      ) {
        new Notification(
          'Tablet Snoozed',
          {
            body: messageText,
            icon: '/logo.svg',
          },
        );
      }

      addGuardianAlert({
        id: `ga-snooze-${Date.now()}`,
        type: 'medicine_missed',
        severity: 'warning',
        message:
          `Snoozed — ${messageText}`,
        time: new Date().toISOString(),
        acknowledged: false,
        elderName:
          activeGuardianAlarmElderName,
      });

      const caretakerAlert = {
        id: `watch-med-snoozed-${Date.now()}`,
        elder_name:
          activeGuardianAlarmElderName,
        type: 'missed_med',
        severity: 'warning',
        message:
          `${activeGuardianAlarmElderName} has snoozed ${medicationName}. Watch response: No.`,
        time: new Date().toISOString(),
        resolved: false,
      } as const;

      addCaretakerAlert(
        caretakerAlert,
      );

      void apiFetch(
        '/alerts',
        {
          method: 'POST',
          body: JSON.stringify(
            caretakerAlert,
          ),
        },
      ).catch(() => {});
    }, [
      activeGuardianAlarm,
      activeGuardianAlarmElderName,
      addGuardianAlert,
      addCaretakerAlert,
    ]);

  /*
   * -------------------------------------------------------
   * RESPONSE OVERLAY
   * -------------------------------------------------------
   */

  const startResponseOverlay =
    useCallback(
      (
        text: string,
        language: SupportedLanguage,
        durationMs: number =
          ASSISTANT_RESPONSE_MIN_DISPLAY_MS,
      ) => {
        setAssistantLanguage(
          language,
        );

        setResponseText(text);

        setShowResponseOverlay(
          true,
        );

        if (
          responseTimeoutRef.current
        ) {
          window.clearTimeout(
            responseTimeoutRef.current,
          );
        }

        responseTimeoutRef.current =
          window.setTimeout(
            () => {
              setShowResponseOverlay(
                false,
              );

              setResponseText('');

              setTranscript('');

              setAssistantStatus(
                'idle',
              );

              responseTimeoutRef.current =
                null;
            },
            Math.max(
              durationMs,
              ASSISTANT_RESPONSE_MIN_DISPLAY_MS,
            ),
          );
      },
      [],
    );

  /*
   * -------------------------------------------------------
   * LANGUAGE
   * -------------------------------------------------------
   */

  useEffect(() => {
    setAssistantLanguage(
      profileLanguage,
    );
  }, [profileLanguage]);

  /*
   * -------------------------------------------------------
   * CLOCK
   * -------------------------------------------------------
   */

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        setCurrentTime(
          new Date(),
        );

        setStepCount(
          (currentSteps) =>
            currentSteps +
            (Math.random() >
            0.6
              ? Math.floor(
                  Math.random() * 4,
                )
              : 0),
        );
      }, 1000);

    return () =>
      window.clearInterval(
        interval,
      );
  }, []);

  /*
   * -------------------------------------------------------
   * LOCAL REMINDER ALERTS
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    const now =
      Date.now();

    const nextDueReminder =
      reminders.find(
        (reminder) =>
          !reminder.triggered &&
          new Date(
            reminder.dueAt,
          ).getTime() <= now,
      );

    if (!nextDueReminder) {
      return;
    }

    setReminders(
      (currentReminders) =>
        currentReminders.map(
          (reminder) =>
            reminder.id ===
            nextDueReminder.id
              ? {
                  ...reminder,
                  triggered: true,
                }
              : reminder,
        ),
    );

    setActiveReminderId(
      nextDueReminder.id,
    );

    startResponseOverlay(
      nextDueReminder.message,
      nextDueReminder.language,
      45000,
    );

    speakText(
      nextDueReminder.message,
      nextDueReminder.language,
    );

    triggerAlert('medicine');

    toast({
      title:
        nextDueReminder.title,
      description:
        nextDueReminder.message,
    });
  }, [
    currentTime,
    open,
    reminders,
    startResponseOverlay,
  ]);

  /*
   * -------------------------------------------------------
   * GUARDIAN MEDICATION ALARM
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (
      !open ||
      activeGuardianAlarmId
    ) {
      return;
    }

    const now =
      currentTime.getTime();

    const nextDueGuardianReminder =
      guardianReminders.find(
        (reminder) => {
          if (reminder.verified) {
            return false;
          }

          if (
            reminder.elderId &&
            activeElder?.id &&
            reminder.elderId !==
              activeElder.id
          ) {
            return false;
          }

          const dueAt =
            getReminderDueAt(
              reminder,
              currentTime,
            );

          const alarmKey =
            getReminderAlarmKey(
              reminder,
              dueAt,
            );

          const snoozedUntil =
            snoozedGuardianAlarms[
              reminder.id
            ];

          if (
            dismissedGuardianAlarms[
              alarmKey
            ]
          ) {
            return false;
          }

          if (snoozedUntil) {
            return (
              snoozedUntil <=
              now
            );
          }

          return isReminderDueNow(
            reminder,
            dueAt,
            currentTime,
          );
        },
      );

    if (
      !nextDueGuardianReminder
    ) {
      return;
    }

    setAssistantLanguage(
      profileLanguage,
    );

    setActiveGuardianAlarmId(
      nextDueGuardianReminder.id,
    );

    startAlertLoop(
      'medicine',
    );

    const elderName =
      nextDueGuardianReminder.elderName ||
      activeElder.full_name ||
      'Usha';

    const alarmTitle =
      nextDueGuardianReminder.pillName ||
      nextDueGuardianReminder.title ||
      'Reminder';

    const spokenMessage =
      profileLanguage ===
      'kn-IN'
        ? `${elderName} ಅವರ ${alarmTitle} ಸಮಯವಾಗಿದೆ.`
        : profileLanguage ===
            'hi-IN'
          ? `${elderName} के लिए ${alarmTitle} का समय हो गया है।`
          : `Time for ${elderName}'s ${alarmTitle}.`;

    speakText(
      spokenMessage,
      profileLanguage,
    );

    toast({
      title:
        nextDueGuardianReminder.title,
      description:
        spokenMessage,
    });
  }, [
    activeElder?.id,
    activeElder.full_name,
    activeGuardianAlarmId,
    currentTime,
    dismissedGuardianAlarms,
    guardianReminders,
    open,
    profileLanguage,
    snoozedGuardianAlarms,
  ]);

  /*
   * -------------------------------------------------------
   * AUTO SNOOZE
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!activeGuardianAlarm) {
      stopAlertLoop(
        'medicine',
      );

      if (
        alarmTimeoutRef.current
      ) {
        window.clearTimeout(
          alarmTimeoutRef.current,
        );

        alarmTimeoutRef.current =
          null;
      }

      return;
    }

    if (
      alarmTimeoutRef.current
    ) {
      window.clearTimeout(
        alarmTimeoutRef.current,
      );
    }

    alarmTimeoutRef.current =
      window.setTimeout(
        () => {
          snoozeGuardianAlarm();
        },
        WATCH_ALARM_RESPONSE_TIMEOUT_MS,
      );

    return () => {
      if (
        alarmTimeoutRef.current
      ) {
        window.clearTimeout(
          alarmTimeoutRef.current,
        );

        alarmTimeoutRef.current =
          null;
      }
    };
  }, [
    activeGuardianAlarm,
    snoozeGuardianAlarm,
  ]);

  /*
   * -------------------------------------------------------
   * CLEANUP
   * -------------------------------------------------------
   */

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();

      stopAlertLoop(
        'medicine',
      );

      window.speechSynthesis?.cancel();

      if (
        responseTimeoutRef.current
      ) {
        window.clearTimeout(
          responseTimeoutRef.current,
        );
      }

      if (
        alarmTimeoutRef.current
      ) {
        window.clearTimeout(
          alarmTimeoutRef.current,
        );
      }
    };
  }, []);

  /*
   * -------------------------------------------------------
   * CLOSE WATCH
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (open) {
      return;
    }

    recognitionRef.current?.stop();

    stopAlertLoop(
      'medicine',
    );

    stopSpeaking();

    window.speechSynthesis?.cancel();

    setIsListening(false);

    setActiveReminderId(
      null,
    );

    setActiveGuardianAlarmId(
      null,
    );

    setShowResponseOverlay(
      false,
    );

    setResponseText('');

    setTranscript('');

    setAssistantStatus(
      'idle',
    );
  }, [open]);

  /*
   * -------------------------------------------------------
   * MAIN AI QUERY
   * -------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This function does NOT try to guess what the user wants.
   *
   * Normal speech goes directly to:
   *
   *     /api/assistant/chat
   *
   * Gemini then decides how to answer.
   * -------------------------------------------------------
   */

  const handleVoiceQuery =
    useCallback(
      async (
        speechText: string,
      ) => {
        const cleanSpeechText =
          speechText.trim();

        if (
          !cleanSpeechText
        ) {
          return;
        }

        /*
         * Stop any previous speech.
         */
        stopSpeaking();

        stopAlertLoop(
          'medicine',
        );

        window.speechSynthesis?.cancel();

        /*
         * Detect language from what
         * the user actually said.
         */
        const detectedLanguage =
          detectLanguageFromText(
            cleanSpeechText,
            assistantLanguage,
          );

        setTranscript(
          cleanSpeechText,
        );

        setAssistantLanguage(
          detectedLanguage,
        );

        setResponseText('');

        setShowResponseOverlay(
          true,
        );

        setAssistantStatus(
          'processing',
        );

        /*
         * -------------------------------------------------
         * LOCAL WATCH COMMANDS
         * -------------------------------------------------
         *
         * Only actual watch commands are
         * handled locally.
         *
         * Everything else goes to Gemini.
         */

        const result =
          processVoiceCommand(
            cleanSpeechText,
            medicationContext,
            detectedLanguage,
          );

        if (
          result.actionType ===
            'reminder' ||
          result.actionType ===
            'youtube'
        ) {
          setAssistantStatus(
            'speaking',
          );

          startResponseOverlay(
            result.responseText,
            result.responseLanguage,
            45000,
          );

          if (
            result.reminder
          ) {
            setReminders(
              (
                currentReminders,
              ) => [
                result.reminder!,
                ...currentReminders,
              ],
            );

            toast({
              title:
                result.reminder
                  .title,
              description:
                result.reminder
                  .message,
            });
          }

          if (
            result.action
              ?.type ===
            'youtube'
          ) {
            openYoutubeSearch(
              result.action
                .query,
              result.responseLanguage,
            );
          }

          speakText(
            result.responseText,
            result.responseLanguage,
          );

          return;
        }

        /*
         * -------------------------------------------------
         * NORMAL CONVERSATION -> GEMINI
         * -------------------------------------------------
         */

        try {
          const response =
            await apiFetch<AssistantChatResponse>(
              '/assistant/chat',
              {
                method: 'POST',

                body: JSON.stringify({
                  message:
                    cleanSpeechText,

                  elderId:
                    activeElder?.id,

                  conversationHistory,
                }),
              },
            );

          const answer =
            response?.response?.trim();

          if (!answer) {
            throw new Error(
              'Assistant returned an empty response.',
            );
          }

          /*
           * Save both sides of the conversation.
           *
           * This allows:
           *
           * User: What is data?
           * AI: ...
           *
           * User: Give me an example.
           * AI: ...
           *
           * to work naturally.
           */
          setConversationHistory(
            (current) =>
              [
                ...current,

                {
                  role: 'user',
                  content:
                    cleanSpeechText,
                },

                {
                  role: 'model',
                  content: answer,
                },
              ].slice(-12),
          );

          setAssistantStatus(
            'speaking',
          );

          /*
           * Longer answers stay visible longer.
           *
           * Minimum = 45 seconds.
           * Maximum = 90 seconds.
           */
          const estimatedReadingTime =
            Math.max(
              45000,
              Math.min(
                90000,
                answer.length *
                  100,
              ),
            );

          startResponseOverlay(
            answer,
            detectedLanguage,
            estimatedReadingTime,
          );

          /*
           * Speak the ACTUAL Gemini response.
           */
          speakText(
            answer,
            detectedLanguage,
          );

          toast({
            title:
              '🗣️ Assistant',
            description:
              answer,
          });
        } catch (error) {
          console.error(
            'Assistant request failed:',
            error,
          );

          setAssistantStatus(
            'error',
          );

          let errorMessage =
            'Sorry, I cannot connect to the AI assistant right now. Please try again.';

          if (
            detectedLanguage ===
            'kn-IN'
          ) {
            errorMessage =
              'ಕ್ಷಮಿಸಿ, ಈಗ AI ಸಹಾಯಕನಿಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
          } else if (
            detectedLanguage ===
            'hi-IN'
          ) {
            errorMessage =
              'क्षमा करें, अभी AI सहायक से कनेक्ट नहीं हो पा रहा है। कृपया फिर से कोशिश करें।';
          }

          startResponseOverlay(
            errorMessage,
            detectedLanguage,
            6000,
          );

          speakText(
            errorMessage,
            detectedLanguage,
          );

          toast({
            title:
              'Assistant Error',
            description:
              errorMessage,
          });
        }
      },
      [
        activeElder?.id,
        assistantLanguage,
        conversationHistory,
        medicationContext,
        setReminders,
        startResponseOverlay,
      ],
    );

  /*
   * -------------------------------------------------------
   * START MICROPHONE
   * -------------------------------------------------------
   */

  const startListening =
    async () => {
      /*
       * Stop any old speech first.
       */
      stopSpeaking();

      window.speechSynthesis?.cancel();

      /*
       * Stop an old recognition instance.
       */
      recognitionRef.current?.stop();

      if (
        !isSpeechRecognitionSupported()
      ) {
        setAssistantStatus(
          'error',
        );

        startResponseOverlay(
          languageConfig.micUnavailable,
          assistantLanguage,
          5000,
        );

        return;
      }

      setAssistantStatus(
        'listening',
      );

      setTranscript('');

      setResponseText('');

      setShowResponseOverlay(
        true,
      );

      setIsListening(true);

      try {
        const permission =
          await requestMicrophonePermission();

        if (
          !permission.granted
        ) {
          setAssistantStatus(
            'error',
          );

          startResponseOverlay(
            languageConfig.micPermission,
            assistantLanguage,
            5000,
          );

          setIsListening(false);

          return;
        }

        /*
         * Create recognition using
         * current assistant language.
         */
        const recognition =
          createSpeechRecognition(
            assistantLanguage,
          );

        if (!recognition) {
          setAssistantStatus(
            'error',
          );

          startResponseOverlay(
            languageConfig.voiceError,
            assistantLanguage,
            5000,
          );

          setIsListening(false);

          return;
        }

        recognitionRef.current =
          recognition;

        /*
         * -------------------------------------------------
         * SPEECH RESULT
         * -------------------------------------------------
         */

        recognition.onresult =
          (event) => {
            const speechText =
              Array.from(
                event.results,
              )
                .map(
                  (result) =>
                    result[0]
                      ?.transcript ||
                    '',
                )
                .join(' ')
                .trim();

            if (
              !speechText
            ) {
              return;
            }

            /*
             * IMPORTANT:
             *
             * Stop microphone recognition
             * immediately after receiving
             * a complete result.
             *
             * This prevents recognition from
             * hanging around and causing delayed
             * commands.
             */
            recognition.stop();

            recognitionRef.current =
              null;

            setIsListening(
              false,
            );

            /*
             * Process immediately.
             */
            void handleVoiceQuery(
              speechText,
            );
          };

        /*
         * -------------------------------------------------
         * SPEECH ERROR
         * -------------------------------------------------
         */

        recognition.onerror =
          (event) => {
            recognitionRef.current =
              null;

            setIsListening(
              false,
            );

            if (
              event.error ===
              'no-speech'
            ) {
              setAssistantStatus(
                'idle',
              );

              setShowResponseOverlay(
                false,
              );

              setResponseText('');

              toast({
                title:
                  'No speech detected',
                description:
                  'Please speak closer to the microphone.',
              });

              return;
            }

            const nextMessage =
              event.error ===
              'not-allowed'
                ? languageConfig.micPermission
                : languageConfig.voiceError;

            setAssistantStatus(
              'error',
            );

            startResponseOverlay(
              nextMessage,
              assistantLanguage,
              5000,
            );
          };

        /*
         * -------------------------------------------------
         * SPEECH END
         * -------------------------------------------------
         */

        recognition.onend =
          () => {
            setIsListening(
              false,
            );

            /*
             * Only return to idle if
             * Gemini isn't processing.
             */
            setAssistantStatus(
              (current) =>
                current ===
                'listening'
                  ? 'idle'
                  : current,
            );
          };

        /*
         * START MICROPHONE
         */
        recognition.start();
      } catch (err) {
        console.error(
          'Voice recognition failed:',
          err,
        );

        recognitionRef.current =
          null;

        setAssistantStatus(
          'error',
        );

        startResponseOverlay(
          languageConfig.voiceError,
          assistantLanguage,
          5000,
        );

        setIsListening(false);
      }
    };

  /*
   * -------------------------------------------------------
   * UI
   * -------------------------------------------------------
   */

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
    >
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          className={cn(
            'rounded-lg border-teal/30 bg-white/70 text-navy shadow-sm transition-all hover:bg-white',
            buttonClassName,
          )}
        >
          <Sparkles className="mr-2 h-4 w-4 text-teal" />
          Watch Simulator
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-5xl border-none bg-transparent p-0 shadow-none sm:rounded-[2rem]">
        <div className="overflow-hidden rounded-[2rem] border border-white/20 bg-slate-950 text-white shadow-2xl">

          <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),transparent_38%),linear-gradient(145deg,#0f172a,#020617)] p-6 sm:p-8">

            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_35%,rgba(45,212,191,0.12))]" />

            <DialogHeader className="relative mb-6 text-left">
              <Badge className="mb-3 w-fit border border-teal/30 bg-teal/10 text-teal hover:bg-teal/10">
                Multilingual Watch Preview
              </Badge>

              <DialogTitle className="text-2xl font-display text-white">
                Watch Simulator
              </DialogTitle>

              <DialogDescription className="max-w-lg text-slate-300">
                GuardianWatch helps elders stay
                safe with timely medicine reminders
                and live health updates.
              </DialogDescription>
            </DialogHeader>

            <div className="relative mx-auto flex w-full max-w-[330px] items-center justify-center py-6">

              <div className="absolute h-[360px] w-[160px] rounded-[3rem] bg-slate-800/90 blur-2xl" />

              <div className="relative animate-fade-in">

                <div className="absolute left-1/2 top-[-62px] h-16 w-24 -translate-x-1/2 rounded-full bg-slate-700/80" />

                <div className="absolute bottom-[-62px] left-1/2 h-16 w-24 -translate-x-1/2 rounded-full bg-slate-700/80" />

                <div className="relative h-[460px] w-[290px] rounded-[3rem] border border-white/10 bg-slate-900 p-3 shadow-[0_24px_70px_rgba(15,23,42,0.65)]">

                  <div className="relative flex h-full flex-col overflow-hidden rounded-[2.4rem] border border-teal/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.84))] p-4">

                    {/* -------------------------------- */}
                    {/* MEDICATION ALARM                  */}
                    {/* -------------------------------- */}

                    {activeGuardianAlarm ? (
                      <div className="absolute inset-0 z-30 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(15,23,42,0.99),rgba(2,6,23,0.98))] px-5 py-6">

                        <div className="flex items-center justify-between text-[11px] text-slate-300">

                          <span>
                            {formatWatchTime(
                              currentTime,
                              assistantLanguage,
                            )}
                          </span>

                          <Bell className="h-4 w-4 animate-pulse text-amber-200" />

                        </div>

                        <div className="flex flex-1 flex-col items-center justify-center text-center">

                          <div className="mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-amber-200/30 bg-amber-200/10">

                            {activeGuardianAlarm.photo ? (
                              <img
                                src={
                                  activeGuardianAlarm.photo
                                }
                                alt={
                                  activeGuardianAlarm.title
                                }
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Pill className="h-12 w-12 text-amber-200" />
                            )}

                          </div>

                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100/80">
                            {alarmCopy.title}
                          </p>

                          <p className="mt-3 text-xl font-semibold leading-8 text-white">
                            {alarmCopy.message}
                          </p>

                          <p className="mt-3 text-sm leading-5 text-amber-50/90">
                            {activeGuardianAlarm.pillName ||
                              activeGuardianAlarm.title}

                            {activeGuardianAlarm.dosage
                              ? ` - ${activeGuardianAlarm.dosage}`
                              : ''}
                          </p>

                        </div>

                        <div className="grid grid-cols-2 gap-3">

                          <button
                            type="button"
                            onClick={
                              dismissGuardianAlarm
                            }
                            className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
                          >
                            {alarmCopy.yes}
                          </button>

                          <button
                            type="button"
                            onClick={
                              snoozeGuardianAlarm
                            }
                            className="rounded-lg bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
                          >
                            {alarmCopy.no}
                          </button>

                        </div>

                      </div>
                    ) : null}

                    {/* -------------------------------- */}
                    {/* AI RESPONSE OVERLAY              */}
                    {/* -------------------------------- */}

                    {(showResponseOverlay ||
                      assistantStatus ===
                        'listening' ||
                      assistantStatus ===
                        'processing') &&
                    !activeGuardianAlarm ? (
                      <div className="absolute inset-0 z-20 flex flex-col justify-between bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.96))] px-5 py-6">

                        <div className="flex items-center justify-between text-[11px] text-slate-300">

                          <span>
                            {formatWatchTime(
                              currentTime,
                              assistantLanguage,
                            )}
                          </span>

                          <Bell className="h-4 w-4 text-teal" />

                        </div>

                        <div className="flex w-full flex-1 flex-col items-center justify-center text-center">

                          {assistantStatus ===
                            'listening' && (
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-teal/15 animate-pulse">
                              <span className="text-3xl">
                                🎙️
                              </span>
                            </div>
                          )}

                          {assistantStatus ===
                            'processing' && (
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-teal/15">
                              <span className="text-3xl animate-pulse">
                                ⏳
                              </span>
                            </div>
                          )}

                          {assistantStatus ===
                            'speaking' && (
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-teal/15">
                              <span className="text-3xl">
                                🗣️
                              </span>
                            </div>
                          )}

                          {assistantStatus ===
                            'error' && (
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-red-500/10">
                              <span className="text-3xl">
                                ❌
                              </span>
                            </div>
                          )}

                          <div className="max-h-[210px] w-full overflow-y-auto px-2">

                            <p className="text-lg font-semibold leading-8 text-white">
                              {assistantStatus ===
                              'listening'
                                ? assistantLanguage ===
                                  'hi-IN'
                                  ? 'सुन रहा है...'
                                  : assistantLanguage ===
                                      'kn-IN'
                                    ? 'ಕೇಳುತ್ತಿದೆ...'
                                    : 'Listening...'
                                : assistantStatus ===
                                    'processing'
                                  ? assistantLanguage ===
                                    'hi-IN'
                                    ? 'सोच रहा हूँ...'
                                    : assistantLanguage ===
                                        'kn-IN'
                                      ? 'ಯೋಚಿಸುತ್ತಿದೆ...'
                                      : 'Thinking...'
                                  : responseText}
                            </p>

                          </div>

                          {transcript &&
                          assistantStatus !==
                            'listening' ? (
                            <p className="mt-4 max-w-[220px] rounded-xl border border-white/5 bg-black/35 px-3 py-1.5 text-xs leading-5 text-slate-400">
                              {languageConfig.heardPrompt}{' '}
                              "{transcript}"
                            </p>
                          ) : null}

                        </div>

                        <p className="text-center text-[10px] text-slate-500">

                          {assistantStatus ===
                          'listening'
                            ? 'Speak naturally'

                            : assistantStatus ===
                                'processing'
                              ? 'Thinking...'

                              : assistantStatus ===
                                  'error'
                                ? 'Assistant'

                                : 'Answering...'}
                        </p>

                      </div>
                    ) : null}

                    {/* -------------------------------- */}
                    {/* WATCH HEADER                      */}
                    {/* -------------------------------- */}

                    <div className="mb-4 flex items-center justify-between text-[11px] text-slate-300">

                      <button
                        type="button"
                        onClick={() =>
                          setAssistantLanguage(
                            assistantLanguage ===
                              'kn-IN'
                              ? 'en-IN'
                              : 'kn-IN',
                          )
                        }
                        className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-teal transition-colors hover:bg-teal/20"
                      >
                        <span>
                          🌐
                        </span>

                        {assistantLanguage ===
                        'kn-IN'
                          ? 'ಕನ್ನಡ (KN)'
                          : 'English (EN)'}
                      </button>

                      <div className="flex items-center gap-2">

                        <Signal className="h-3.5 w-3.5 text-emerald-300" />

                        <Wifi className="h-3.5 w-3.5 text-emerald-300" />

                        <BatteryMedium className="h-3.5 w-3.5 text-emerald-300" />

                      </div>

                    </div>

                    {/* -------------------------------- */}
                    {/* GUARDIAN MODE                     */}
                    {/* -------------------------------- */}

                    <div className="mb-3 rounded-[1.8rem] border border-white/10 bg-white/5 px-4 py-3">

                      <div className="flex items-center justify-between">

                        <div>

                          <p className="text-[10px] uppercase tracking-[0.32em] text-teal/80">
                            Guardian Mode
                          </p>

                          <p className="mt-1 text-3xl font-semibold text-white">
                            {formatWatchTime(
                              currentTime,
                              assistantLanguage,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {activeElder?.full_name ||
                              'Registered elder'}
                          </p>

                        </div>

                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/15">
                          <Activity className="h-6 w-6 text-teal" />
                        </div>

                      </div>

                    </div>

                    {/* -------------------------------- */}
                    {/* VITALS                            */}
                    {/* -------------------------------- */}

                    <div className="flex-1 space-y-3 overflow-hidden">

                      <div className="grid grid-cols-3 gap-2">

                        <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-3">

                          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
                            <HeartPulse className="h-4 w-4 text-rose-300" />
                            <span>
                              Heart
                            </span>
                          </div>

                          <p className="text-lg font-semibold text-white">
                            {
                              activeVitals.heart_rate
                            }
                          </p>

                          <p className="text-[11px] text-slate-400">
                            bpm
                          </p>

                        </div>

                        <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-3">

                          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
                            <Activity className="h-4 w-4 text-cyan-300" />
                            <span>
                              SpO2
                            </span>
                          </div>

                          <p className="text-lg font-semibold text-white">
                            {
                              activeVitals.spo2
                            }%
                          </p>

                          <p className="text-[11px] text-slate-400">
                            oxygen
                          </p>

                        </div>

                        <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-3">

                          <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-400">
                            <Footprints className="h-4 w-4 text-emerald-300" />
                            <span>
                              Steps
                            </span>
                          </div>

                          <p className="text-lg font-semibold text-white">
                            {stepCount}
                          </p>

                          <p className="text-[11px] text-slate-400">
                            walked
                          </p>

                        </div>

                      </div>

                      {/* -------------------------------- */}
                      {/* ACTIVE REMINDER                  */}
                      {/* -------------------------------- */}

                      {activeReminder ? (
                        <div className="animate-fade-in rounded-[1.8rem] border border-amber-300/40 bg-amber-300/12 p-4">

                          <div className="mb-2 flex items-center gap-3">

                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-200/20">
                              <Pill className="h-6 w-6 text-amber-200" />
                            </div>

                            <div>

                              <p className="text-sm font-semibold text-white">
                                Reminder Alert
                              </p>

                              <p className="text-xs text-amber-100/80">
                                {
                                  activeReminder.timeLabel
                                }
                              </p>

                            </div>

                          </div>

                          <p className="text-sm leading-6 text-amber-50">
                            {
                              activeReminder.message
                            }
                          </p>

                        </div>
                      ) : (
                        <div className="rounded-[1.8rem] border border-dashed border-white/15 bg-white/[0.03] p-4">

                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">

                            <Bell className="h-4 w-4 text-teal" />

                            <span>
                              Next reminders
                            </span>

                          </div>

                          {watchUpcomingReminders.length ? (
                            <div className="space-y-2">

                              {watchUpcomingReminders.map(
                                (
                                  reminder,
                                ) => (
                                  <button
                                    key={
                                      reminder.id
                                    }
                                    type="button"
                                    onClick={() =>
                                      setActiveGuardianAlarmId(
                                        reminder.id,
                                      )
                                    }
                                    className="group flex w-full items-center justify-between rounded-2xl border border-transparent bg-slate-950/70 px-3 py-2 text-left text-xs text-slate-200 transition-all hover:border-teal/30 hover:bg-slate-900"
                                  >

                                    <span className="max-w-[140px] truncate transition-colors group-hover:text-teal">
                                      {
                                        reminder.title
                                      }
                                    </span>

                                    <span className="font-medium text-teal">
                                      {
                                        reminder.timeLabel
                                      }
                                    </span>

                                  </button>
                                ),
                              )}

                            </div>
                          ) : (
                            <p className="text-sm text-slate-400">
                              No pending reminders yet.
                            </p>
                          )}

                        </div>
                      )}

                    </div>

                    {/* -------------------------------- */}
                    {/* MICROPHONE                        */}
                    {/* -------------------------------- */}

                    <div className="mt-4 flex justify-center">

                      <button
                        type="button"
                        onClick={
                          startListening
                        }
                        disabled={
                          assistantStatus ===
                          'processing'
                        }
                        className={cn(
                          'flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-teal text-slate-950 shadow-lg transition-transform duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60',

                          isListening &&
                            'animate-pulse ring-8 ring-teal/20',
                        )}
                        aria-label="Start voice input"
                      >
                        <Mic className="h-7 w-7" />
                      </button>

                    </div>

                    {isListening ? (
                      <p className="mt-3 text-center text-xs text-slate-400">
                        Listening...
                      </p>
                    ) : null}

                  </div>
                </div>
              </div>
            </div>

            {/* ------------------------------------------ */}
            {/* QUICK TEST BUTTONS                         */}
            {/* ------------------------------------------ */}

            <div className="mt-4 flex flex-col items-center justify-center gap-3">

              <p className="text-xs text-slate-500">
                Quick tests
              </p>

              <div className="flex max-w-lg flex-wrap items-center justify-center gap-2">

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'Hello, how are you?',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  🎙️ Hello
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'What is data?',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  🧠 What is data?
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'What are you doing?',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  🤖 What are you doing?
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'Tell me about artificial intelligence.',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  ✨ AI
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'How is my health and vitals status?',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  ❤️ Vitals
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleVoiceQuery(
                      'ನಮಸ್ಕಾರ, ಹೇಗಿದ್ದೀರ?',
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 transition-colors hover:border-teal/50 hover:bg-teal/20"
                >
                  🇮🇳 ಕನ್ನಡ
                </button>

              </div>

            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WatchSimulator;