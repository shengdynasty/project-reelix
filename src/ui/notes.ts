/** The note under the player with `next` added after `current`, once: a later note never hides the planner's. */
export const addNote = (current: string | null, next: string): string => (!current ? next : current.includes(next) ? current : `${current} ${next}`)
