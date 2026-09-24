import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Badge } from '@capawesome/capacitor-badge';
import { Capacitor } from '@capacitor/core';

class NotificationService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.initialized = false;
  }

  async init() {
    if (this.initialized || !this.isNative) return;
    this.initialized = true;

    try {
      // 1. Request local notification permissions if not yet granted
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      // 2. Schedule daily revision reminder if not already scheduled
      await this.scheduleDailyStudyReminder();
    } catch (err) {
      console.warn('[NotificationService] Init error:', err);
    }
  }

  async scheduleDailyStudyReminder() {
    if (!this.isNative) return;
    try {
      const pending = await LocalNotifications.getPending();
      const alreadyScheduled = pending.notifications.some(n => n.id === 1001);
      if (alreadyScheduled) return;

      // Schedule daily notification at 7:00 PM (19:00)
      const now = new Date();
      const scheduleTime = new Date();
      scheduleTime.setHours(19, 0, 0, 0);
      if (scheduleTime <= now) {
        scheduleTime.setDate(scheduleTime.getDate() + 1);
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: 1001,
            title: 'Study Time — NextBridge',
            body: 'Keep up your daily progress! Time to continue your video lectures and notes.',
            schedule: {
              at: scheduleTime,
              repeats: true,
              every: 'day'
            },
            sound: 'beep.wav',
            smallIcon: 'ic_launcher'
          }
        ]
      });
    } catch (err) {
      console.warn('[NotificationService] Failed to schedule study reminder:', err);
    }
  }

  async sendImmediateNotification(title, body) {
    if (!this.isNative) return;
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 9000) + 1000,
            title,
            body,
            schedule: { at: new Date(Date.now() + 500) },
            smallIcon: 'ic_launcher'
          }
        ]
      });
    } catch (err) {
      console.warn('[NotificationService] Immediate notification error:', err);
    }
  }

  async setAppBadge(count) {
    if (!this.isNative) return;
    try {
      if (count > 0) {
        await Badge.set({ count });
      } else {
        await Badge.clear();
      }
    } catch (err) {
      console.warn('[NotificationService] Badge error:', err);
    }
  }

  async clearAppBadge() {
    if (!this.isNative) return;
    try {
      await Badge.clear();
    } catch (err) {
      console.warn('[NotificationService] Badge clear error:', err);
    }
  }
}

export const notificationService = new NotificationService();
