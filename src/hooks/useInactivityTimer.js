/**
 * useInactivityTimer
 *
 * Detects user inactivity and triggers a callback after a configurable idle
 * period. Used exclusively inside the staff portal (PortalLayout) to
 * auto-sign-out staff who leave the portal open and unattended.
 *
 * Does NOT apply to public website pages.
 * Does NOT store or log any sensitive data.
 *
 * @param {object} options
 * @param {number} options.idleMs        - ms of inactivity before onIdle fires (default 10 min)
 * @param {number} options.warningMs     - ms to wait after onIdle before onExpire fires (default 60 s)
 * @param {function} options.onIdle      - called when idle threshold is reached
 * @param {function} options.onExpire    - called when warning grace period expires (sign out)
 * @param {boolean}  options.enabled     - set false to disable (e.g. during sign-in page)
 *
 * Returns { resetTimer } — call this to reset the idle clock (e.g. "Stay Signed In").
 */
import { useEffect, useRef, useCallback } from "react";

const ACTIVITY_EVENTS = [
  "mousedown", "mousemove", "keydown",
  "scroll",    "touchstart", "pointermove", "click",
];

export function useInactivityTimer({
  idleMs    = 10 * 60 * 1000,  // 10 minutes
  warningMs = 60 * 1000,        // 60 seconds
  onIdle,
  onExpire,
  enabled   = true,
}) {
  const idleTimer    = useRef(null);
  const expireTimer  = useRef(null);
  const isIdle       = useRef(false);

  const clearTimers = useCallback(() => {
    if (idleTimer.current)   clearTimeout(idleTimer.current);
    if (expireTimer.current) clearTimeout(expireTimer.current);
    idleTimer.current   = null;
    expireTimer.current = null;
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    isIdle.current = false;

    idleTimer.current = setTimeout(() => {
      isIdle.current = true;
      onIdle?.();

      // Start grace period — if no "Stay Signed In", sign out
      expireTimer.current = setTimeout(() => {
        onExpire?.();
      }, warningMs);
    }, idleMs);
  }, [enabled, idleMs, warningMs, onIdle, onExpire, clearTimers]);

  useEffect(() => {
    if (!enabled) return;

    // Start the timer immediately
    resetTimer();

    // Any user activity resets the timer (but not while the warning is showing)
    const handleActivity = () => {
      if (!isIdle.current) resetTimer();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  }, [enabled, resetTimer, clearTimers]);

  return { resetTimer };
}
