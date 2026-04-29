// Runtime message contracts between background, content scripts, and extension pages.

export type ContentRuntimeMessage =
  | { type: "GET_SCROLL" }
  | { type: "SET_SCROLL"; scrollX: number; scrollY: number; smooth?: boolean }
  | { type: "TABWHEEL_STATUS"; message: string }
  | { type: "TABWHEEL_TAG_STATE_CHANGED"; isTagged: boolean; count: number }
  | { type: "OPEN_TABWHEEL_HELP" };

export type BackgroundRuntimeMessage =
  | { type: "TABWHEEL_GET_CURRENT_STATE" }
  | { type: "TABWHEEL_TAG_CURRENT"; windowId?: number }
  | { type: "TABWHEEL_REMOVE_CURRENT"; windowId?: number }
  | { type: "TABWHEEL_REMOVE_TAB"; tabId: number; windowId?: number }
  | { type: "TABWHEEL_CLEAR_WINDOW"; windowId?: number }
  | { type: "TABWHEEL_LIST"; windowId?: number }
  | { type: "TABWHEEL_ACTIVATE"; tabId: number; windowId?: number }
  | { type: "TABWHEEL_CYCLE"; direction: "prev" | "next" }
  | { type: "TABWHEEL_SAVE_SCROLL_POSITION"; scrollX: number; scrollY: number }
  | { type: "TABWHEEL_OPEN_HELP" }
  | { type: "TABWHEEL_OPEN_OPTIONS" };
