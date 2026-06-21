/** Shared state type for the group-wall post action (D29: no types in 'use server' files). */
export interface PostActionState {
  ok?: boolean;
  error?: string;
}

export const EMPTY_POST_STATE: PostActionState = {};
