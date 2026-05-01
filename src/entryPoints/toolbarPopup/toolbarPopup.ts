// Browser-action popup entrypoint for TabWheel controls.

import { mountTabWheelPopup } from "../../lib/ui/popup/tabWheelPopup";

document.addEventListener("DOMContentLoaded", () => {
  mountTabWheelPopup(document, {
    announceUnavailable: true,
    onClose: () => window.close(),
  });
});
