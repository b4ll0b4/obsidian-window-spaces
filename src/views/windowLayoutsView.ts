import { ItemView, Scope, WorkspaceLeaf } from "obsidian";
import { WindowLayoutsModal } from "../modals/restoreModal";
import { t } from "../i18n";
import WindowSpacesPlugin from "../main";

export const WINDOW_LAYOUTS_VIEW_TYPE = "window-spaces-layouts";

export type WindowLayoutsPanelLocation = "left" | "right" | "tab";

/**
 * Persistent version of the Window Layouts picker.
 *
 * The content is rendered by WindowLayoutsModal so both entry points keep the
 * same restore semantics. Unlike a modal, this view deliberately remains
 * mounted after a layout is restored.
 */
export class WindowLayoutsView extends ItemView {
  private plugin: WindowSpacesPlugin;
  private contentController?: WindowLayoutsModal;
  navigation = false;

  constructor(leaf: WorkspaceLeaf, plugin: WindowSpacesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return WINDOW_LAYOUTS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("common.windowLayouts");
  }

  getIcon(): string {
    return "layout";
  }

  async onOpen(): Promise<void> {
    this.containerEl.closest(".workspace-leaf")?.classList.add("mod-window-spaces-leaf");
    this.contentController = new WindowLayoutsModal(this.app, this.plugin);
    // 指派 View scope：Obsidian 只在這個 leaf 是 active leaf 時，才把按鍵交給它
    // （keymap 的 workspace scope 會動態查詢 activeLeaf.view.scope）。因此
    // 「panel 取得 mouse focus 但輸入框沒有 keyboard focus」時上下鍵仍然可用，
    // 而 Quick Switcher / 選單 / 其他 modal 推上自己的 scope 時會自動讓位。
    this.scope = new Scope(this.app.scope);
    this.contentController.bindScope(this.scope);
    this.contentController.mountInContainer(this.contentEl);
  }

  async onClose(): Promise<void> {
    this.contentController?.unbindScope();
    this.contentController?.unmountFromContainer();
    this.contentController = undefined;
    this.scope = null;
  }
}

