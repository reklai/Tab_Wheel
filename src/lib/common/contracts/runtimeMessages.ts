// Runtime message contracts between background, content scripts, and extension pages.

export type ContentRuntimeMessage =
  | { type: "TABWHEEL_PING" }
  | { type: "GET_SCROLL" }
  | ({ type: "SET_SCROLL"; smooth?: boolean } & ScrollData)
  | { type: "TABWHEEL_STATUS"; message: string }
  | { type: "OPEN_TABWHEEL_HELP" };

export type BackgroundRuntimeMessage =
  | { type: "TABWHEEL_CONTENT_READY" }
  | { type: "TABWHEEL_CYCLE"; direction: "prev" | "next" }
  | { type: "TABWHEEL_REFRESH_CURRENT_TAB"; windowId?: number }
  | { type: "TABWHEEL_GET_OVERVIEW"; windowId?: number }
  | { type: "TABWHEEL_TOGGLE_CYCLE_SCOPE"; windowId?: number }
  | { type: "TABWHEEL_SET_CYCLE_SCOPE"; cycleScope: TabWheelCycleScope; windowId?: number; suppressPageStatus?: boolean }
  | { type: "TABWHEEL_OPEN_SEARCH_TAB"; query: string; windowId?: number }
  | { type: "TABWHEEL_ACTIVATE_MOST_RECENT_TAB"; windowId?: number }
  | { type: "TABWHEEL_CLOSE_CURRENT_TAB_AND_ACTIVATE_RECENT"; windowId?: number }
  | ({ type: "TABWHEEL_SAVE_SCROLL_POSITION" } & ScrollData)
  | { type: "TABWHEEL_OPEN_HELP" }
  | { type: "TABWHEEL_OPEN_OPTIONS" };
