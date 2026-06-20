// A one-shot intent to reopen the in-progress session, set when the user taps the
// session chrono. FitCalendrier (which hosts the session view) may be unmounted
// at that moment, so the intent is read on its next mount rather than via a live
// callback. FitApp switches to the Calendrier tab, which (re)mounts FitCalendrier.

let pending = false;

export const requestSessionResume = (): void => { pending = true; };

// Read and clear the intent.
export const consumeSessionResume = (): boolean => {
  const p = pending;
  pending = false;
  return p;
};
