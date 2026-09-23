import { describe, expect, test } from "vitest";
import { WindowSpacesSettingTab } from "../src/settings";
import { initI18n } from "../src/i18n";
import { ActivityBarItem } from "../src/types";

initI18n("en");

/**
 * 建立一個模仿 Obsidian `Setting` 的最小物件。
 *
 * 關鍵行為：宣告式設定框架在重繪時會**重用同一個 `settingEl`**，並重新呼叫 render callback
 * （`controlEl` 會被重置、但我們自己 append 進 `settingEl` 的節點不會被清掉）。
 */
function createFakeSetting(): { settingEl: HTMLElement; controlEl: HTMLElement } & Record<string, unknown> {
  const settingEl = document.createElement("div");
  settingEl.className = "setting-item";
  const controlEl = document.createElement("div");
  controlEl.className = "setting-item-control";
  settingEl.appendChild(controlEl);

  const setting = {
    settingEl,
    controlEl,
    addButton: (cb: (button: unknown) => void) => {
      const buttonEl = document.createElement("button");
      controlEl.appendChild(buttonEl);
      const button = {
        buttonEl,
        setIcon: () => button,
        setTooltip: () => button,
        setButtonText: () => button,
        setDestructive: () => button,
        onClick: () => button,
      };
      cb(button);
      return setting;
    },
  };
  return setting;
}

function createTab(): WindowSpacesSettingTab {
  const plugin = {
    settings: { activityBars: { left: [], right: [] } },
    activityBars: { refreshAll: () => undefined },
    saveSettings: async () => undefined,
  };
  return new WindowSpacesSettingTab({} as never, plugin as never);
}

describe("WindowSpacesSettingTab activity bar row rendering", () => {
  test("重複渲染同一列時不會累加拖曳把手（回歸：grip 1→2→3）", () => {
    const tab = createTab();
    const setting = createFakeSetting();
    const render = (viewType = "file-explorer") => {
      // 模擬宣告式框架的重繪：settingEl 重用、控制欄會被重置。
      setting.controlEl.empty();
      (tab as unknown as {
        renderActivityBarRow: (s: unknown, side: "left" | "right", i: ActivityBarItem) => void;
      }).renderActivityBarRow(setting, "left", { viewType, side: "left" });
    };

    render("file-explorer");
    expect(setting.settingEl.querySelectorAll(":scope > .window-spaces-activity-drag-handle")).toHaveLength(1);

    render("file-explorer");
    render("file-explorer");

    // 每次 update() 都只會有一個 grip，且仍在最前面。
    expect(setting.settingEl.querySelectorAll(":scope > .window-spaces-activity-drag-handle")).toHaveLength(1);
    expect(setting.settingEl.firstElementChild?.classList.contains("window-spaces-activity-drag-handle")).toBe(true);
    // 控制項不重複（icon / 還原 / Remove）
    expect(setting.controlEl.querySelectorAll("button")).toHaveLength(3);
  });

  test("列被重用給其他 view 時，drag payload 以 data-drag-view-type 為準", () => {
    const tab = createTab();
    const setting = createFakeSetting();
    const render = (viewType: string) => {
      setting.controlEl.empty();
      (tab as unknown as {
        renderActivityBarRow: (s: unknown, side: "left" | "right", i: ActivityBarItem) => void;
      }).renderActivityBarRow(setting, "left", { viewType, side: "left" });
    };

    render("file-explorer");
    render("search");

    setting.settingEl.dispatchEvent(new Event("dragstart", { bubbles: true }));

    expect(setting.settingEl.classList.contains("drag-source")).toBe(true);
    expect(setting.settingEl.getAttribute("data-drag-view-type")).toBe("search");
    expect(setting.settingEl.querySelectorAll(":scope > .window-spaces-activity-drag-handle")).toHaveLength(1);
  });
});
