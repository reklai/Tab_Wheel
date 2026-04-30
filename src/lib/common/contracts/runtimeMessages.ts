// Runtime message contracts between background, content scripts, and extension pages.

export type ContentRuntimeMessage =
  | { type: "GET_SCROLL" }
  | { type: "SET_SCROLL"; scrollX: number; scrollY: number; smooth?: boolean }
  | { type: "OPEN_TABWHEEL_HELP" };

export type BackgroundRuntimeMessage =
  | { type: "TABWHEEL_CYCLE"; direction: "prev" | "next" }
  | { type: "TABWHEEL_GET_OVERVIEW"; windowId?: number }
  | { type: "TABWHEEL_SAVE_SCROLL_POSITION"; scrollX: number; scrollY: number }
  | { type: "TABWHEEL_OPEN_HELP" }
  | { type: "TABWHEEL_OPEN_OPTIONS" };
