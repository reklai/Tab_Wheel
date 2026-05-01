// Runtime message contracts between background, content scripts, and extension pages.

export type ContentRuntimeMessage =
  | { type: "TABWHEEL_PING" }
  | { type: "GET_SCROLL" }
  | { type: "SET_SCROLL"; scrollX: number; scrollY: number; smooth?: boolean }
  | { type: "TABWHEEL_STATUS"; message: string }
  | { type: "TABWHEEL_TAG_STATE_CHANGED"; isTagged: boolean; count: number; cycleScope: TabWheelCycleScope }
  | { type: "OPEN_TABWHEEL_HELP" };

export type BackgroundRuntimeMessage =
  | { type: "TABWHEEL_CONTENT_READY" }
  | { type: "TABWHEEL_CYCLE"; direction: "prev" | "next" }
  | { type: "TABWHEEL_REFRESH_CURRENT_TAB"; windowId?: number }
  | { type: "TABWHEEL_GET_OVERVIEW"; windowId?: number }
  | { type: "TABWHEEL_TOGGLE_CURRENT_TAG"; windowId?: number }
  | { type: "TABWHEEL_REMOVE_TAGGED_TAB"; tabId: number; windowId?: number }
  | { type: "TABWHEEL_CLEAR_TAGGED_TABS"; windowId?: number }
  | { type: "TABWHEEL_LIST_TAGGED_TABS"; windowId?: number }
  | { type: "TABWHEEL_ACTIVATE_TAGGED_TAB"; tabId: number; windowId?: number }
  | { type: "TABWHEEL_TOGGLE_CYCLE_SCOPE"; windowId?: number }
  | { type: "TABWHEEL_SET_CYCLE_SCOPE"; cycleScope: TabWheelCycleScope; windowId?: number; suppressPageStatus?: boolean }
  | { type: "TABWHEEL_SAVE_SCROLL_POSITION"; scrollX: number; scrollY: number }
  | { type: "TABWHEEL_OPEN_HELP" }
  | { type: "TABWHEEL_OPEN_OPTIONS" };
