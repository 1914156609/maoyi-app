<script>
import { restoreSession } from "./lib/session.js";
import { notify } from "./lib/store.js";
export default {
  onLaunch() {
    restoreSession().catch(e=>notify(e.message));
    // #ifdef H5
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", (event) => {
        const button = event.target.closest?.('uni-button[role="button"]');
        if (
          !button ||
          button.hasAttribute("disabled") ||
          !["Enter", " "].includes(event.key)
        )
          return;
        event.preventDefault();
        button.click();
      });
    }
    // #endif
  },
};
</script>
<style>
@import "./styles/theme.css";
</style>
