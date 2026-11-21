const params = new URLSearchParams(location.search);
const site = params.get("site");
if (site) document.getElementById("siteName").textContent = site;

document.getElementById("backBtn").addEventListener("click", async () => {
  const state = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_STATE" }, resolve)
  );
  if (state && state.focusTabId) {
    try {
      await chrome.tabs.update(state.focusTabId, { active: true });
    } catch (e) {
      // tab tập trung không còn tồn tại, bỏ qua
    }
  }
  chrome.tabs.getCurrent((tab) => {
    if (tab) chrome.tabs.remove(tab.id);
  });
});
